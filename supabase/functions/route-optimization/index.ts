import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") || Deno.env.get("VITE_GOOGLE_MAPS_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface JobWithAddress {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  time_flexibility: string;
  route_optimization_locked: boolean;
  total_price: number | null;
  client_id: string;
  address_id: string | null;
  duration_minutes: number | null;
  address_lat?: number;
  address_lng?: number;
  address_string?: string;
}

// Round minutes up to nearest 5-minute increment
function roundUpTo5(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}

// Format total minutes from midnight as HH:MM string
function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Calculate sequential schedule times for an ordered list of jobs,
// accounting for each job's duration + travel time to the next job
function calculateSequentialTimes(
  jobOrder: string[],
  jobMap: Map<string, { duration_minutes: number }>,
  distanceMap: Map<string, number>,
  startMinutes: number
): { jobId: string; time: string; endMinutes: number }[] {
  const result: { jobId: string; time: string; endMinutes: number }[] = [];
  let currentMinutes = startMinutes;

  for (let i = 0; i < jobOrder.length; i++) {
    const jobId = jobOrder[i];
    const job = jobMap.get(jobId);
    const duration = job?.duration_minutes || 60; // default 60 min

    result.push({
      jobId,
      time: minutesToTime(currentMinutes),
      endMinutes: currentMinutes + duration,
    });

    // Add duration + travel time to next job
    if (i < jobOrder.length - 1) {
      const travelKey = `${jobId}->${jobOrder[i + 1]}`;
      const travelMinutes = distanceMap.get(travelKey) || 0;
      currentMinutes += duration + roundUpTo5(travelMinutes);
    }
  }

  return result;
}

// Calculate total time span for a sequential route (first job start to last job end)
function calculateSequentialRouteSpan(
  jobOrder: string[],
  jobMap: Map<string, { duration_minutes: number }>,
  distanceMap: Map<string, number>,
  startMinutes: number
): number {
  const times = calculateSequentialTimes(jobOrder, jobMap, distanceMap, startMinutes);
  if (times.length === 0) return 0;
  return times[times.length - 1].endMinutes - startMinutes;
}

interface DistanceResult {
  fromId: string;
  toId: string;
  durationMinutes: number;
}

// Get travel times between job locations using Google Distance Matrix
async function getDistanceMatrix(
  origins: { id: string; address: string }[],
  destinations: { id: string; address: string }[]
): Promise<DistanceResult[]> {
  if (!GOOGLE_MAPS_API_KEY || origins.length === 0 || destinations.length === 0) return [];

  const originAddresses = origins.map(o => encodeURIComponent(o.address)).join("|");
  const destAddresses = destinations.map(d => encodeURIComponent(d.address)).join("|");

  try {
    const resp = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originAddresses}&destinations=${destAddresses}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const data = await resp.json();

    if (data.status !== "OK") {
      console.error("Distance Matrix API error:", data.status);
      return [];
    }

    const results: DistanceResult[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      for (let j = 0; j < data.rows[i].elements.length; j++) {
        const el = data.rows[i].elements[j];
        if (el.status === "OK") {
          results.push({
            fromId: origins[i].id,
            toId: destinations[j].id,
            durationMinutes: Math.round(el.duration.value / 60),
          });
        }
      }
    }
    return results;
  } catch (err) {
    console.error("Distance Matrix fetch error:", err);
    return [];
  }
}

// Calculate total travel time for a route order
function calculateRouteTime(jobOrder: string[], distanceMap: Map<string, number>): number {
  let total = 0;
  for (let i = 0; i < jobOrder.length - 1; i++) {
    const key = `${jobOrder[i]}->${jobOrder[i + 1]}`;
    total += distanceMap.get(key) || 0;
  }
  return total;
}

