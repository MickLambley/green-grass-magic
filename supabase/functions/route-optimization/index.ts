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
  address_lat?: number;
  address_lng?: number;
  address_string?: string;
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
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  // Fetch jobs for today and tomorrow with client addresses
  const { data: jobs } = await supabase
    .from("jobs")
    .select(`
      id, scheduled_date, scheduled_time, time_flexibility, route_optimization_locked,
      total_price, client_id, address_id,
      clients!inner(address)
    `)
    .eq("contractor_id", contractorId)
    .in("scheduled_date", [today, tomorrow])
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

  // Get all pairwise distances
  const locations = jobsWithAddresses.map(j => ({ id: j.id, address: j.address_string }));
  const distances = await getDistanceMatrix(locations, locations);

  const distanceMap = new Map<string, number>();
  for (const d of distances) {
    distanceMap.set(`${d.fromId}->${d.toId}`, d.durationMinutes);
  }

  // ── Level 1: Within-Day Flexible Optimization ──
  const todayJobs = jobsWithAddresses.filter(j => j.scheduled_date === today);
  const flexibleToday = todayJobs.filter(j => j.time_flexibility === "flexible" && !j.route_optimization_locked);
  const lockedToday = todayJobs.filter(j => j.route_optimization_locked);

  if (flexibleToday.length >= 2) {
    const currentOrder = flexibleToday.map(j => j.id);
    const currentTime = calculateRouteTime(currentOrder, distanceMap);
    const optimizedOrder = optimizeRoute(currentOrder, distanceMap);
    const optimizedTime = calculateRouteTime(optimizedOrder, distanceMap);
    const timeSaved = currentTime - optimizedTime;

    if (timeSaved > 30) {
      // Auto-apply Level 1
      const { data: opt } = await supabase.from("route_optimizations").insert({
        contractor_id: contractorId,
        optimization_date: today,
        level: 1,
        time_saved_minutes: timeSaved,
        status: "applied",
      }).select().single();

      // Reorder the flexible jobs
      for (let i = 0; i < optimizedOrder.length; i++) {
        const job = flexibleToday.find(j => j.id === optimizedOrder[i]);
        if (job) {
          const hour = 7 + Math.floor(i * 1.5); // Distribute across morning
          await supabase.from("jobs").update({
            scheduled_time: `${hour.toString().padStart(2, "0")}:00`,
            original_scheduled_date: job.scheduled_date,
          }).eq("id", job.id);
        }
      }

      return { level: 1, timeSaved, status: "applied" };
    }
  }

  // ── Level 2: Two-Day Flexible Optimization ──
  const tomorrowJobs = jobsWithAddresses.filter(j => j.scheduled_date === tomorrow);
  const flexibleAll = [...flexibleToday, ...tomorrowJobs.filter(j => j.time_flexibility === "flexible" && !j.route_optimization_locked)];

  if (flexibleAll.length >= 3) {
    // Try redistributing flexible jobs across today and tomorrow
    const allFlexIds = flexibleAll.map(j => j.id);
    const currentTotalTime = calculateRouteTime(flexibleToday.map(j => j.id), distanceMap) +
      calculateRouteTime(tomorrowJobs.filter(j => j.time_flexibility === "flexible").map(j => j.id), distanceMap);

    // Try moving some tomorrow jobs to today and vice versa
    const optimizedAll = optimizeRoute(allFlexIds, distanceMap);
    const half = Math.ceil(optimizedAll.length / 2);
    const newToday = optimizedAll.slice(0, half);
    const newTomorrow = optimizedAll.slice(half);
    const newTotalTime = calculateRouteTime(newToday, distanceMap) + calculateRouteTime(newTomorrow, distanceMap);
    const timeSaved = currentTotalTime - newTotalTime;

    if (timeSaved > 30) {
      const { data: opt } = await supabase.from("route_optimizations").insert({
        contractor_id: contractorId,
        optimization_date: today,
        level: 2,
        time_saved_minutes: timeSaved,
        status: "applied",
      }).select().single();

      // Apply date changes
      for (const jobId of newToday) {
        const job = flexibleAll.find(j => j.id === jobId);
        if (job && job.scheduled_date !== today) {
          await supabase.from("jobs").update({
            scheduled_date: today,
            original_scheduled_date: job.scheduled_date,
          }).eq("id", jobId);
        }
      }
      for (const jobId of newTomorrow) {
        const job = flexibleAll.find(j => j.id === jobId);
        if (job && job.scheduled_date !== tomorrow) {
          await supabase.from("jobs").update({
            scheduled_date: tomorrow,
            original_scheduled_date: job.scheduled_date,
          }).eq("id", jobId);
        }
      }

      return { level: 2, timeSaved, status: "applied" };
    }
  }

  // ── Level 3: Time-Restricted Slot Swapping (Requires Approval) ──
  const restrictedToday = todayJobs.filter(j => j.time_flexibility === "time_restricted" && !j.route_optimization_locked);

  if (restrictedToday.length >= 2) {
    // Try swapping morning/afternoon slots
    const morningJobs = restrictedToday.filter((j: any) => j.time_slot === "morning");
    const afternoonJobs = restrictedToday.filter((j: any) => j.time_slot === "afternoon");

    if (morningJobs.length > 0 && afternoonJobs.length > 0) {
      // Calculate current route time
      const currentMorningTime = calculateRouteTime(morningJobs.map(j => j.id), distanceMap);
      const currentAfternoonTime = calculateRouteTime(afternoonJobs.map(j => j.id), distanceMap);
      const currentTotal = currentMorningTime + currentAfternoonTime;

      // Try swapping some jobs between slots
      const allIds = [...morningJobs.map(j => j.id), ...afternoonJobs.map(j => j.id)];
      const optimizedAll = optimizeRoute(allIds, distanceMap);
      const newMorning = optimizedAll.slice(0, morningJobs.length);
      const newAfternoon = optimizedAll.slice(morningJobs.length);
      const newTotal = calculateRouteTime(newMorning, distanceMap) + calculateRouteTime(newAfternoon, distanceMap);
      const timeSaved = currentTotal - newTotal;

      if (timeSaved > 30) {
        // Create pending approval optimization
        const { data: opt } = await supabase.from("route_optimizations").insert({
          contractor_id: contractorId,
          optimization_date: today,
          level: 3,
          time_saved_minutes: timeSaved,
          status: "pending_approval",
        }).select().single();

        if (opt) {
          // Create suggestions for each moved job
          const suggestions = [];
          for (const jobId of newMorning) {
            const origJob = restrictedToday.find(j => j.id === jobId) as any;
            if (origJob && origJob.time_slot !== "morning") {
              suggestions.push({
                route_optimization_id: opt.id,
                job_id: jobId,
                current_date_val: today,
                current_time_slot: origJob.time_slot,
                suggested_date: today,
                suggested_time_slot: "morning",
                requires_customer_approval: true,
              });
            }
          }
          for (const jobId of newAfternoon) {
            const origJob = restrictedToday.find(j => j.id === jobId) as any;
            if (origJob && origJob.time_slot !== "afternoon") {
              suggestions.push({
                route_optimization_id: opt.id,
                job_id: jobId,
                current_date_val: today,
                current_time_slot: origJob.time_slot,
                suggested_date: today,
                suggested_time_slot: "afternoon",
                requires_customer_approval: true,
              });
            }
          }

          if (suggestions.length > 0) {
            await supabase.from("route_optimization_suggestions").insert(suggestions);
          }

          // Notify contractor
          const { data: contractor } = await supabase
            .from("contractors")
            .select("user_id")
            .eq("id", contractorId)
            .single();

          if (contractor) {
            await supabase.from("notifications").insert({
              user_id: contractor.user_id,
              title: "🗺️ Route Optimization Available",
              message: `A route optimization could save you ${timeSaved} minutes today. Review the suggested changes in your dashboard.`,
              type: "route_optimization",
            });
          }
        }

        return { level: 3, timeSaved, status: "pending_approval" };
      }
    }
  }

  return null;
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
