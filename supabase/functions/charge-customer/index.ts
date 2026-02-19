import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHARGE-CUSTOMER] ${step}${detailsStr}`);
};

/** Return the Yardly application fee percentage based on the contractor's subscription tier */
function getApplicationFeePercent(subscriptionTier: string): number {
  switch (subscriptionTier) {
    case "pro":
    case "team":
      return 0.01; // 1%
    case "starter":
      return 0.03; // 3%
    case "free":
    default:
      return 0.05; // 5%
  }
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
    logStep("User authenticated", { userId });

    // Verify user is an approved contractor
    const { data: contractor, error: contractorError } = await supabase
      .from("contractors")
      .select("id, stripe_account_id, stripe_onboarding_complete, user_id, tier, subscription_tier")
      .eq("user_id", userId)
      .single();

    if (contractorError || !contractor) throw new Error("Contractor profile not found");
    if (!contractor.stripe_account_id || !contractor.stripe_onboarding_complete) {
      throw new Error("Stripe setup not complete. Please complete your payment setup first.");
    }

    logStep("Contractor verified", { contractorId: contractor.id, stripeAccountId: contractor.stripe_account_id, subscriptionTier: contractor.subscription_tier });

    const { bookingId } = await req.json();
    if (!bookingId) throw new Error("Missing required field: bookingId");

    // Fetch booking with payment method
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, user_id, total_price, payment_method_id, payment_status, status, contractor_id, address_id, scheduled_date, time_slot, scheduled_time")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) throw new Error("Booking not found");
    if (booking.payment_status === "captured") throw new Error("Payment already captured for this booking");
    if (!booking.payment_method_id) throw new Error("No payment method on file for this booking");
    if (!booking.total_price) throw new Error("Booking has no price set");

    logStep("Booking fetched", { bookingId, totalPrice: booking.total_price, paymentMethodId: booking.payment_method_id });

    // Find the Stripe customer for the booking owner
    const { data: customerAuth } = await supabase.auth.admin.getUserById(booking.user_id);
    const customerEmail = customerAuth?.user?.email;
    if (!customerEmail) throw new Error("Customer email not found");

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    if (customers.data.length === 0) throw new Error("Stripe customer not found for this user");
    const customerId = customers.data[0].id;

    logStep("Stripe customer found", { customerId });

    // ── Direct charge on the contractor's connected account ──
    // The charge is created directly on the contractor's Stripe account.
    // Yardly collects an application_fee based on the contractor's subscription tier.
    const amountInCents = Math.round(Number(booking.total_price) * 100);
    const feePercent = getApplicationFeePercent(contractor.subscription_tier || "free");
    const applicationFee = Math.floor(amountInCents * feePercent);

    logStep("Fee calculation", { amountInCents, feePercent, applicationFee, subscriptionTier: contractor.subscription_tier });

    // Clone the customer's payment method to the connected account
    const paymentMethod = await stripe.paymentMethods.create(
      {
        customer: customerId,
        payment_method: booking.payment_method_id,
      },
      { stripeAccount: contractor.stripe_account_id }
    );

    // Create or find customer on connected account
    let connectedCustomerId: string;
    const connectedCustomers = await stripe.customers.list(
      { email: customerEmail, limit: 1 },
      { stripeAccount: contractor.stripe_account_id }
    );
    if (connectedCustomers.data.length > 0) {
      connectedCustomerId = connectedCustomers.data[0].id;
    } else {
      const newConnectedCustomer = await stripe.customers.create(
        { email: customerEmail },
        { stripeAccount: contractor.stripe_account_id }
      );
      connectedCustomerId = newConnectedCustomer.id;
    }

    // Attach payment method to connected customer
    await stripe.paymentMethods.attach(
      paymentMethod.id,
      { customer: connectedCustomerId },
      { stripeAccount: contractor.stripe_account_id }
    );

    // Create PaymentIntent as a direct charge on the connected account
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: "aud",
        customer: connectedCustomerId,
        payment_method: paymentMethod.id,
        off_session: true,
        confirm: true,
        application_fee_amount: applicationFee,
        statement_descriptor_suffix: "YARDLY",
        metadata: {
          booking_id: booking.id,
          contractor_id: contractor.id,
          customer_id: booking.user_id,
          yardly_fee_percent: String(feePercent * 100),
        },
      },
      { stripeAccount: contractor.stripe_account_id }
    );

    logStep("Direct charge PaymentIntent created", {
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      applicationFee,
      status: paymentIntent.status,
    });

    if (paymentIntent.status !== "succeeded") {
      throw new Error(`Payment failed with status: ${paymentIntent.status}`);
    }

    // Record transaction fee
    const stripeFeeEstimate = Math.round(amountInCents * 0.0175 + 30); // ~1.75% + 30c AU
    const contractorPayout = amountInCents - applicationFee - stripeFeeEstimate;
    await supabase.from("transaction_fees").insert({
      contractor_id: contractor.id,
      job_id: null, // bookings table, not jobs
      payment_amount: Number(booking.total_price),
      stripe_fee: stripeFeeEstimate / 100,
      yardly_fee: applicationFee / 100,
      yardly_fee_percentage: feePercent * 100,
      contractor_payout: contractorPayout / 100,
    });

    // Update booking
    const now = new Date().toISOString();
    await supabase
      .from("bookings")
      .update({
        payment_status: "captured",
        payment_intent_id: paymentIntent.id,
        charged_at: now,
        status: "confirmed",
        contractor_id: contractor.id,
        contractor_accepted_at: now,
      })
      .eq("id", bookingId);

    logStep("Booking updated successfully");

    // Fetch address and profile for notifications
    const [addressResult, profileResult, contractorProfileResult] = await Promise.all([
      supabase.from("addresses").select("street_address, city, state").eq("id", booking.address_id).single(),
      supabase.from("profiles").select("full_name").eq("user_id", booking.user_id).single(),
      supabase.from("profiles").select("full_name").eq("user_id", userId).single(),
    ]);

    const address = addressResult.data;
    const customerName = profileResult.data?.full_name || "Customer";
    const contractorName = contractorProfileResult.data?.full_name || "Your contractor";
    const dateFormatted = new Date(booking.scheduled_date).toLocaleDateString("en-AU", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const payoutAmountStr = (contractorPayout / 100).toFixed(2);

    // Send notifications
    await Promise.all([
      supabase.from("notifications").insert({
        user_id: booking.user_id,
        title: "Booking Confirmed!",
        message: `Great news! ${contractorName} has accepted your job. Payment of $${Number(booking.total_price).toFixed(2)} has been processed.`,
        type: "success",
        booking_id: bookingId,
      }),
      supabase.from("notifications").insert({
        user_id: userId,
        title: "Job Accepted!",
        message: `You've accepted a job at ${address?.street_address || "the customer's address"}. Payment of $${Number(booking.total_price).toFixed(2)} is secured. Your payout will be ~$${payoutAmountStr} after the ${feePercent * 100}% Yardly fee.`,
        type: "success",
        booking_id: bookingId,
      }),
    ]);

    // Emails (non-blocking)
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey && customerEmail) {
        const timeDisplay = booking.scheduled_time || booking.time_slot;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
          body: JSON.stringify({
            from: "Yardly <onboarding@resend.dev>",
            to: [customerEmail],
            subject: "Your Booking is Confirmed! ✓",
            html: `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #16a34a;">Booking Confirmed! ✅</h1>
              <p>Hi ${customerName},</p>
              <p>Your booking is confirmed. Payment of <strong>$${Number(booking.total_price).toFixed(2)}</strong> has been processed.</p>
              <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;">
                <p><strong>Contractor:</strong> ${contractorName}</p>
                <p><strong>Address:</strong> ${address?.street_address}, ${address?.city}, ${address?.state}</p>
                <p><strong>Date:</strong> ${dateFormatted}</p>
                <p><strong>Time:</strong> ${timeDisplay}</p>
              </div>
              <p style="color:#666;margin-top:30px;">Best regards,<br>The Yardly Team</p>
            </div>`,
          }),
        });
      }
    } catch (emailError) {
      logStep("Email sending failed (non-blocking)", { error: String(emailError) });
    }

    return new Response(
      JSON.stringify({ success: true, paymentIntentId: paymentIntent.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    const isCardError = error instanceof Error && ('type' in error && (error as any).type === 'StripeCardError');
    return new Response(
      JSON.stringify({ error: errorMessage, isCardError, code: isCardError ? (error as any).code : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
