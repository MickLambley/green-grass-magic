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

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { address } = await req.json();
    if (!address || typeof address !== "string") {
      return new Response(JSON.stringify({ error: "Address string is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Geocoding not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const encoded = encodeURIComponent(address);
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&components=country:AU&key=${apiKey}`;
    
    const geocodeRes = await fetch(geocodeUrl);
    const geocodeData = await geocodeRes.json();

    if (geocodeData.status !== "OK" || !geocodeData.results?.[0]) {
      return new Response(
        JSON.stringify({ error: "Could not geocode address", status: geocodeData.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const location = geocodeData.results[0].geometry.location;
    const formattedAddress = geocodeData.results[0].formatted_address;

    return new Response(
      JSON.stringify({
        lat: location.lat,
        lng: location.lng,
        formatted_address: formattedAddress,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[GEOCODE] Error:", e);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
