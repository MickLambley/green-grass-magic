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

    const { token, action } = await req.json();
    if (!token || !action) throw new Error("Missing token or action");
    if (!["accepted", "declined"].includes(action)) throw new Error("Invalid action");

    // Find quote by token
    const { data: quote, error: qErr } = await supabase
      .from("quotes")
      .select("*, clients(name)")
      .eq("token", token)
      .single();

    if (qErr || !quote) throw new Error("Quote not found");

    if (quote.status === "accepted" || quote.status === "declined") {
      return new Response(
        JSON.stringify({ success: true, alreadyResponded: true, status: quote.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status
    const { error: updateErr } = await supabase
      .from("quotes")
      .update({ status: action })
      .eq("id", quote.id);

    if (updateErr) throw new Error("Failed to update quote");

    // Get contractor user_id for notification
    const { data: contractor } = await supabase
      .from("contractors")
      .select("user_id, business_name")
      .eq("id", quote.contractor_id)
      .single();

    if (contractor) {
      const clientName = (quote as any).clients?.name || "A client";
      await supabase.from("notifications").insert({
        user_id: contractor.user_id,
        title: `Quote ${action}`,
        message: `${clientName} has ${action} your quote for $${Number(quote.total).toFixed(2)}.`,
        type: action === "accepted" ? "success" : "info",
      });
    }

    console.log(`[RESPOND-QUOTE] Quote ${quote.id} ${action}`);

    return new Response(
      JSON.stringify({ success: true, status: action }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[RESPOND-QUOTE] ERROR:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
