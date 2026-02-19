import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SAVE-PAYMENT-METHOD] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase configuration");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error("User not authenticated");

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    logStep("User authenticated", { userId, email: userEmail });

    const { bookingId } = await req.json();
    if (!bookingId) throw new Error("Missing required field: bookingId");

    // Verify user owns this booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, user_id, payment_status, total_price")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) throw new Error("Booking not found");
    if (booking.user_id !== userId) throw new Error("Unauthorized: You do not own this booking");

    logStep("Booking verified", { bookingId: booking.id });

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // Find or create Stripe customer
    let customerId: string;
    if (userEmail) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found existing Stripe customer", { customerId });
      } else {
        const newCustomer = await stripe.customers.create({
          email: userEmail,
          metadata: { supabase_user_id: userId },
        });
        customerId = newCustomer.id;
        logStep("Created new Stripe customer", { customerId });
      }
    } else {
      throw new Error("User email not available");
    }

    // Create a SetupIntent to collect payment method without charging
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      metadata: {
        booking_id: bookingId,
        user_id: userId,
      },
    });

    logStep("SetupIntent created", { setupIntentId: setupIntent.id });

    return new Response(
      JSON.stringify({
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
        customerId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
