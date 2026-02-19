import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-PAYMENT-INTENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase configuration");
    }

    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    // Create client with user's auth context for RLS
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError || !userData.user) {
      throw new Error("User not authenticated");
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    logStep("User authenticated", { userId, email: userEmail });

    // Parse request body
    const { bookingId, amount } = await req.json();
    
    if (!bookingId || !amount) {
      throw new Error("Missing required fields: bookingId and amount");
    }

    logStep("Request parsed", { bookingId, amount });

    // Verify user owns this booking (RLS handles authorization)
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, user_id, payment_status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      logStep("Booking query failed", { error: bookingError?.message });
      throw new Error("Booking not found");
    }

    if (booking.user_id !== userId) {
      throw new Error("Unauthorized: You do not own this booking");
    }

    if (booking.payment_status === "paid") {
      throw new Error("This booking has already been paid");
    }

    logStep("Booking verified", { bookingId: booking.id });

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer exists in Stripe
    let customerId: string | undefined;
    if (userEmail) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found existing Stripe customer", { customerId });
      } else {
        // Create new customer
        const newCustomer = await stripe.customers.create({
          email: userEmail,
          metadata: { supabase_user_id: userId },
        });
        customerId = newCustomer.id;
        logStep("Created new Stripe customer", { customerId });
      }
    }

    // Create PaymentIntent
    const amountInCents = Math.round(amount * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "aud",
      customer: customerId,
      metadata: {
        booking_id: bookingId,
        user_id: userId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    logStep("PaymentIntent created", { 
      paymentIntentId: paymentIntent.id, 
      amount: amountInCents 
    });

    // Update booking with payment_intent_id
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ payment_intent_id: paymentIntent.id })
      .eq("id", bookingId);

    if (updateError) {
      logStep("Warning: Failed to update booking with payment_intent_id", { error: updateError.message });
    }

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
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
