import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") || Deno.env.get("VITE_GOOGLE_MAPS_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// AU bounding box (rough) — used to reject geocodes that fall outside Australia
const AU_BOUNDS = { minLat: -44, maxLat: -10, minLng: 112, maxLng: 154 };

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DaySchedule { enabled: boolean; start: string; end: string; }
interface WorkingHours {
  monday: DaySchedule; tuesday: DaySchedule; wednesday: DaySchedule;
  thursday: DaySchedule; friday: DaySchedule; saturday: DaySchedule; sunday: DaySchedule;
}
const DAY_NAMES: (keyof WorkingHours)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

interface JobRow {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  time_flexibility: string;
  route_optimization_locked: boolean;
  total_price: number | null;
  client_id: string;
  address_id: string | null;
  duration_minutes: number | null;
  title: string | null;
  status: string;
  clients: { name: string | null; address: any } | null;
}

interface PreparedJob {
  id: string;
  date: string;
  duration: number;
  flexibility: "flexible" | "time_restricted";
  locked: boolean;
  lockedTime: string | null; // for locked or anchored jobs
  originalTime: string | null;
  title: string;
  clientName: string;
  addressString: string;
  lat: number;
  lng: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function roundUpTo5(n: number): number { return Math.ceil(n / 5) * 5; }

function getDaySchedule(wh: WorkingHours, dateStr: string): DaySchedule | null {
  const d = new Date(dateStr + "T00:00:00");
  const sched = wh[DAY_NAMES[d.getDay()]];
  return sched?.enabled ? sched : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function estimateTravelMinutes(distKm: number): number {
  // Suburban driving ≈ 35 km/h average + 3 min buffer for parking/walking
  return roundUpTo5((distKm / 35) * 60 + 3);
}
function inAU(lat: number, lng: number): boolean {
  return lat >= AU_BOUNDS.minLat && lat <= AU_BOUNDS.maxLat
    && lng >= AU_BOUNDS.minLng && lng <= AU_BOUNDS.maxLng;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Maps integration (AU-restricted, batched correctly)
// ─────────────────────────────────────────────────────────────────────────────

interface RunStats {
  matrixCallsMade: number;
  matrixElementsRequested: number;
  fallbackPairs: number;
  geocodeCalls: number;
  geocodeRetries: number;
  usedFallbackDistances: boolean;
  apiErrors: string[];
  configError: string | null; // set if key/billing/quota is the real problem
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Statuses that indicate a hard configuration problem — no point retrying.
const FATAL_GEOCODE_STATUSES = new Set([
  "REQUEST_DENIED",       // bad key, referer/IP restriction, billing disabled
  "INVALID_REQUEST",      // malformed call
]);
// Statuses worth retrying with backoff.
const TRANSIENT_GEOCODE_STATUSES = new Set([
  "UNKNOWN_ERROR",
  "OVER_QUERY_LIMIT",
]);

// Returns coordinates, or one of two failure modes:
//   { unavailable: true, fatal?: boolean } — Google API itself failed (key/quota/network)
//   null                                   — API worked but address was unlocatable
async function geocodeAU(
  address: string,
  stats: RunStats,
  stage: "preflight" | "job_geocode" = "job_geocode",
): Promise<{ lat: number; lng: number } | { unavailable: true; fatal?: boolean } | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    const msg = "GOOGLE_MAPS_API_KEY is not configured";
    stats.apiErrors.push(msg);
    stats.configError = stats.configError || msg;
    console.warn(`[route-optimization] geocode FAIL stage=${stage}: ${msg}`);
    return { unavailable: true, fatal: true };
  }
  stats.geocodeCalls++;

  const MAX_ATTEMPTS = 3;
  let lastDetail = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json`
        + `?address=${encodeURIComponent(address)}`
        + `&region=au&components=country:AU`
        + `&key=${GOOGLE_MAPS_API_KEY}`;
      const resp = await fetch(url);

      // HTTP-level failure (5xx etc.) — retry
      if (!resp.ok && resp.status >= 500) {
        lastDetail = `HTTP ${resp.status}`;
        console.warn(`[route-optimization] geocode HTTP ${resp.status} stage=${stage} attempt=${attempt} address="${address}"`);
        if (attempt < MAX_ATTEMPTS) { stats.geocodeRetries++; await sleep(250 * attempt); continue; }
        stats.apiErrors.push(`Geocode HTTP ${resp.status} for "${address}"`);
        return { unavailable: true, fatal: false };
      }

      const data = await resp.json();
      const status = data?.status as string | undefined;

      if (status === "OK" || status === "ZERO_RESULTS") {
        const loc = data?.results?.[0]?.geometry?.location;
        if (!loc) return null; // unlocatable but API worked
        if (!inAU(loc.lat, loc.lng)) {
          stats.apiErrors.push(`Geocode fell outside AU for "${address}"`);
          return null;
        }
        return { lat: loc.lat, lng: loc.lng };
      }

      lastDetail = `${status} ${data?.error_message ?? ""}`.trim();

      if (FATAL_GEOCODE_STATUSES.has(status || "")) {
        const msg = `Geocode API ${status}: ${data?.error_message ?? "no detail"}`;
        stats.apiErrors.push(msg);
        stats.configError = stats.configError || msg;
        console.error(`[route-optimization] geocode FATAL stage=${stage} address="${address}" :: ${msg}`);
        return { unavailable: true, fatal: true };
      }

      if (TRANSIENT_GEOCODE_STATUSES.has(status || "")) {
        console.warn(`[route-optimization] geocode TRANSIENT stage=${stage} attempt=${attempt} address="${address}" :: ${lastDetail}`);
        if (attempt < MAX_ATTEMPTS) { stats.geocodeRetries++; await sleep(250 * attempt); continue; }
        stats.apiErrors.push(`Geocode ${status} after ${MAX_ATTEMPTS} attempts for "${address}"`);
        return { unavailable: true, fatal: false };
      }

      // Unknown non-OK status — log and treat as unlocatable
      stats.apiErrors.push(`Geocode unknown status=${status} for "${address}"`);
      console.warn(`[route-optimization] geocode UNKNOWN status=${status} stage=${stage} address="${address}"`);
      return null;
    } catch (err) {
      lastDetail = String(err);
      console.warn(`[route-optimization] geocode FETCH-ERR stage=${stage} attempt=${attempt} address="${address}" :: ${lastDetail}`);
      if (attempt < MAX_ATTEMPTS) { stats.geocodeRetries++; await sleep(250 * attempt); continue; }
      stats.apiErrors.push(`Geocode fetch failed for "${address}": ${lastDetail}`);
      return { unavailable: true, fatal: false };
    }
  }
  // Should not be reached, but keep TS happy
  return { unavailable: true, fatal: false };
}

interface DistanceCell { fromId: string; toId: string; durationMinutes: number; }

// Minimum buffer (minutes) added to every non-zero leg so two jobs on the
// same street still get a parking/walk gap. Matches the +3 buffer used in
// the Haversine fallback, rounded up to a 5-minute slot.
const MIN_TRAVEL_BUFFER_MIN = 5;

function travelBetween(fromId: string, toId: string, dist: Map<string, number>): number {
  if (fromId === toId) return 0;
  const raw = dist.get(`${fromId}->${toId}`) ?? 0;
  if (raw <= 0) return MIN_TRAVEL_BUFFER_MIN;
  return Math.max(MIN_TRAVEL_BUFFER_MIN, roundUpTo5(raw));
}

async function distanceMatrixBatch(
  origins: { id: string; address: string }[],
  destinations: { id: string; address: string }[],
  sameDay: boolean,
  stats: RunStats,
): Promise<DistanceCell[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    stats.usedFallbackDistances = true;
    return [];
  }
  if (origins.length === 0 || destinations.length === 0) return [];

  const params = new URLSearchParams({
    origins: origins.map(o => o.address).join("|"),
    destinations: destinations.map(d => d.address).join("|"),
    mode: "driving",
    units: "metric",
    region: "au",
    key: GOOGLE_MAPS_API_KEY,
  });
  if (sameDay) {
    params.set("departure_time", "now");
    params.set("traffic_model", "best_guess");
  }

  stats.matrixCallsMade++;
  stats.matrixElementsRequested += origins.length * destinations.length;

  try {
    const resp = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`);
    const data = await resp.json();
    if (data.status !== "OK") {
      stats.apiErrors.push(`Distance Matrix status=${data.status} ${data.error_message ?? ""}`);
      stats.usedFallbackDistances = true;
      return [];
    }
    const cells: DistanceCell[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      for (let j = 0; j < data.rows[i].elements.length; j++) {
        const el = data.rows[i].elements[j];
        if (el.status === "OK") {
          const seconds = el.duration_in_traffic?.value ?? el.duration?.value;
          if (typeof seconds === "number") {
            cells.push({
              fromId: origins[i].id,
              toId: destinations[j].id,
              durationMinutes: Math.max(1, Math.round(seconds / 60)),
            });
          }
        }
      }
    }
    return cells;
  } catch (err) {
    stats.apiErrors.push(`Distance Matrix fetch failed: ${String(err)}`);
    stats.usedFallbackDistances = true;
    return [];
  }
}

