import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const user = userData.user;

    // Get contractor profile
    const { data: contractor, error: contractorError } = await supabaseClient
      .from("contractors")
      .select("id, stripe_account_id, approval_status")
      .eq("user_id", user.id)
      .single();

    if (contractorError || !contractor) throw new Error("Contractor profile not found");
    if (contractor.approval_status !== "approved") throw new Error("Contractor not approved");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    let stripeAccountId = contractor.stripe_account_id;

    // Create Stripe Connect Express account if none exists
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "AU",
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
      });

      // Set manual payout schedule
      await stripe.accounts.update(account.id, {
        settings: {
          payouts: {
            schedule: { interval: "manual" },
          },
        },
      });

      stripeAccountId = account.id;

      // Store in DB
      await supabaseClient
        .from("contractors")
        .update({ stripe_account_id: stripeAccountId })
        .eq("id", contractor.id);
    }

    // Check current account status
    const account = await stripe.accounts.retrieve(stripeAccountId);
    const onboardingComplete = account.details_submitted ?? false;
    const payoutsEnabled = account.payouts_enabled ?? false;

    // Update status in DB
    await supabaseClient
      .from("contractors")
      .update({
        stripe_onboarding_complete: onboardingComplete,
        stripe_payouts_enabled: payoutsEnabled,
      })
      .eq("id", contractor.id);

    const { action } = await req.json().catch(() => ({ action: "status" }));

    if (action === "create_account_link") {
      const origin = req.headers.get("origin") || "https://lawnly.com.au";
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${origin}/contractor`,
        return_url: `${origin}/contractor`,
        type: "account_onboarding",
      });

      return new Response(JSON.stringify({
        url: accountLink.url,
        stripe_account_id: stripeAccountId,
        onboarding_complete: onboardingComplete,
        payouts_enabled: payoutsEnabled,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: return status
    return new Response(JSON.stringify({
      stripe_account_id: stripeAccountId,
      onboarding_complete: onboardingComplete,
      payouts_enabled: payoutsEnabled,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stripe Connect error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
