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

    // Authenticate the contractor
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
      .select("id, stripe_account_id, stripe_onboarding_complete, user_id, tier")
      .eq("user_id", userId)
      .single();

    if (contractorError || !contractor) throw new Error("Contractor profile not found");
    if (!contractor.stripe_account_id || !contractor.stripe_onboarding_complete) {
      throw new Error("Stripe setup not complete. Please complete your payment setup first.");
    }

    logStep("Contractor verified", { contractorId: contractor.id, stripeAccountId: contractor.stripe_account_id });

    // Parse request
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

    // Tier-based restrictions
    const tier = (contractor as any).tier || "probation";
    if (tier === "probation" || tier === "standard") {
      const maxJobs = tier === "probation" ? 3 : 10;
      const { count: activeJobs } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("contractor_id", contractor.id)
        .in("status", ["confirmed", "pending"]);

      if ((activeJobs ?? 0) >= maxJobs) {
        throw new Error(`You've reached your maximum of ${maxJobs} concurrent jobs for your tier. Complete existing jobs to accept new ones.`);
      }

      if (tier === "probation" && booking.total_price && Number(booking.total_price) > 150) {
        throw new Error("As a new contractor, you cannot accept jobs over $150. Complete more jobs to unlock higher-value work.");
      }
    }
    logStep("Tier check passed", { tier });

    // Find the Stripe customer for the booking owner
    const { data: customerAuth } = await supabase.auth.admin.getUserById(booking.user_id);
    const customerEmail = customerAuth?.user?.email;
    if (!customerEmail) throw new Error("Customer email not found");

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    if (customers.data.length === 0) throw new Error("Stripe customer not found for this user");
    const customerId = customers.data[0].id;

    logStep("Stripe customer found", { customerId });

    // Create PaymentIntent with destination charge
    const amountInCents = Math.round(Number(booking.total_price) * 100);
    const applicationFee = Math.floor(amountInCents * 0.15); // 15% platform fee

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "aud",
      customer: customerId,
      payment_method: booking.payment_method_id,
      off_session: true,
      confirm: true,
      application_fee_amount: applicationFee,
      transfer_data: {
        destination: contractor.stripe_account_id,
      },
      
      statement_descriptor_suffix: "LAWNLY",
      metadata: {
        booking_id: booking.id,
        contractor_id: contractor.id,
        customer_id: booking.user_id,
      },
    });

    logStep("PaymentIntent created", {
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      applicationFee,
      status: paymentIntent.status,
    });

    if (paymentIntent.status !== "succeeded") {
      throw new Error(`Payment failed with status: ${paymentIntent.status}`);
    }

    // Update booking: mark as captured and confirmed, assign contractor
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
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

    if (updateError) {
      logStep("WARNING: Failed to update booking after successful charge", { error: updateError.message });
    }

    logStep("Booking updated successfully");

    // Fetch address and profile for emails
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
    const timeDisplay = booking.scheduled_time || booking.time_slot;
    const payoutAmount = ((amountInCents - applicationFee) / 100).toFixed(2);

    // Send notification to customer
    await supabase.from("notifications").insert({
      user_id: booking.user_id,
      title: "Booking Confirmed!",
      message: `Great news! ${contractorName} has accepted your job. Payment of $${Number(booking.total_price).toFixed(2)} has been processed. They will arrive on ${dateFormatted}.`,
      type: "success",
      booking_id: bookingId,
    });

    // Send notification to contractor
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Job Accepted!",
      message: `You've accepted a job at ${address?.street_address || "the customer's address"}. Payment of $${Number(booking.total_price).toFixed(2)} is secured. Your payout will be $${payoutAmount} after the platform fee.`,
      type: "success",
      booking_id: bookingId,
    });

    // Try sending emails (non-blocking)
    try {
      // Customer email
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey && customerEmail) {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "Lawn Care <onboarding@resend.dev>",
            to: [customerEmail],
            subject: "Your Lawn Mowing Booking is Confirmed! ✓",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #16a34a;">Booking Confirmed! ✅</h1>
                <p>Hi ${customerName},</p>
                <p>Great news! Your booking is confirmed. Payment of <strong>$${Number(booking.total_price).toFixed(2)}</strong> has been processed.</p>
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Contractor:</strong> ${contractorName}</p>
                  <p style="margin: 5px 0;"><strong>Address:</strong> ${address?.street_address}, ${address?.city}, ${address?.state}</p>
                  <p style="margin: 5px 0;"><strong>Date:</strong> ${dateFormatted}</p>
                  <p style="margin: 5px 0;"><strong>Time:</strong> ${timeDisplay}</p>
                  <p style="margin: 5px 0;"><strong>Amount Charged:</strong> $${Number(booking.total_price).toFixed(2)}</p>
                </div>
                <p>${contractorName} will arrive during your selected time slot. Please ensure access to your lawn.</p>
                <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
              </div>
            `,
          }),
        });
        logStep("Customer email sent", { status: emailRes.status });
      }

      // Contractor email
      if (resendApiKey && userData.user.email) {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "Lawn Care <onboarding@resend.dev>",
            to: [userData.user.email],
            subject: "You've Accepted a Job! 🌿",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #16a34a;">Job Accepted! 🎉</h1>
                <p>Hi ${contractorName},</p>
                <p>You've accepted a job! Payment of <strong>$${Number(booking.total_price).toFixed(2)}</strong> is secured.</p>
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Customer:</strong> ${customerName}</p>
                  <p style="margin: 5px 0;"><strong>Address:</strong> ${address?.street_address}, ${address?.city}, ${address?.state}</p>
                  <p style="margin: 5px 0;"><strong>Date:</strong> ${dateFormatted}</p>
                  <p style="margin: 5px 0;"><strong>Time:</strong> ${timeDisplay}</p>
                  <p style="margin: 5px 0;"><strong>Your Payout:</strong> $${payoutAmount} (after 15% platform fee)</p>
                </div>
                <p>Complete the job and upload photos to receive your payout.</p>
                <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
              </div>
            `,
          }),
        });
        logStep("Contractor email sent", { status: emailRes.status });
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

    // Check if it's a card decline - return specific error info
    const isCardError = error instanceof Error && 
      ('type' in error && (error as any).type === 'StripeCardError');

    return new Response(
      JSON.stringify({ 
        error: errorMessage, 
        isCardError,
        code: isCardError ? (error as any).code : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
