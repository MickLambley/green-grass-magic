import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is a contractor
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: contractor } = await supabase
      .from("contractors")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!contractor) {
      return new Response(JSON.stringify({ error: "Not a contractor" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const { lat, lng, radius_km } = await req.json();

    if (typeof lat !== "number" || typeof lng !== "number" || typeof radius_km !== "number") {
      return new Response(JSON.stringify({ error: "lat, lng, and radius_km are required numbers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (radius_km < 1 || radius_km > 100) {
      return new Response(JSON.stringify({ error: "radius_km must be between 1 and 100" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Use service role to query the reference table (since it's public read anyway)
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calculate bounding box for initial filter (rough pre-filter)
    // 1 degree latitude ≈ 111 km
    const latDelta = radius_km / 111;
    // 1 degree longitude varies by latitude
    const lngDelta = radius_km / (111 * Math.cos((lat * Math.PI) / 180));

    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLng = lng - lngDelta;
    const maxLng = lng + lngDelta;

    // Fetch candidates within bounding box
    const { data: candidates, error: queryError } = await serviceSupabase
      .from("australian_postcodes")
      .select("suburb, postcode, state, lat, lng")
      .gte("lat", minLat)
      .lte("lat", maxLat)
      .gte("lng", minLng)
      .lte("lng", maxLng)
      .limit(5000);

    if (queryError) {
      console.error("[GET-SUBURBS] Query error:", queryError);
      throw new Error(queryError.message);
    }

    // Haversine distance filter
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371; // Earth radius in km

    const results = (candidates || [])
      .filter((c) => {
        const dLat = toRad(c.lat - lat);
        const dLng = toRad(c.lng - lng);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat)) * Math.cos(toRad(c.lat)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return dist <= radius_km;
      })
      .map((c) => ({ suburb: c.suburb, postcode: c.postcode, state: c.state }))
      // Deduplicate by suburb+postcode
      .filter((item, index, self) =>
        index === self.findIndex((t) => t.suburb === item.suburb && t.postcode === item.postcode)
      )
      .sort((a, b) => a.suburb.localeCompare(b.suburb));

    return new Response(
      JSON.stringify({ suburbs: results, count: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[GET-SUBURBS] Error:", e);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
