import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_PAYMENT_LINK");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET_PAYMENT_LINK not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) {
      log("ERROR: Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("Signature verification failed", { error: msg });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    log("Event verified", { type: event.type, id: event.id });

    // Idempotency check
    const { data: existing } = await supabase
      .from("processed_stripe_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existing) {
      log("Duplicate event, skipping", { eventId: event.id });
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    await supabase.from("processed_stripe_events").insert({
      event_id: event.id,
      event_type: event.type,
    });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      const jobId = metadata.job_id;
      const invoiceId = metadata.invoice_id;
      const contractorId = metadata.contractor_id;

      // Handle invoice payments (from manual invoice payment links)
      if (invoiceId) {
        log("Processing invoice payment", { invoiceId, contractorId });

        const { error: invErr } = await supabase
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
          })
          .eq("id", invoiceId);

        if (invErr) log("Failed to update invoice", { error: invErr.message });
        else log("Invoice marked as paid", { invoiceId });

        if (contractorId) {
          const invoiceNumber = metadata.invoice_number || invoiceId.slice(0, 8);
          const { data: contractor } = await supabase
            .from("contractors")
            .select("user_id")
            .eq("id", contractorId)
            .single();

          if (contractor) {
            await supabase.from("notifications").insert({
              user_id: contractor.user_id,
              title: "💰 Invoice Paid",
              message: `Invoice ${invoiceNumber} has been paid online via card.`,
              type: "success",
            });
          }
        }
      }

      // Handle job payments (from job payment links)
      if (jobId) {
        log("Processing payment for job", { jobId, contractorId });

        const { error: jobErr } = await supabase
          .from("jobs")
          .update({
            payment_status: "paid",
            payment_intent_id: session.payment_intent,
          })
          .eq("id", jobId);

        if (jobErr) log("Failed to update job", { error: jobErr.message });

        // Also mark linked invoice if exists
        const { error: invErr } = await supabase
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
          })
          .eq("job_id", jobId);

        if (invErr) log("Failed to update invoice for job (may not exist)", { error: invErr.message });

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
      }

      if (!jobId && !invoiceId) {
        log("No job_id or invoice_id in metadata, skipping");
      }

      log("Payment link webhook processed successfully");
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PAYMENT-LINK-WEBHOOK] ERROR:", msg);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});
