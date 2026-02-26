import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const log = (step: string, details?: Record<string, unknown>) => {
  console.log(`[STRIPE-CONNECT-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_CONNECT");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET_CONNECT not configured");

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) {
      log("ERROR: Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        headers: { "Content-Type": "application/json" }, status: 400,
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
        headers: { "Content-Type": "application/json" }, status: 400,
      });
    }

    log("Event verified", { type: event.type, id: event.id });

    // Idempotency check
    const { data: existing } = await supabaseClient
      .from("processed_stripe_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existing) {
      log("Duplicate event, skipping", { eventId: event.id });
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { "Content-Type": "application/json" }, status: 200,
      });
    }

    await supabaseClient.from("processed_stripe_events").insert({
      event_id: event.id,
      event_type: event.type,
    });

    if (event.type === "account.updated") {
      const account = event.data.object;
      const stripeAccountId = account.id;
      const onboardingComplete = account.details_submitted ?? false;
      const payoutsEnabled = account.payouts_enabled ?? false;

      log("Updating contractor", { stripeAccountId, onboardingComplete, payoutsEnabled });

      const { error } = await supabaseClient
        .from("contractors")
        .update({
          stripe_onboarding_complete: onboardingComplete,
          stripe_payouts_enabled: payoutsEnabled,
        })
        .eq("stripe_account_id", stripeAccountId);

      if (error) {
        console.error("[STRIPE-CONNECT-WEBHOOK] DB update error:", error);
        return new Response(JSON.stringify({ error: "Processing failed" }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" }, status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[STRIPE-CONNECT-WEBHOOK] Error:", msg);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      headers: { "Content-Type": "application/json" }, status: 400,
    });
  }
});