// Simple nearest-neighbor optimization
function optimizeRoute(jobIds: string[], distanceMap: Map<string, number>): string[] {
  if (jobIds.length <= 2) return jobIds;

  const unvisited = new Set(jobIds);
  const route: string[] = [];
  let current = jobIds[0]; // Start with first job
  route.push(current);
  unvisited.delete(current);

  while (unvisited.size > 0) {
    let nearest = "";
    let minDist = Infinity;
    for (const id of unvisited) {
      const dist = distanceMap.get(`${current}->${id}`) || Infinity;
      if (dist < minDist) {
        minDist = dist;
        nearest = id;
      }
    }
    if (!nearest) break;
    route.push(nearest);
    unvisited.delete(nearest);
    current = nearest;
  }

  return route;
}

async function runOptimization(contractorId: string, supabase: any) {
  const today = new Date();
  const dates = [0, 1, 2].map(offset => {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    return d.toISOString().split("T")[0];
  });

  // Fetch jobs for today, tomorrow, and day after
  const { data: jobs } = await supabase
    .from("jobs")
    .select(`
      id, scheduled_date, scheduled_time, time_flexibility, route_optimization_locked,
      total_price, client_id, address_id, duration_minutes,
      clients!inner(address)
    `)
    .eq("contractor_id", contractorId)
    .in("scheduled_date", dates)
    .in("status", ["scheduled", "in_progress"])
    .order("scheduled_time");

  if (!jobs || jobs.length < 2) return null;

  // Parse addresses for distance calculation
  const jobsWithAddresses: (JobWithAddress & { address_string: string; time_slot: string })[] = [];
  for (const job of jobs) {
    const addr = job.clients?.address as any;
    if (!addr) continue;
    const addressStr = [addr.street, addr.city, addr.state, addr.postcode].filter(Boolean).join(", ");
    if (!addressStr) continue;

    // Determine time slot from scheduled_time
    let timeSlot = "morning";
    if (job.scheduled_time) {
      const hour = parseInt(job.scheduled_time.split(":")[0]);
      timeSlot = hour >= 12 ? "afternoon" : "morning";
    }

    jobsWithAddresses.push({
      ...job,
      address_string: addressStr,
      time_slot: timeSlot,
    });
  }

  if (jobsWithAddresses.length < 2) return null;

  // Build distance map per-day to avoid MAX_ELEMENTS_EXCEEDED (limit: 100 elements per request)
  const distanceMap = new Map<string, number>();

  async function fetchDistancesForJobs(jobs: typeof jobsWithAddresses) {
    if (jobs.length < 2) return;
    const locations = jobs.map(j => ({ id: j.id, address: j.address_string }));
    // Batch into chunks of 10 origins to stay under 100 elements (10x10=100)
    const BATCH_SIZE = 10;
    for (let i = 0; i < locations.length; i += BATCH_SIZE) {
      const originBatch = locations.slice(i, i + BATCH_SIZE);
      const distances = await getDistanceMatrix(originBatch, locations);
      for (const d of distances) {
        distanceMap.set(`${d.fromId}->${d.toId}`, d.durationMinutes);
      }
    }
  }

  // ── Run optimization per day (Level 1 & 3) ──
  const allResults: { level: number; timeSaved: number; status: string; date: string }[] = [];

  for (const date of dates) {
    const dayJobs = jobsWithAddresses.filter(j => j.scheduled_date === date);
    if (dayJobs.length < 2) continue;

    // Fetch distances for this day's jobs
    await fetchDistancesForJobs(dayJobs);
    
    // Build a job map for duration lookups
    const jobMap = new Map<string, { duration_minutes: number }>();
    for (const j of dayJobs) {
      jobMap.set(j.id, { duration_minutes: j.duration_minutes || 60 });
    }

    // Level 1: Within-Day Optimization (flexible jobs across all slots + time_restricted within their slot)
    const unlocked = dayJobs.filter(j => !j.route_optimization_locked);
    const flexibleDay = unlocked.filter(j => j.time_flexibility === "flexible");
    const restrictedMorning = unlocked.filter(j => j.time_flexibility === "time_restricted" && (j as any).time_slot === "morning");
    const restrictedAfternoon = unlocked.filter(j => j.time_flexibility === "time_restricted" && (j as any).time_slot === "afternoon");

    // Groups to optimize independently: morning starts at 7:00 (420min), afternoon at 12:00 (720min)
    const MORNING_START = 7 * 60; // 420
    const AFTERNOON_START = 12 * 60; // 720

    const optimizationGroups = [
      { jobs: flexibleDay, label: "flexible", startMinutes: MORNING_START },
      { jobs: restrictedMorning, label: "restricted-morning", startMinutes: MORNING_START },
      { jobs: restrictedAfternoon, label: "restricted-afternoon", startMinutes: AFTERNOON_START },
    ];

    let dayTimeSaved = 0;
    const dayUpdates: { jobId: string; time: string; origDate: string }[] = [];

    for (const group of optimizationGroups) {
      if (group.jobs.length < 2) continue;

      const currentOrder = group.jobs.map(j => j.id);
      const currentSpan = calculateSequentialRouteSpan(currentOrder, jobMap, distanceMap, group.startMinutes);
      const optimizedOrder = optimizeRoute(currentOrder, distanceMap);
      const optimizedSpan = calculateSequentialRouteSpan(optimizedOrder, jobMap, distanceMap, group.startMinutes);
      const saved = currentSpan - optimizedSpan;

      if (saved > 0) {
        dayTimeSaved += saved;
      }

      // Always set sequential times for optimized order (even if no time saved, times should be correct)
      const scheduledTimes = calculateSequentialTimes(optimizedOrder, jobMap, distanceMap, group.startMinutes);
      for (const st of scheduledTimes) {
        dayUpdates.push({
          jobId: st.jobId,
          time: st.time,
          origDate: date,
        });
      }
    }

    // Also schedule single-job groups with correct times
    for (const group of optimizationGroups) {
      if (group.jobs.length === 1) {
        const job = group.jobs[0];
        dayUpdates.push({
          jobId: job.id,
          time: minutesToTime(group.startMinutes),
          origDate: date,
        });
      }
    }

    // Always apply sequential time updates; log optimization if time was saved
    if (dayUpdates.length > 0) {
      for (const upd of dayUpdates) {
        await supabase.from("jobs").update({
          scheduled_time: upd.time,
          original_scheduled_date: upd.origDate,
        }).eq("id", upd.jobId);
      }

      if (dayTimeSaved > 0) {
        await supabase.from("route_optimizations").insert({
          contractor_id: contractorId,
          optimization_date: date,
          level: 1,
          time_saved_minutes: dayTimeSaved,
          status: "applied",
        });
      }

      allResults.push({ level: 1, timeSaved: dayTimeSaved, status: "applied", date });
    }

    // Level 3: Time-Restricted Slot Swapping (Requires Approval)
    const restrictedDay = dayJobs.filter(j => j.time_flexibility === "time_restricted" && !j.route_optimization_locked);

    if (restrictedDay.length >= 2) {
      const morningJobs = restrictedDay.filter((j: any) => j.time_slot === "morning");
      const afternoonJobs = restrictedDay.filter((j: any) => j.time_slot === "afternoon");

      if (morningJobs.length > 0 && afternoonJobs.length > 0) {
        const currentTotal = calculateRouteTime(morningJobs.map(j => j.id), distanceMap) +
          calculateRouteTime(afternoonJobs.map(j => j.id), distanceMap);

        const allIds = [...morningJobs.map(j => j.id), ...afternoonJobs.map(j => j.id)];
        const optimizedAll = optimizeRoute(allIds, distanceMap);
        const newMorning = optimizedAll.slice(0, morningJobs.length);
        const newAfternoon = optimizedAll.slice(morningJobs.length);
        const newTotal = calculateRouteTime(newMorning, distanceMap) + calculateRouteTime(newAfternoon, distanceMap);
        const timeSaved = currentTotal - newTotal;

        if (timeSaved > 5) {
          const { data: opt } = await supabase.from("route_optimizations").insert({
            contractor_id: contractorId,
            optimization_date: date,
            level: 3,
            time_saved_minutes: timeSaved,
            status: "pending_approval",
          }).select().single();

          if (opt) {
            const suggestions = [];
            for (const jobId of newMorning) {
              const origJob = restrictedDay.find(j => j.id === jobId) as any;
              if (origJob && origJob.time_slot !== "morning") {
                suggestions.push({
                  route_optimization_id: opt.id, job_id: jobId,
                  current_date_val: date, current_time_slot: origJob.time_slot,
                  suggested_date: date, suggested_time_slot: "morning",
                  requires_customer_approval: true,
                });
              }
            }
            for (const jobId of newAfternoon) {
              const origJob = restrictedDay.find(j => j.id === jobId) as any;
              if (origJob && origJob.time_slot !== "afternoon") {
                suggestions.push({
                  route_optimization_id: opt.id, job_id: jobId,
                  current_date_val: date, current_time_slot: origJob.time_slot,
                  suggested_date: date, suggested_time_slot: "afternoon",
                  requires_customer_approval: true,
                });
              }
            }

            if (suggestions.length > 0) {
              await supabase.from("route_optimization_suggestions").insert(suggestions);
            }

            const { data: contractor } = await supabase
              .from("contractors").select("user_id").eq("id", contractorId).single();

            if (contractor) {
              await supabase.from("notifications").insert({
                user_id: contractor.user_id,
                title: "🗺️ Route Optimization Available",
                message: `A route optimization could save you ${timeSaved} minutes on ${date}. Review the suggested changes.`,
                type: "route_optimization",
              });
            }
          }

          allResults.push({ level: 3, timeSaved, status: "pending_approval", date });
        }
      }
    }
  }

  // ── Level 2: Multi-Day Flexible Optimization ──
  const allFlexible = jobsWithAddresses.filter(j => j.time_flexibility === "flexible" && !j.route_optimization_locked);

  if (allFlexible.length >= 3) {
    // Calculate current total travel per day
    let currentTotalTime = 0;
    for (const date of dates) {
      const dayFlex = allFlexible.filter(j => j.scheduled_date === date);
      if (dayFlex.length >= 2) {
        currentTotalTime += calculateRouteTime(dayFlex.map(j => j.id), distanceMap);
      }
    }

    const allFlexIds = allFlexible.map(j => j.id);
    const optimizedAll = optimizeRoute(allFlexIds, distanceMap);
    
    // Distribute optimized order across the days proportionally
    const jobsPerDay = dates.map(date => allFlexible.filter(j => j.scheduled_date === date).length);
    const distributed: { date: string; jobIds: string[] }[] = [];
    let idx = 0;
    for (let d = 0; d < dates.length; d++) {
      const count = jobsPerDay[d];
      distributed.push({ date: dates[d], jobIds: optimizedAll.slice(idx, idx + count) });
      idx += count;
    }

    let newTotalTime = 0;
    for (const group of distributed) {
      if (group.jobIds.length >= 2) {
        newTotalTime += calculateRouteTime(group.jobIds, distanceMap);
      }
    }

    const timeSaved = currentTotalTime - newTotalTime;

    if (timeSaved > 5) {
      await supabase.from("route_optimizations").insert({
        contractor_id: contractorId,
        optimization_date: dates[0],
        level: 2,
        time_saved_minutes: timeSaved,
        status: "applied",
      });

      for (const group of distributed) {
        for (const jobId of group.jobIds) {
          const job = allFlexible.find(j => j.id === jobId);
          if (job && job.scheduled_date !== group.date) {
            await supabase.from("jobs").update({
              scheduled_date: group.date,
              original_scheduled_date: job.scheduled_date,
            }).eq("id", jobId);
          }
        }
      }

      allResults.push({ level: 2, timeSaved, status: "applied", date: dates[0] });
    }
  }

  if (allResults.length === 0) return null;

  // Return the most impactful result
  const totalSaved = allResults.reduce((sum, r) => sum + r.timeSaved, 0);
  const hasApproval = allResults.some(r => r.status === "pending_approval");
  return {
    level: Math.max(...allResults.map(r => r.level)),
    timeSaved: totalSaved,
    status: hasApproval ? "pending_approval" : "applied",
    details: allResults,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if this is an on-demand run for a specific contractor
    let requestedContractorId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        requestedContractorId = body.contractor_id || null;
      } catch { /* no body, run for all */ }
    }

    if (requestedContractorId) {
      // On-demand single contractor run
      const { data: contractor } = await supabase
        .from("contractors")
        .select("id, subscription_tier, user_id")
        .eq("id", requestedContractorId)
        .in("subscription_tier", ["pro", "team"])
        .eq("is_active", true)
        .single();

      if (!contractor) {
        return new Response(JSON.stringify({ error: "Contractor not eligible for optimization" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await runOptimization(contractor.id, supabase);
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch run for all eligible contractors (cron/scheduled)
    const { data: contractors } = await supabase
      .from("contractors")
      .select("id, subscription_tier, user_id")
      .in("subscription_tier", ["pro", "team"])
      .eq("is_active", true);

    if (!contractors || contractors.length === 0) {
      return new Response(JSON.stringify({ message: "No eligible contractors" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const contractor of contractors) {
      try {
        const result = await runOptimization(contractor.id, supabase);
        results.push({ contractorId: contractor.id, result });
      } catch (err) {
        console.error(`Optimization failed for ${contractor.id}:`, err);
        results.push({ contractorId: contractor.id, error: String(err) });
      }
    }

    // Also calculate teaser savings for Starter tier
    const { data: starterContractors } = await supabase
      .from("contractors")
      .select("id, user_id")
      .eq("subscription_tier", "starter")
      .eq("is_active", true);

    if (starterContractors) {
      for (const contractor of starterContractors) {
        try {
          const today = new Date().toISOString().split("T")[0];
          const { data: jobs } = await supabase
            .from("jobs")
            .select("id, scheduled_date, scheduled_time, time_flexibility, route_optimization_locked, client_id, clients!inner(address)")
            .eq("contractor_id", contractor.id)
            .eq("scheduled_date", today)
            .in("status", ["scheduled", "in_progress"]);

          if (jobs && jobs.length >= 2) {
            const locations = jobs.map((j: any) => {
              const addr = j.clients?.address as any;
              return { id: j.id, address: [addr?.street, addr?.city, addr?.state].filter(Boolean).join(", ") };
            }).filter((l: any) => l.address);

            if (locations.length >= 2) {
              const distances = await getDistanceMatrix(locations, locations);
              const distMap = new Map<string, number>();
              for (const d of distances) distMap.set(`${d.fromId}->${d.toId}`, d.durationMinutes);

              const currentTime = calculateRouteTime(locations.map((l: any) => l.id), distMap);
              const optimized = optimizeRoute(locations.map((l: any) => l.id), distMap);
              const optimizedTime = calculateRouteTime(optimized, distMap);
              const potentialSaving = currentTime - optimizedTime;

              if (potentialSaving > 15) {
                await supabase.from("notifications").insert({
                  user_id: contractor.user_id,
                  title: "💡 Route Optimization Available",
                  message: `Route Optimization could save you ${potentialSaving} minutes today! Upgrade to Pro to enable automatic scheduling.`,
                  type: "upgrade_teaser",
                });
              }
            }
          }
        } catch (err) {
          console.error(`Teaser calc failed for ${contractor.id}:`, err);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Route optimization error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
