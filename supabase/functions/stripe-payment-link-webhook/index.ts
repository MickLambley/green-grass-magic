import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: Record<string, unknown>) => {
  console.log(`[PAYMENT-LINK-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Webhook received");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const event = body;

    log("Event type", { type: event.type });

    // Handle checkout.session.completed from payment links
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const jobId = metadata.job_id;
      const contractorId = metadata.contractor_id;

      if (!jobId) {
        log("No job_id in metadata, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      log("Processing payment for job", { jobId, contractorId });

      // Update job payment status
      const { error: jobErr } = await supabase
        .from("jobs")
        .update({
          payment_status: "paid",
          payment_intent_id: session.payment_intent,
        })
        .eq("id", jobId);

      if (jobErr) {
        log("Failed to update job", { error: jobErr.message });
      }

      // Update linked invoice
      const { error: invErr } = await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("job_id", jobId);

      if (invErr) {
        log("Failed to update invoice (may not exist)", { error: invErr.message });
      }

      // Notify contractor
      if (contractorId) {
        const { data: contractor } = await supabase
          .from("contractors")
          .select("user_id")
          .eq("id", contractorId)
          .single();

        if (contractor) {
          await supabase.from("notifications").insert({
            user_id: contractor.user_id,
            title: "💰 Payment Received",
            message: `Payment received for job #${jobId.slice(0, 8)} via payment link.`,
            type: "success",
          });
        }
      }

      log("Payment link webhook processed successfully");
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
