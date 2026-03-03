import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function fetchFromNominatim(
  suburbName: string,
  nearLat: number,
  nearLng: number
): Promise<{ lat: number; lng: number }[][] | null> {
  try {
    const query = encodeURIComponent(`${suburbName}, NSW, Australia`);
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
          (r.type === "suburb" || r.type === "town" || r.type === "village" ||
            r.type === "city" || r.type === "hamlet") &&
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
          rings.push(ring.map((coord: number[]) => ({ lat: coord[1], lng: coord[0] })));
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    // Parse optional params: batch_size, offset for resumability
    let batchSize = 50;
    let offset = 0;
    try {
      const body = await req.json();
      if (body.batch_size) batchSize = Math.min(body.batch_size, 200);
      if (body.offset) offset = body.offset;
    } catch { /* no body is fine */ }

    // Get distinct NSW suburbs not yet cached
    const { data: allNSW, error: fetchErr } = await supabase
      .from("australian_postcodes")
      .select("suburb, postcode, lat, lng")
      .eq("state", "NSW")
      .order("suburb")
      .range(offset, offset + 5000 - 1);

    if (fetchErr) throw new Error(fetchErr.message);
    if (!allNSW || allNSW.length === 0) {
      return new Response(
        JSON.stringify({ message: "No more NSW suburbs to process", offset }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicate by suburb+postcode, pick first lat/lng
    const uniqueMap = new Map<string, { lat: number; lng: number; postcode: string }>();
    for (const row of allNSW) {
      const key = `${row.suburb}|${row.postcode}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, { lat: Number(row.lat), lng: Number(row.lng), postcode: row.postcode });
      }
    }

    // Check which are already cached
    const suburbNames = [...new Set(allNSW.map((r: any) => r.suburb))];
    const { data: cached } = await supabase
      .from("suburb_boundaries")
      .select("suburb_name, postcode")
      .in("suburb_name", suburbNames);

    const cachedSet = new Set((cached || []).map((r) => `${r.suburb_name}|${r.postcode || ""}`));
    const uncached = [...uniqueMap.keys()].filter((k) => !cachedSet.has(k));

    console.log(`[PRELOAD] Found ${uncached.length} uncached NSW suburbs (offset=${offset})`);

    if (uncached.length === 0) {
      return new Response(
        JSON.stringify({ message: "All suburbs in this range already cached", offset, total_checked: suburbNames.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process in batch
    const toProcess = uncached.slice(0, batchSize);
    let fetched = 0;
    let failed = 0;

    for (const key of toProcess) {
      const entry = uniqueMap.get(key)!;
      const name = key.split("|")[0];
      const boundary = await fetchFromNominatim(name, entry.lat, entry.lng);

      const { error: insertErr } = await supabase
        .from("suburb_boundaries")
        .upsert({
          suburb_name: name,
          postcode: entry.postcode,
          boundary: boundary || [],
          centroid_lat: entry.lat,
          centroid_lng: entry.lng,
          source: "nominatim",
          state: "NSW",
        }, { onConflict: "suburb_name,state,postcode" });

      if (insertErr) {
        console.warn(`[PRELOAD] Insert failed for ${name}:`, insertErr.message);
        failed++;
      } else {
        fetched++;
      }

      // Nominatim rate limit: 1 req/sec
      await new Promise((r) => setTimeout(r, 1100));
    }

    const remaining = uncached.length - toProcess.length;

    return new Response(
      JSON.stringify({
        processed: fetched,
        failed,
        remaining_uncached: remaining,
        next_offset: offset + 5000,
        message: remaining > 0
          ? `Call again with same offset and batch_size to continue, or increase offset to skip ahead`
          : `All uncached suburbs in this range processed. Try next_offset to continue.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[PRELOAD] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
