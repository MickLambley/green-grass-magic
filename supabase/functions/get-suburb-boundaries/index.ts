import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SuburbRequest {
  name: string;
  state?: string;
  lat: number;
  lng: number;
}

interface BoundaryResult {
  name: string;
  state?: string;
  boundary: { lat: number; lng: number }[][] | null;
}

async function fetchFromNominatim(
  suburbName: string,
  nearLat: number,
  nearLng: number
): Promise<{ lat: number; lng: number }[][] | null> {
  try {
    const query = encodeURIComponent(`${suburbName}, Australia`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&polygon_geojson=1&limit=3&countrycodes=au&viewbox=${nearLng - 0.5},${nearLat + 0.5},${nearLng + 0.5},${nearLat - 0.5}&bounded=0`;

    const res = await fetch(url, {
      headers: { "User-Agent": "YardlyApp/1.0" },
    });
    if (!res.ok) return null;

    const results = await res.json();
    if (!results || results.length === 0) return null;

    const match =
      results.find(
        (r: any) =>
          r.geojson &&
          (r.type === "suburb" ||
            r.type === "town" ||
            r.type === "village" ||
            r.type === "city" ||
            r.type === "hamlet") &&
          (r.geojson.type === "Polygon" || r.geojson.type === "MultiPolygon")
      ) ||
      results.find(
        (r: any) =>
          r.geojson &&
          (r.geojson.type === "Polygon" || r.geojson.type === "MultiPolygon")
      );

    if (!match?.geojson) return null;

    const geojson = match.geojson;

    if (geojson.type === "Polygon") {
      return geojson.coordinates.map((ring: number[][]) =>
        ring.map((coord: number[]) => ({ lat: coord[1], lng: coord[0] }))
      );
    } else if (geojson.type === "MultiPolygon") {
      const rings: { lat: number; lng: number }[][] = [];
      for (const polygon of geojson.coordinates) {
        for (const ring of polygon) {
          rings.push(
            ring.map((coord: number[]) => ({ lat: coord[1], lng: coord[0] }))
          );
        }
      }
      return rings;
    }

    return null;
  } catch (err) {
    console.warn(`Nominatim fetch failed for ${suburbName}:`, err);
    return null;
  }
}

// Run promises with limited concurrency
async function parallelLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
      // Small delay between requests from the same worker to be polite to Nominatim
      if (idx < tasks.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { suburbs } = (await req.json()) as { suburbs: SuburbRequest[] };

    if (!suburbs || !Array.isArray(suburbs) || suburbs.length === 0) {
      return new Response(JSON.stringify({ error: "suburbs array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const suburbNames = suburbs.map((s) => s.name);

    // 1. Check cache for all suburbs at once
    const { data: cached } = await supabase
      .from("suburb_boundaries")
      .select("suburb_name, state, boundary")
      .in("suburb_name", suburbNames);

    // Use name|state as cache key to avoid cross-state collisions
    const cachedMap = new Map<string, { lat: number; lng: number }[][] | null>();
    if (cached) {
      for (const row of cached) {
        const key = `${row.suburb_name}|${row.state || ""}`;
        cachedMap.set(key, row.boundary as any);
      }
    }

    // 2. Identify uncached suburbs (match by name AND state)
    const uncached = suburbs.filter((s) => {
      const key = `${s.name}|${s.state || ""}`;
      return !cachedMap.has(key);
    });

    // 3. Fetch uncached from Nominatim in parallel (3 concurrent workers)
    if (uncached.length > 0) {
      const tasks = uncached.map((s) => () => fetchFromNominatim(s.name, s.lat, s.lng));
      const boundaries = await parallelLimit(tasks, 3);

      const newEntries: {
        suburb_name: string;
        state: string;
        boundary: any;
        centroid_lat: number;
        centroid_lng: number;
        source: string;
      }[] = [];

      for (let i = 0; i < uncached.length; i++) {
        const s = uncached[i];
        const boundary = boundaries[i];
        const key = `${s.name}|${s.state || ""}`;
        cachedMap.set(key, boundary);

        newEntries.push({
          suburb_name: s.name,
          state: s.state || "",
          boundary: boundary || [],
          centroid_lat: s.lat,
          centroid_lng: s.lng,
          source: "nominatim",
        });
      }

      // 4. Bulk insert new entries
      if (newEntries.length > 0) {
        await supabase
          .from("suburb_boundaries")
          .upsert(newEntries, { onConflict: "suburb_name,state" })
          .select();
      }
    }

    // 5. Build response
    const results: BoundaryResult[] = suburbs.map((s) => {
      const key = `${s.name}|${s.state || ""}`;
      return {
        name: s.name,
        state: s.state,
        boundary: cachedMap.get(key) || null,
      };
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in get-suburb-boundaries:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
