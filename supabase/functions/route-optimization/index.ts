import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let usedFallbackDistances = false;
let distanceApiErrorMessage = "";

const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") || Deno.env.get("VITE_GOOGLE_MAPS_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

interface WorkingHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

const DAY_NAMES: (keyof WorkingHours)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"
];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function getDaySchedule(workingHours: WorkingHours, dateStr: string): DaySchedule | null {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = DAY_NAMES[d.getDay()];
  const schedule = workingHours[dayName];
  return schedule?.enabled ? schedule : null;
}

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

function roundUpTo5(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function getTravelMinutes(fromId: string, toId: string, distanceMap: Map<string, number>): number {
  if (fromId === toId) return 0;
  const travelKey = `${fromId}->${toId}`;
  return distanceMap.get(travelKey) || 0;
}

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
    const duration = job?.duration_minutes || 60;

    result.push({
      jobId,
      time: minutesToTime(currentMinutes),
      endMinutes: currentMinutes + duration,
    });

    if (i < jobOrder.length - 1) {
      const travelMinutes = getTravelMinutes(jobId, jobOrder[i + 1], distanceMap);
      currentMinutes += duration + roundUpTo5(travelMinutes);
    }
  }

  return result;
}

interface DistanceResult {
  fromId: string;
  toId: string;
  durationMinutes: number;
}

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fallback: estimate travel time using straight-line distance at 40 km/h, rounded to 5 mins
function estimateTravelMinutes(distKm: number): number {
  const minutes = (distKm / 40) * 60;
  return roundUpTo5(minutes);
}

async function getDistanceMatrix(
  origins: { id: string; address: string }[],
  destinations: { id: string; address: string }[]
): Promise<DistanceResult[]> {
  if (origins.length === 0 || destinations.length === 0) return [];
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not configured — using fallback distances");
    usedFallbackDistances = true;
    return [];
  }

  const originAddresses = origins.map(o => encodeURIComponent(o.address)).join("|");
  const destAddresses = destinations.map(d => encodeURIComponent(d.address)).join("|");

  try {
    const resp = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originAddresses}&destinations=${destAddresses}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const data = await resp.json();

    if (data.status !== "OK") {
      console.error("Distance Matrix API error:", data.status, data.error_message);
      usedFallbackDistances = true;
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
    usedFallbackDistances = true;
    return [];
  }
}

function calculateTotalTravelTime(jobOrder: string[], distanceMap: Map<string, number>): number {
  let total = 0;
  for (let i = 0; i < jobOrder.length - 1; i++) {
    total += getTravelMinutes(jobOrder[i], jobOrder[i + 1], distanceMap);
  }
  return total;
}

