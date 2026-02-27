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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) throw new Error("Missing token");

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("id, line_items, total, notes, status, valid_until, created_at, client_id, contractor_id")
      .eq("token", token)
      .single();

    if (error || !quote) throw new Error("Quote not found");

    // Get contractor info
    const { data: contractor } = await supabase
      .from("contractors")
      .select("business_name, business_logo_url, primary_color, gst_registered, abn")
      .eq("id", quote.contractor_id)
      .single();

    // Get client name
    const { data: client } = await supabase
      .from("clients")
      .select("name")
      .eq("id", quote.client_id)
      .single();

    return new Response(
      JSON.stringify({
        quote: {
          line_items: quote.line_items,
          total: quote.total,
          notes: quote.notes,
          status: quote.status,
          valid_until: quote.valid_until,
          created_at: quote.created_at,
        },
        contractor: contractor || {},
        client: client || {},
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
