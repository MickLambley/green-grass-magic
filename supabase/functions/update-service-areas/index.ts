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

    const { suburbs } = await req.json();

    if (!Array.isArray(suburbs)) {
      return new Response(JSON.stringify({ error: "suburbs must be an array" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Validate each suburb entry
    for (const s of suburbs) {
      if (!s.suburb || !s.postcode || typeof s.suburb !== "string" || typeof s.postcode !== "string") {
        return new Response(
          JSON.stringify({ error: "Each suburb must have 'suburb' and 'postcode' string fields" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    // Use service role for transactional delete + insert
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete existing suburbs for this contractor
    const { error: deleteError } = await serviceSupabase
      .from("contractor_service_suburbs")
      .delete()
      .eq("contractor_id", contractor.id);

    if (deleteError) {
      console.error("[UPDATE-SERVICE-AREAS] Delete error:", deleteError);
      throw new Error(deleteError.message);
    }

    // Insert new suburbs
    if (suburbs.length > 0) {
      const rows = suburbs.map((s: { suburb: string; postcode: string }) => ({
        contractor_id: contractor.id,
        suburb: s.suburb,
        postcode: s.postcode,
      }));

      // Batch insert in chunks of 500
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await serviceSupabase
          .from("contractor_service_suburbs")
          .insert(batch);

        if (insertError) {
          console.error("[UPDATE-SERVICE-AREAS] Insert error:", insertError);
          throw new Error(insertError.message);
        }
      }
    }

    // Also update contractors table with service center coordinates
    // (lat/lng already stored from geocoding step)

    return new Response(
      JSON.stringify({ success: true, count: suburbs.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[UPDATE-SERVICE-AREAS] Error:", e);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
