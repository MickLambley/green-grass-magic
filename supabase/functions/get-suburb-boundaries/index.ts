import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SuburbRequest {
  name: string;
  lat: number;
  lng: number;
}

interface BoundaryResult {
  name: string;
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

    // Use service role to read/write boundary cache
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const suburbNames = suburbs.map((s) => s.name);

    // 1. Check cache for all suburbs at once
    const { data: cached } = await supabase
      .from("suburb_boundaries")
      .select("suburb_name, boundary")
      .in("suburb_name", suburbNames);

    const cachedMap = new Map<string, { lat: number; lng: number }[][] | null>();
    if (cached) {
      for (const row of cached) {
        cachedMap.set(row.suburb_name, row.boundary as any);
      }
    }

    // 2. Identify uncached suburbs
    const uncached = suburbs.filter((s) => !cachedMap.has(s.name));

    // 3. Fetch uncached from Nominatim (with 1.1s delay between requests)
    const newEntries: {
      suburb_name: string;
      boundary: any;
      centroid_lat: number;
      centroid_lng: number;
      source: string;
    }[] = [];

    for (let i = 0; i < uncached.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 1100));
      }
      const s = uncached[i];
      const boundary = await fetchFromNominatim(s.name, s.lat, s.lng);
      cachedMap.set(s.name, boundary);

      if (boundary) {
        newEntries.push({
          suburb_name: s.name,
          boundary,
          centroid_lat: s.lat,
          centroid_lng: s.lng,
          source: "nominatim",
        });
      } else {
        // Cache null result too (as empty array) to avoid re-fetching
        newEntries.push({
          suburb_name: s.name,
          boundary: [],
          centroid_lat: s.lat,
          centroid_lng: s.lng,
          source: "nominatim",
        });
      }
    }

    // 4. Bulk insert new entries (upsert to handle races)
    if (newEntries.length > 0) {
      await supabase
        .from("suburb_boundaries")
        .upsert(newEntries, { onConflict: "suburb_name,state" })
        .select();
    }

    // 5. Build response
    const results: BoundaryResult[] = suburbs.map((s) => ({
      name: s.name,
      boundary: cachedMap.get(s.name) || null,
    }));

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