/**
 * Build a complete distance map for a set of jobs.
 * Batches origins AND destinations into <=10 chunks (Google's per-call limit
 * is 100 elements = 10x10). For any pair the API doesn't return, falls back
 * to Haversine using the pre-geocoded lat/lng — never leaves a pair at 0.
 */
async function buildDistanceMap(
  jobs: PreparedJob[],
  sameDay: boolean,
  stats: RunStats,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (jobs.length < 2) return map;

  const points = jobs.map(j => ({ id: j.id, address: j.addressString }));
  const CHUNK = 10;

  for (let i = 0; i < points.length; i += CHUNK) {
    const oBatch = points.slice(i, i + CHUNK);
    for (let j = 0; j < points.length; j += CHUNK) {
      const dBatch = points.slice(j, j + CHUNK);
      const cells = await distanceMatrixBatch(oBatch, dBatch, sameDay, stats);
      for (const c of cells) map.set(`${c.fromId}->${c.toId}`, c.durationMinutes);
    }
  }

  // Fill any missing pair with Haversine — never let a missing pair become 0
  const byId = new Map(jobs.map(j => [j.id, j]));
  for (const a of jobs) {
    for (const b of jobs) {
      if (a.id === b.id) continue;
      const key = `${a.id}->${b.id}`;
      if (map.has(key)) continue;
      const fa = byId.get(a.id)!;
      const fb = byId.get(b.id)!;
      const km = haversineKm(fa.lat, fa.lng, fb.lat, fb.lng);
      map.set(key, estimateTravelMinutes(km));
      stats.fallbackPairs++;
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// TSP solver: multi-start nearest-neighbour + 2-opt
// ─────────────────────────────────────────────────────────────────────────────

function totalRouteMinutes(order: string[], dist: Map<string, number>): number {
  let t = 0;
  for (let i = 0; i < order.length - 1; i++) {
    t += travelBetween(order[i], order[i + 1], dist);
  }
  return t;
}

function nearestNeighbour(start: string, ids: string[], dist: Map<string, number>): string[] {
  const remaining = new Set(ids);
  remaining.delete(start);
  const route = [start];
  let cur = start;
  while (remaining.size > 0) {
    let best = "";
    let bestD = Infinity;
    for (const id of remaining) {
      const d = travelBetween(cur, id, dist);
      if (d < bestD) { bestD = d; best = id; }
    }
    if (!best) { // shouldn't happen, but be defensive
      for (const id of remaining) { best = id; break; }
    }
    route.push(best);
    remaining.delete(best);
    cur = best;
  }
  return route;
}

function twoOpt(order: string[], dist: Map<string, number>): string[] {
  if (order.length < 4) return order;
  let best = order.slice();
  let bestT = totalRouteMinutes(best, dist);
  let improved = true;
  let safety = 0;
  while (improved && safety++ < 50) {
    improved = false;
    for (let i = 1; i < best.length - 2; i++) {
      for (let k = i + 1; k < best.length - 1; k++) {
        const candidate = best.slice(0, i)
          .concat(best.slice(i, k + 1).reverse())
          .concat(best.slice(k + 1));
        const t = totalRouteMinutes(candidate, dist);
        if (t + 0.001 < bestT) {
          best = candidate;
          bestT = t;
          improved = true;
        }
      }
    }
  }
  return best;
}

function solveTSP(ids: string[], dist: Map<string, number>): string[] {
  if (ids.length <= 1) return ids.slice();
  if (ids.length === 2) {
    const a = [ids[0], ids[1]];
    const b = [ids[1], ids[0]];
    return totalRouteMinutes(a, dist) <= totalRouteMinutes(b, dist) ? a : b;
  }
  // Multi-start NN: try every job as start, keep best after 2-opt
  let best: string[] = ids.slice();
  let bestT = Infinity;
  // Cap starts at 12 to keep edge function fast for large days
  const starts = ids.length <= 12 ? ids : ids.slice(0, 12);
  for (const s of starts) {
    const nn = nearestNeighbour(s, ids, dist);
    const opt = twoOpt(nn, dist);
    const t = totalRouteMinutes(opt, dist);
    if (t < bestT) { bestT = t; best = opt; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling: lay jobs out on the timeline respecting locked anchors
// ─────────────────────────────────────────────────────────────────────────────

interface ScheduledJob { jobId: string; time: string; }

/**
 * Place an ordered list of unlocked jobs starting at `startMin`, while
 * respecting locked anchors (lockedJobs each have a fixed scheduled_time).
 * If an unlocked job would overlap a locked anchor, it is pushed to after
 * the anchor (anchor + duration + travel-to-anchor's predecessor's travel).
 */
function layoutDay(
  orderedUnlocked: PreparedJob[],
  lockedJobs: PreparedJob[],
  dist: Map<string, number>,
  startMin: number,
  endMin: number,
): { scheduled: ScheduledJob[]; overflow: PreparedJob[] } {
  const scheduled: ScheduledJob[] = [];
  const overflow: PreparedJob[] = [];

  // Build a sorted list of locked occupied intervals
  const lockedIntervals = lockedJobs
    .filter(l => l.lockedTime)
    .map(l => {
      const s = timeToMinutes(l.lockedTime!);
      return { start: s, end: s + l.duration, id: l.id };
    })
    .sort((a, b) => a.start - b.start);

  // Track current cursor and last placed unlocked job (for travel calc)
  let cursor = startMin;
  let lastPlacedId: string | null = null;

  function clearsLocked(start: number, end: number): { ok: boolean; pushTo?: number } {
    for (const iv of lockedIntervals) {
      if (start < iv.end && end > iv.start) {
        return { ok: false, pushTo: iv.end };
      }
    }
    return { ok: true };
  }

  for (const job of orderedUnlocked) {
    // Add travel from previous (locked or unlocked) — pick whichever is most recent
    if (lastPlacedId) {
      cursor += roundUpTo5(dist.get(`${lastPlacedId}->${job.id}`) ?? 0);
    }
    let attempt = cursor;
    // Find a slot that doesn't collide with any locked anchor
    let safety = 0;
    while (safety++ < 20) {
      const c = clearsLocked(attempt, attempt + job.duration);
      if (c.ok) break;
      attempt = roundUpTo5(c.pushTo!);
    }
    if (attempt + job.duration > endMin) {
      overflow.push(job);
      continue;
    }
    scheduled.push({ jobId: job.id, time: minutesToTime(attempt) });
    cursor = attempt + job.duration;
    lastPlacedId = job.id;
  }
  return { scheduled, overflow };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main routine
// ─────────────────────────────────────────────────────────────────────────────

async function runOptimization(contractorId: string, supabase: any, dryRun = false) {
  const stats: RunStats = {
    matrixCallsMade: 0,
    matrixElementsRequested: 0,
    fallbackPairs: 0,
    geocodeCalls: 0,
    geocodeRetries: 0,
    usedFallbackDistances: false,
    apiErrors: [],
    configError: null,
  };

  const { data: contractorData } = await supabase
    .from("contractors")
    .select("working_hours, user_id")
    .eq("id", contractorId)
    .single();

  const defaultSchedule: DaySchedule = { enabled: true, start: "07:00", end: "17:00" };
  const defaultWH: WorkingHours = {
    monday: defaultSchedule, tuesday: defaultSchedule, wednesday: defaultSchedule,
    thursday: defaultSchedule, friday: defaultSchedule,
    saturday: { enabled: false, start: "08:00", end: "14:00" },
    sunday: { enabled: false, start: "08:00", end: "14:00" },
  };
  const wh: WorkingHours = (contractorData?.working_hours as WorkingHours) || defaultWH;

  const today = new Date();
  const dates = [0, 1, 2].map(off => {
    const d = new Date(today);
    d.setDate(today.getDate() + off);
    return d.toISOString().split("T")[0];
  });
  const todayStr = dates[0];

  const { data: rawJobs } = await supabase
    .from("jobs")
    .select(`
      id, scheduled_date, scheduled_time, time_flexibility, route_optimization_locked,
      total_price, client_id, address_id, duration_minutes, title, status,
      clients!inner(name, address)
    `)
    .eq("contractor_id", contractorId)
    .in("scheduled_date", dates)
    .in("status", ["scheduled", "in_progress"])
    .order("scheduled_time");

  const jobs = (rawJobs as JobRow[] | null) ?? [];
  if (jobs.length === 0) {
    return {
      timeSaved: 0,
      proposedChanges: [],
      message: "No eligible jobs found in the next 3 days.",
      usedFallbackDistances: false,
      stats,
    };
  }

  // ── STRICT ADDRESS VALIDATION ──
  // Require street + state + (city OR postcode). Anything weaker is reported.
  const missing: { jobId: string; jobTitle: string; clientName: string; clientId: string }[] = [];
  for (const j of jobs) {
    const a = j.clients?.address as any;
    const street = a?.street?.trim?.() || "";
    const city = a?.city?.trim?.() || "";
    const state = a?.state?.trim?.() || "";
    const postcode = a?.postcode?.trim?.() || "";
    if (!street || !state || (!city && !postcode)) {
      missing.push({
        jobId: j.id,
        jobTitle: j.title || "Job",
        clientName: j.clients?.name || "Unknown",
        clientId: j.client_id,
      });
    }
  }
  if (missing.length > 0) {
    return {
      error: "missing_addresses",
      affectedJobs: missing,
      message: `Route optimisation cannot run — ${missing.length} job(s) have an incomplete address (street, suburb/postcode and state are required). Add full addresses to continue.`,
    };
  }

  // ── PRE-FLIGHT: verify the Geocoding API actually works for us.
  // Only fail hard for *fatal* config errors (REQUEST_DENIED / no key / billing).
  // Transient blips here are tolerated and we continue; per-job retries handle them.
  const preflight = await geocodeAU("Sydney NSW 2000, Australia", stats, "preflight");
  if (preflight && (preflight as any).unavailable && (preflight as any).fatal) {
    console.error(`[route-optimization] preflight FATAL contractor=${contractorId} :: ${stats.configError}`);
    return {
      error: "map_service_misconfigured",
      message: "Map routing isn't configured correctly on the server. Please contact support so they can re-enable it.",
      apiErrors: stats.apiErrors,
    };
  }

  // ── GEOCODE EVERY JOB ONCE ──
  // Use stored coordinates first; geocode and persist back when missing.
  const geocodeCache = new Map<string, { lat: number; lng: number }>();
  const prepared: PreparedJob[] = [];
  const ungeocodable: { jobId: string; jobTitle: string; clientName: string; clientId: string }[] = [];
  // Track which clients we successfully geocoded so we can persist coords once.
  const coordsToPersist: { clientId: string; address: any; lat: number; lng: number }[] = [];
  const persistedClients = new Set<string>();

  for (const j of jobs) {
    const a = j.clients?.address as any;
    const addressString = [a.street, a.city, a.state, a.postcode, "Australia"].filter(Boolean).join(", ");

    let coords: { lat: number; lng: number } | null = null;
    let coordsFromCache = false;

    if (typeof a?.lat === "number" && typeof a?.lng === "number" && inAU(a.lat, a.lng)) {
      coords = { lat: a.lat, lng: a.lng };
      coordsFromCache = true;
    } else if (geocodeCache.has(addressString)) {
      coords = geocodeCache.get(addressString)!;
      coordsFromCache = true;
    } else {
      const result = await geocodeAU(addressString, stats, "job_geocode");
      if (result && (result as any).unavailable) {
        // FATAL = configuration problem affecting every call → bail out.
        if ((result as any).fatal) {
          console.error(`[route-optimization] job geocode FATAL client="${j.clients?.name}" address="${addressString}" :: ${stats.configError}`);
          return {
            error: "map_service_misconfigured",
            message: "Map routing isn't configured correctly on the server. Please contact support so they can re-enable it.",
            apiErrors: stats.apiErrors,
          };
        }
        // Transient: report this specific job as needing review instead of nuking the run.
        console.warn(`[route-optimization] job geocode TRANSIENT-FAIL client="${j.clients?.name}" address="${addressString}"`);
        ungeocodable.push({
          jobId: j.id,
          jobTitle: j.title || "Job",
          clientName: j.clients?.name || "Unknown",
          clientId: j.client_id,
        });
        continue;
      }
      coords = result as { lat: number; lng: number } | null;
      if (coords) geocodeCache.set(addressString, coords);
    }

    if (!coords) {
      ungeocodable.push({
        jobId: j.id,
        jobTitle: j.title || "Job",
        clientName: j.clients?.name || "Unknown",
        clientId: j.client_id,
      });
      continue;
    }

    // Schedule a one-time persist of coordinates back to the client record so
    // future runs don't need to call Google again for this address.
    if (!coordsFromCache && !persistedClients.has(j.client_id)) {
      persistedClients.add(j.client_id);
      coordsToPersist.push({ clientId: j.client_id, address: a, lat: coords.lat, lng: coords.lng });
    }

    prepared.push({
      id: j.id,
      date: j.scheduled_date,
      duration: j.duration_minutes || 60,
      flexibility: j.time_flexibility === "flexible" ? "flexible" : "time_restricted",
      locked: !!j.route_optimization_locked,
      lockedTime: j.route_optimization_locked ? (j.scheduled_time || null) : null,
      originalTime: j.scheduled_time,
      title: j.title || "Job",
      clientName: j.clients?.name || "Unknown",
      addressString,
      lat: coords.lat,
      lng: coords.lng,
    });
  }

  // Persist newly geocoded coordinates back onto the client address JSON.
  // Best-effort; failures here must never stop the optimisation.
  for (const c of coordsToPersist) {
    try {
      const merged = { ...(c.address || {}), lat: c.lat, lng: c.lng };
      await supabase.from("clients").update({ address: merged }).eq("id", c.clientId);
    } catch (e) {
      console.warn(`[route-optimization] persist coords FAIL client=${c.clientId}: ${String(e)}`);
    }
  }

  if (ungeocodable.length > 0) {
    return {
      error: "missing_addresses",
      affectedJobs: ungeocodable,
      message: `Route optimisation cannot run — ${ungeocodable.length} address(es) couldn't be located on the map. Verify the street, suburb and postcode are correct Australian addresses.`,
    };
  }

  // ── Per-day optimisation ──
  const proposedChanges: { jobId: string; title: string; clientName: string; date: string; currentTime: string | null; newTime: string }[] = [];
  const overflowJobs: { jobId: string; title: string; clientName: string; date: string }[] = [];
  let totalTimeSaved = 0;

  for (const date of dates) {
    const sched = getDaySchedule(wh, date);
    if (!sched) continue;
    const dayJobs = prepared.filter(p => p.date === date);
    if (dayJobs.length === 0) continue;

    const sameDay = date === todayStr;
    const dist = await buildDistanceMap(dayJobs, sameDay, stats);

    const WORK_START = timeToMinutes(sched.start);
    const WORK_END = timeToMinutes(sched.end);
    const MIDPOINT = Math.floor((WORK_START + WORK_END) / 2);

    const lockedJobs = dayJobs.filter(j => j.locked && j.lockedTime);
    const unlocked = dayJobs.filter(j => !(j.locked && j.lockedTime));

    // Time-restricted jobs keep their morning/afternoon allegiance based on
    // their CURRENT scheduled time. Untimed restricted jobs default to morning.
    function slotOf(j: PreparedJob): "morning" | "afternoon" {
      if (j.flexibility === "flexible") return "morning"; // grouped with morning band
      if (!j.originalTime) return "morning";
      return timeToMinutes(j.originalTime) >= MIDPOINT ? "afternoon" : "morning";
    }
    const morning = unlocked.filter(j => slotOf(j) === "morning");
    const afternoon = unlocked.filter(j => slotOf(j) === "afternoon");

    // Compute "before" travel time for the day using the original ordering
    const originalOrder = [...dayJobs]
      .sort((a, b) => (a.originalTime || "99:99").localeCompare(b.originalTime || "99:99"))
      .map(j => j.id);
    const beforeTravel = totalRouteMinutes(originalOrder, dist);

    // Optimise each band
    const morningOrderIds = solveTSP(morning.map(j => j.id), dist);
    const afternoonOrderIds = solveTSP(afternoon.map(j => j.id), dist);
    const morningOrdered = morningOrderIds.map(id => morning.find(j => j.id === id)!);
    const afternoonOrdered = afternoonOrderIds.map(id => afternoon.find(j => j.id === id)!);

    const morningResult = layoutDay(morningOrdered, lockedJobs, dist, WORK_START, MIDPOINT);
    const afternoonResult = layoutDay(afternoonOrdered, lockedJobs, dist, MIDPOINT, WORK_END);

    const allScheduled: ScheduledJob[] = [
      ...morningResult.scheduled,
      ...afternoonResult.scheduled,
      // Locked anchors keep their time
      ...lockedJobs.map(l => ({ jobId: l.id, time: l.lockedTime! })),
    ];

    // Recompute "after" travel time using the new sequence (sorted by time)
    const afterOrder = [...allScheduled]
      .sort((a, b) => a.time.localeCompare(b.time))
      .map(s => s.jobId);
    const afterTravel = totalRouteMinutes(afterOrder, dist);
    totalTimeSaved += Math.max(0, beforeTravel - afterTravel);

    // Track overflow (jobs that no longer fit the working day)
    for (const o of [...morningResult.overflow, ...afternoonResult.overflow]) {
      overflowJobs.push({ jobId: o.id, title: o.title, clientName: o.clientName, date });
    }

    // Diff against current scheduled_time
    const byId = new Map(dayJobs.map(j => [j.id, j]));
    for (const s of allScheduled) {
      const j = byId.get(s.jobId);
      if (!j) continue;
      if (j.locked) continue; // never propose changes to locked jobs
      if (j.originalTime !== s.time) {
        proposedChanges.push({
          jobId: s.jobId,
          title: j.title,
          clientName: j.clientName,
          date,
          currentTime: j.originalTime,
          newTime: s.time,
        });
      }
    }

    // Apply (only when not dry run)
    if (!dryRun) {
      for (const s of allScheduled) {
        const j = byId.get(s.jobId);
        if (!j || j.locked) continue;
        if (j.originalTime === s.time) continue;
        await supabase.from("jobs").update({
          scheduled_time: s.time,
          original_scheduled_time: j.originalTime,
          original_scheduled_date: date,
        }).eq("id", s.jobId);
      }

      if (beforeTravel - afterTravel > 0) {
        await supabase.from("route_optimizations").insert({
          contractor_id: contractorId,
          optimization_date: date,
          level: 1,
          time_saved_minutes: Math.max(0, beforeTravel - afterTravel),
          status: "applied",
        });
      }
    }
  }

  console.log("[route-optimization] stats", JSON.stringify({
    contractorId,
    ...stats,
    totalTimeSaved,
    proposedChangeCount: proposedChanges.length,
    overflowCount: overflowJobs.length,
  }));

  const message = totalTimeSaved > 0
    ? `Route optimised — saves ${totalTimeSaved} minutes of driving.`
    : proposedChanges.length > 0
      ? "Times have been re-aligned to the start of each working block."
      : "Your schedule is already optimised — no changes needed.";

  return {
    timeSaved: Math.max(0, totalTimeSaved),
    proposedChanges: dryRun ? proposedChanges : undefined,
    overflowJobs: overflowJobs.length > 0 ? overflowJobs : undefined,
    message,
    usedFallbackDistances: stats.usedFallbackDistances,
    fallbackPairs: stats.fallbackPairs,
    matrixCallsMade: stats.matrixCallsMade,
    apiErrors: stats.apiErrors.length > 0 ? stats.apiErrors.slice(0, 5) : undefined,
    level: 1,
    status: dryRun ? "potential" : "applied",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

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
        .from("contractors").select("id")
        .eq("id", requestedContractorId).eq("user_id", userId).maybeSingle();
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
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await runOptimization(contractor.id, supabase, isPreview);
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
      .from("contractors").select("id, subscription_tier, user_id")
      .in("subscription_tier", ["starter", "pro"]).eq("is_active", true);
    if (!contractors || contractors.length === 0) {
      return new Response(JSON.stringify({ message: "No eligible contractors" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    for (const contractor of contractors) {
      try {
        const result = await runOptimization(contractor.id, supabase, true);
        if (result && (result as any).timeSaved > 0) {
          await supabase.from("notifications").insert({
            user_id: contractor.user_id,
            title: "🗺️ Route Optimization Available",
            message: `Optimizing your routes could save ${(result as any).timeSaved} minutes over the next 3 days. Open Jobs → Run Optimization to apply.`,
            type: "route_optimization",
          });
        }
        results.push({ contractorId: contractor.id, result });
      } catch (err) {
        console.error(`Optimization failed for ${contractor.id}:`, err);
        results.push({ contractorId: contractor.id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Route optimization error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
