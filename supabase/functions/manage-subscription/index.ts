import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MANAGE-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Stripe Price IDs will be created on first call if they don't exist.
// In production you'd hardcode these after creating products in Stripe dashboard.
const TIER_CONFIG: Record<string, { priceAud: number; name: string }> = {
  starter: { priceAud: 2900, name: "Yardly Starter" },
  pro: { priceAud: 5900, name: "Yardly Pro" },
  team: { priceAud: 9900, name: "Yardly Team" },
};

async function getOrCreatePrice(stripe: Stripe, tier: string): Promise<string> {
  const config = TIER_CONFIG[tier];
  if (!config) throw new Error(`Unknown tier: ${tier}`);

  // Search for existing product by metadata
  const products = await stripe.products.search({
    query: `metadata["yardly_tier"]:"${tier}"`,
  });

  if (products.data.length > 0) {
    const prices = await stripe.prices.list({
      product: products.data[0].id,
      active: true,
      currency: "aud",
      type: "recurring",
      limit: 1,
    });
    if (prices.data.length > 0) return prices.data[0].id;
  }

  // Create product + price
  const product = await stripe.products.create({
    name: config.name,
    metadata: { yardly_tier: tier },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: config.priceAud,
    currency: "aud",
    recurring: { interval: "month" },
  });

  logStep("Created Stripe product + price", { tier, productId: product.id, priceId: price.id });
  return price.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    logStep("User authenticated", { userId });

    // Get contractor
    const { data: contractor, error: contractorError } = await supabase
      .from("contractors")
      .select("id, subscription_tier")
      .eq("user_id", userId)
      .single();

    if (contractorError || !contractor) throw new Error("Contractor profile not found");

    const { action, tier } = await req.json();
    logStep("Request parsed", { action, tier });

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // ── ACTION: create-checkout ──
    if (action === "create-checkout") {
      if (!tier || !TIER_CONFIG[tier]) throw new Error("Invalid tier. Must be starter, pro, or team.");

      const priceId = await getOrCreatePrice(stripe, tier);
      const origin = req.headers.get("origin") || "https://yardly.com.au";

      // Find or create Stripe customer
      let customerId: string;
      if (userEmail) {
        const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
        } else {
          const newCustomer = await stripe.customers.create({
            email: userEmail,
            metadata: { supabase_user_id: userId, contractor_id: contractor.id },
          });
          customerId = newCustomer.id;
        }
      } else {
        throw new Error("User email required for subscription");
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/contractor?subscription=success&tier=${tier}`,
        cancel_url: `${origin}/contractor?subscription=cancelled`,
        subscription_data: {
          metadata: {
            contractor_id: contractor.id,
            yardly_tier: tier,
          },
        },
      });

      logStep("Checkout session created", { sessionId: session.id, tier });

      return new Response(
        JSON.stringify({ url: session.url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ── ACTION: create-portal ──
    if (action === "create-portal") {
      if (!userEmail) throw new Error("User email required");

      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length === 0) throw new Error("No Stripe customer found. Subscribe to a plan first.");

      const origin = req.headers.get("origin") || "https://yardly.com.au";
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: `${origin}/contractor`,
      });

      logStep("Portal session created");

      return new Response(
        JSON.stringify({ url: portalSession.url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ── ACTION: status ──
    if (action === "status") {
      return new Response(
        JSON.stringify({ subscription_tier: contractor.subscription_tier }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
