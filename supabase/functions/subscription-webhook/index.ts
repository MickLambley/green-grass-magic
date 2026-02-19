import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SUBSCRIPTION-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    // If STRIPE_WEBHOOK_SECRET is set, verify signature. Otherwise accept all (dev mode).
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    let event: Stripe.Event;

    if (webhookSecret && sig) {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } else {
      event = JSON.parse(body) as Stripe.Event;
      logStep("WARNING: No webhook signature verification (dev mode)");
    }

    logStep("Event received", { type: event.type });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const contractorId = subscription.metadata?.contractor_id;
        const tier = subscription.metadata?.yardly_tier;

        if (contractorId && tier) {
          await supabase
            .from("contractors")
            .update({ subscription_tier: tier })
            .eq("id", contractorId);

          logStep("Contractor tier updated", { contractorId, tier });
        }
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const contractorId = subscription.metadata?.contractor_id;
      const tier = subscription.metadata?.yardly_tier;

      if (contractorId) {
        if (subscription.status === "active" && tier) {
          await supabase
            .from("contractors")
            .update({ subscription_tier: tier })
            .eq("id", contractorId);
          logStep("Subscription updated", { contractorId, tier });
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const contractorId = subscription.metadata?.contractor_id;

      if (contractorId) {
        await supabase
          .from("contractors")
          .update({ subscription_tier: "free" })
          .eq("id", contractorId);
        logStep("Subscription cancelled, reverted to free", { contractorId });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { "Content-Type": "application/json" }, status: 400 }
    );
  }
});