function optimizeRoute(jobIds: string[], distanceMap: Map<string, number>): string[] {
  if (jobIds.length <= 1) return jobIds;

  if (jobIds.length === 2) {
    const order1 = [jobIds[0], jobIds[1]];
    const order2 = [jobIds[1], jobIds[0]];
    const time1 = calculateTotalTravelTime(order1, distanceMap);
    const time2 = calculateTotalTravelTime(order2, distanceMap);
    return time2 < time1 ? order2 : order1;
  }

  // Nearest-neighbour heuristic
  const unvisited = new Set(jobIds);
  const route: string[] = [];
  let current = jobIds[0];
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

// Geocode addresses to lat/lng for fallback distance calculation
interface GeocodedJob {
  id: string;
  lat: number;
  lng: number;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;
  try {
    const resp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const data = await resp.json();
    if (data.results?.[0]?.geometry?.location) {
      return data.results[0].geometry.location;
    }
  } catch {}
  return null;
}

/**
 * Run optimization for a contractor.
 * When dryRun=true, only calculates potential savings (no DB updates to jobs).
 */
async function runOptimization(contractorId: string, supabase: any, dryRun = false) {
  usedFallbackDistances = false;
  distanceApiErrorMessage = "";

  const { data: contractorData } = await supabase
    .from("contractors")
    .select("working_hours, user_id")
    .eq("id", contractorId)
    .single();

  const jobDetailsMap = new Map<string, { title: string; client_name: string; current_time: string | null }>();

  const defaultSchedule: DaySchedule = { enabled: true, start: "07:00", end: "17:00" };
  const defaultWorkingHours: WorkingHours = {
    monday: defaultSchedule, tuesday: defaultSchedule, wednesday: defaultSchedule,
    thursday: defaultSchedule, friday: defaultSchedule,
    saturday: { enabled: false, start: "08:00", end: "14:00" },
    sunday: { enabled: false, start: "08:00", end: "14:00" },
  };
  const workingHours: WorkingHours = (contractorData?.working_hours as WorkingHours) || defaultWorkingHours;

  const today = new Date();
  const dates = [0, 1, 2].map(offset => {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    return d.toISOString().split("T")[0];
  });

  const { data: jobs } = await supabase
    .from("jobs")
    .select(`
      id, scheduled_date, scheduled_time, time_flexibility, route_optimization_locked,
      total_price, client_id, address_id, duration_minutes, title,
      clients!inner(address, name)
    `)
    .eq("contractor_id", contractorId)
    .in("scheduled_date", dates)
    .in("status", ["scheduled", "in_progress"])
    .order("scheduled_time");

  if (!jobs || jobs.length === 0) {
    return {
      timeSaved: 0,
      proposedChanges: [],
      message: "No eligible jobs found in the next 3 days.",
      usedFallbackDistances: false,
    };
  }

  // ── ADDRESS VALIDATION: Check all jobs have valid addresses ──
  const jobsMissingAddress: { jobId: string; jobTitle: string; clientName: string; clientId: string }[] = [];
  for (const job of jobs) {
    const addr = (job.clients as any)?.address as any;
    const street = addr?.street?.trim() || "";
    const city = addr?.city?.trim() || "";
    const postcode = addr?.postcode?.trim() || "";
    const hasStreet = street.length > 0;
    const hasCityOrPostcode = city.length > 0 || postcode.length > 0;
    if (!hasStreet || !hasCityOrPostcode) {
      jobsMissingAddress.push({
        jobId: job.id,
        jobTitle: job.title || "Job",
        clientName: (job.clients as any)?.name || "Unknown",
        clientId: job.client_id,
      });
    }
  }
  if (jobsMissingAddress.length > 0) {
    return {
      error: "missing_addresses",
      affectedJobs: jobsMissingAddress,
      message: `Route optimisation cannot run — ${jobsMissingAddress.length} job(s) have no address. Add addresses to continue.`,
    };
  }

  // ── BUG 1 FIX: Pre-process null times ──
  // Assign default times to jobs with no scheduled_time before any optimization
  for (const job of jobs) {
    if (job.route_optimization_locked) continue;
    if (job.scheduled_time && job.scheduled_time.trim() !== "") continue;

    const daySchedule = getDaySchedule(workingHours, job.scheduled_date);
    const workStart = daySchedule ? daySchedule.start : "07:00";
    const workEnd = daySchedule ? daySchedule.end : "17:00";
    const midpoint = minutesToTime(Math.floor((timeToMinutes(workStart) + timeToMinutes(workEnd)) / 2));

    // Default: assign work_start time
    let assignedTime = workStart;

    if (job.time_flexibility === "time_restricted") {
      // Check if there's a slot indicator — we infer from the current time or default to morning
      // Since jobs without time don't have slot info, default to morning = work_start
      assignedTime = workStart;
    }
    // flexible jobs also get work_start
    job.scheduled_time = assignedTime;
  }

  // Build job details and addresses
  const jobsWithAddresses: (JobWithAddress & { address_string: string; time_slot: string; address_coords?: { lat: number; lng: number } })[] = [];
  for (const job of jobs) {
    jobDetailsMap.set(job.id, {
      title: job.title || "Job",
      client_name: (job.clients as any)?.name || "Unknown",
      current_time: job.scheduled_time,
    });
    const addr = job.clients?.address as any;
    if (!addr) continue;
    const addressStr = [addr.street, addr.city, addr.state, addr.postcode].filter(Boolean).join(", ");
    if (!addressStr) continue;

    const daySchedule = getDaySchedule(workingHours, job.scheduled_date);
    const workStart = daySchedule ? timeToMinutes(daySchedule.start) : 7 * 60;
    const workEnd = daySchedule ? timeToMinutes(daySchedule.end) : 17 * 60;
    const midpoint = Math.floor((workStart + workEnd) / 2);

    let timeSlot = "morning";
    if (job.scheduled_time) {
      const jobMinutes = timeToMinutes(job.scheduled_time);
      timeSlot = jobMinutes >= midpoint ? "afternoon" : "morning";
    }

    jobsWithAddresses.push({
      ...job,
      address_string: addressStr,
      time_slot: timeSlot,
      address_coords: addr.lat && addr.lng ? { lat: addr.lat, lng: addr.lng } : undefined,
    });
  }

  // Even 1 job is valid now (for time assignment)
  if (jobsWithAddresses.length === 0) {
    return {
      timeSaved: 0,
      proposedChanges: [],
      message: "No jobs with valid addresses found.",
      usedFallbackDistances: false,
    };
  }

  const distanceMap = new Map<string, number>();

  async function fetchDistancesForJobs(dayJobs: typeof jobsWithAddresses) {
    if (dayJobs.length < 2) return;
    const locations = dayJobs.map(j => ({ id: j.id, address: j.address_string }));
    const BATCH_SIZE = 10;
    for (let i = 0; i < locations.length; i += BATCH_SIZE) {
      const originBatch = locations.slice(i, i + BATCH_SIZE);
      const distances = await getDistanceMatrix(originBatch, locations);
      for (const d of distances) {
        distanceMap.set(`${d.fromId}->${d.toId}`, d.durationMinutes);
      }
    }

    // ── BUG 4 FIX: Fallback to Haversine if API failed ──
    if (usedFallbackDistances) {
      // Try geocoding for fallback distances
      const coordsMap = new Map<string, { lat: number; lng: number }>();
      for (const j of dayJobs) {
        if (j.address_coords) {
          coordsMap.set(j.id, j.address_coords);
        }
      }

      // If we don't have coords, try geocoding
      if (coordsMap.size < dayJobs.length) {
        for (const j of dayJobs) {
          if (!coordsMap.has(j.id)) {
            const geo = await geocodeAddress(j.address_string);
            if (geo) coordsMap.set(j.id, geo);
          }
        }
      }

      // Calculate straight-line distances
      for (const from of dayJobs) {
        for (const to of dayJobs) {
          if (from.id === to.id) continue;
          const key = `${from.id}->${to.id}`;
          if (distanceMap.has(key)) continue;
          const fc = coordsMap.get(from.id);
          const tc = coordsMap.get(to.id);
          if (fc && tc) {
            const km = haversineKm(fc.lat, fc.lng, tc.lat, tc.lng);
            distanceMap.set(key, estimateTravelMinutes(km));
          } else {
            // Default fallback: 15 minutes between unknown locations
            distanceMap.set(key, 15);
          }
        }
      }
    }
  }

  const proposedChanges: { jobId: string; title: string; clientName: string; date: string; currentTime: string | null; newTime: string }[] = [];
  let totalTimeSaved = 0;

  for (const date of dates) {
    const daySchedule = getDaySchedule(workingHours, date);
    if (!daySchedule) continue;

    const dayJobs = jobsWithAddresses.filter(j => j.scheduled_date === date);
    if (dayJobs.length === 0) continue;

    await fetchDistancesForJobs(dayJobs);

    const jobMap = new Map<string, { duration_minutes: number }>();
    for (const j of dayJobs) {
      jobMap.set(j.id, { duration_minutes: j.duration_minutes || 60 });
    }

    const WORK_START = timeToMinutes(daySchedule.start);
    const WORK_END = timeToMinutes(daySchedule.end);
    const MIDPOINT = Math.floor((WORK_START + WORK_END) / 2);

    // Separate locked jobs (keep their times) from unlocked
    const lockedJobs = dayJobs.filter(j => j.route_optimization_locked);
    const unlocked = dayJobs.filter(j => !j.route_optimization_locked);

    const flexibleDay = unlocked.filter(j => j.time_flexibility === "flexible");
    const restrictedMorning = unlocked.filter(j => j.time_flexibility === "time_restricted" && (j as any).time_slot === "morning");
    const restrictedAfternoon = unlocked.filter(j => j.time_flexibility === "time_restricted" && (j as any).time_slot === "afternoon");

    const optimizationGroups = [
      { jobs: [...flexibleDay, ...restrictedMorning], label: "morning", startMinutes: WORK_START },
      { jobs: restrictedAfternoon, label: "afternoon", startMinutes: MIDPOINT },
    ];

    const dayUpdates: { jobId: string; time: string; origDate: string }[] = [];

    for (const group of optimizationGroups) {
      if (group.jobs.length === 0) continue;

      const currentOrder = group.jobs.map(j => j.id);

      // ── BUG 2 FIX: Always recalculate times from scratch ──
      // Calculate travel time for original order
      const originalTravelTime = calculateTotalTravelTime(currentOrder, distanceMap);

      // Find optimal order
      const optimizedOrder = group.jobs.length >= 2
        ? optimizeRoute(currentOrder, distanceMap)
        : currentOrder;

      const optimizedTravelTime = calculateTotalTravelTime(optimizedOrder, distanceMap);
      const saved = Math.max(0, originalTravelTime - optimizedTravelTime);
      totalTimeSaved += saved;

      // Always recalculate sequential times from the anchor
      const scheduledTimes = calculateSequentialTimes(optimizedOrder, jobMap, distanceMap, group.startMinutes);
      for (const st of scheduledTimes) {
        dayUpdates.push({
          jobId: st.jobId,
          time: st.time,
          origDate: date,
        });
      }
    }

    // Collect proposed changes
    for (const upd of dayUpdates) {
      const details = jobDetailsMap.get(upd.jobId);
      const currentTime = details?.current_time || null;
      if (currentTime !== upd.time) {
        proposedChanges.push({
          jobId: upd.jobId,
          title: details?.title || "Job",
          clientName: details?.client_name || "Unknown",
          date: upd.origDate,
          currentTime,
          newTime: upd.time,
        });
      }
    }

    // Apply changes if not dry run
    if (!dryRun && dayUpdates.length > 0) {
      for (const upd of dayUpdates) {
        await supabase.from("jobs").update({
          scheduled_time: upd.time,
          original_scheduled_date: upd.origDate,
        }).eq("id", upd.jobId);
      }

      if (totalTimeSaved > 0) {
        await supabase.from("route_optimizations").insert({
          contractor_id: contractorId,
          optimization_date: date,
          level: 1,
          time_saved_minutes: totalTimeSaved,
          status: "applied",
        });
      }
    }
  }

  // Level 2: Multi-Day Flexible Optimization — only on actual runs
  if (!dryRun) {
    const allFlexible = jobsWithAddresses.filter(j => j.time_flexibility === "flexible" && !j.route_optimization_locked);

    if (allFlexible.length >= 3) {
      let currentTotalTime = 0;
      for (const date of dates) {
        const dayFlex = allFlexible.filter(j => j.scheduled_date === date);
        if (dayFlex.length >= 2) {
          currentTotalTime += calculateTotalTravelTime(dayFlex.map(j => j.id), distanceMap);
        }
      }

      const allFlexIds = allFlexible.map(j => j.id);
      const optimizedAll = optimizeRoute(allFlexIds, distanceMap);

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
          newTotalTime += calculateTotalTravelTime(group.jobIds, distanceMap);
        }
      }

      const timeSaved = Math.max(0, currentTotalTime - newTotalTime);

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

        totalTimeSaved += timeSaved;
      }
    }
  }

  // ── BUG 3 FIX: Always return success ──
  const message = totalTimeSaved > 0
    ? `Route optimised — saves ${totalTimeSaved} minutes of driving.`
    : proposedChanges.length > 0
      ? "Your route is already optimised. Times have been set based on your working hours."
      : "Your schedule is already optimised — no changes needed.";

  return {
    timeSaved: Math.max(0, totalTimeSaved),
    proposedChanges: dryRun ? proposedChanges : undefined,
    message,
    usedFallbackDistances,
    level: 1,
    status: dryRun ? "potential" : "applied",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let requestedContractorId: string | null = null;
    let isPreview = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        requestedContractorId = body.contractor_id || null;
        isPreview = body.preview === true;
      } catch { /* no body, run for all */ }
    }

    if (requestedContractorId) {
      // ── User-invoked: require JWT auth and verify ownership ──
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
      const userClient = createClient(SUPABASE_URL, anonKey!, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub;

      const { data: ownerCheck } = await supabase
        .from("contractors")
        .select("id")
        .eq("id", requestedContractorId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!ownerCheck) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: contractor } = await supabase
        .from("contractors")
        .select("id, subscription_tier, user_id")
        .eq("id", requestedContractorId)
        .in("subscription_tier", ["starter", "pro"])
        .eq("is_active", true)
        .single();

      if (!contractor) {
        return new Response(JSON.stringify({ error: "Contractor not eligible for optimization" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await runOptimization(contractor.id, supabase, isPreview);
      // Always return success — never error for "no improvement"
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Cron/batch run ──
    const cronAuthHeader = req.headers.get("Authorization");
    const cronToken = cronAuthHeader?.replace("Bearer ", "");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isCronAuthorized = cronToken && (cronToken === cronSecret || cronToken === serviceRoleKey);
    if (!isCronAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contractors } = await supabase
      .from("contractors")
      .select("id, subscription_tier, user_id")
      .in("subscription_tier", ["starter", "pro"])
      .eq("is_active", true);

    if (!contractors || contractors.length === 0) {
      return new Response(JSON.stringify({ message: "No eligible contractors" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const contractor of contractors) {
      try {
        const result = await runOptimization(contractor.id, supabase, true);

        if (result && result.timeSaved > 0) {
          await supabase.from("notifications").insert({
            user_id: contractor.user_id,
            title: "🗺️ Route Optimization Available",
            message: `Optimizing your routes could save ${result.timeSaved} minutes over the next 3 days. Open Jobs → Run Optimization to apply.`,
            type: "route_optimization",
          });
        }

        results.push({ contractorId: contractor.id, result });
      } catch (err) {
        console.error(`Optimization failed for ${contractor.id}:`, err);
        results.push({ contractorId: contractor.id, error: String(err) });
      }
    }

    // Starter tier: teaser notifications
    const { data: starterContractors } = await supabase
      .from("contractors")
      .select("id, user_id")
      .eq("subscription_tier", "starter")
      .eq("is_active", true);

    if (starterContractors) {
      for (const contractor of starterContractors) {
        try {
          const todayStr = new Date().toISOString().split("T")[0];
          const { data: starterJobs } = await supabase
            .from("jobs")
            .select("id, scheduled_date, scheduled_time, time_flexibility, route_optimization_locked, client_id, clients!inner(address)")
            .eq("contractor_id", contractor.id)
            .eq("scheduled_date", todayStr)
            .in("status", ["scheduled", "in_progress"]);

          if (starterJobs && starterJobs.length >= 2) {
            const locations = starterJobs.map((j: any) => {
              const addr = j.clients?.address as any;
              return { id: j.id, address: [addr?.street, addr?.city, addr?.state].filter(Boolean).join(", ") };
            }).filter((l: any) => l.address);

            if (locations.length >= 2) {
              const distances = await getDistanceMatrix(locations, locations);
              const distMap = new Map<string, number>();
              for (const d of distances) distMap.set(`${d.fromId}->${d.toId}`, d.durationMinutes);

              const currentTime = calculateTotalTravelTime(locations.map((l: any) => l.id), distMap);
              const optimized = optimizeRoute(locations.map((l: any) => l.id), distMap);
              const optimizedTime = calculateTotalTravelTime(optimized, distMap);
              const potentialSaving = Math.max(0, currentTime - optimizedTime);

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
