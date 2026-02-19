import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    // For now, parse the event directly (webhook secret can be added later)
    const event = JSON.parse(body);

    console.log(`[STRIPE-WEBHOOK] Received event: ${event.type}`);

    if (event.type === "account.updated") {
      const account = event.data.object;
      const stripeAccountId = account.id;
      const onboardingComplete = account.details_submitted ?? false;
      const payoutsEnabled = account.payouts_enabled ?? false;

      console.log(`[STRIPE-WEBHOOK] Updating contractor ${stripeAccountId}: onboarding=${onboardingComplete}, payouts=${payoutsEnabled}`);

      const { error } = await supabaseClient
        .from("contractors")
        .update({
          stripe_onboarding_complete: onboardingComplete,
          stripe_payouts_enabled: payoutsEnabled,
        })
        .eq("stripe_account_id", stripeAccountId);

      if (error) {
        console.error("[STRIPE-WEBHOOK] DB update error:", error);
        return new Response(JSON.stringify({ error: "DB update failed" }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
