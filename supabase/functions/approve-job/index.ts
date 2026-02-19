import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[APPROVE-JOB] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");

    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    const { bookingId, rating, comment } = await req.json();
    if (!bookingId) throw new Error("Missing bookingId");

    // Fetch booking - must belong to user and be in correct status
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, user_id, contractor_id, status, total_price, payment_intent_id, payout_status, address_id, scheduled_date")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) throw new Error("Booking not found");
    if (booking.user_id !== userId) throw new Error("Not your booking");
    if (booking.status !== "completed_pending_verification") throw new Error("Booking is not awaiting verification");

    logStep("Booking verified", { bookingId, status: booking.status });

    // Get contractor details
    const { data: contractor } = await supabase
      .from("contractors")
      .select("id, user_id, stripe_account_id")
      .eq("id", booking.contractor_id)
      .single();

    if (!contractor) throw new Error("Contractor not found");

    // Trigger payout via release-payout function
    logStep("Calling release-payout");
    const payoutResponse = await fetch(
      `${supabaseUrl}/functions/v1/release-payout`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ bookingId }),
      }
    );

    const payoutResult = await payoutResponse.json();
    if (!payoutResponse.ok) {
      logStep("Payout release failed", { error: payoutResult.error });
      // Still update booking status even if payout fails - payout can be retried
    } else {
      logStep("Payout released successfully", { payoutId: payoutResult.payoutId });
    }

    // Update booking status to completed (release-payout may have done this already)
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", bookingId);

    if (updateError) logStep("Booking status update warning", { error: updateError.message });
    logStep("Booking updated to completed");

    // Save review if rating provided
    if (rating && rating >= 1 && rating <= 5) {
      const { error: reviewError } = await supabase
        .from("reviews")
        .insert({
          user_id: userId,
          contractor_id: contractor.id,
          booking_id: bookingId,
          rating,
          comment: comment || null,
        });

      if (reviewError) {
        logStep("Failed to save review (non-blocking)", { error: reviewError.message });
      } else {
        logStep("Review saved", { rating });
      }
    }

    // Get names for emails/notifications
    const [customerProfileResult, contractorProfileResult, contractorAuthResult] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("user_id", userId).single(),
      supabase.from("profiles").select("full_name").eq("user_id", contractor.user_id).single(),
      supabase.auth.admin.getUserById(contractor.user_id),
    ]);

    const customerName = customerProfileResult.data?.full_name || "Customer";
    const contractorName = contractorProfileResult.data?.full_name || "Contractor";
    const contractorEmail = contractorAuthResult.data?.user?.email;

    // Send notification to contractor
    await supabase.from("notifications").insert({
      user_id: contractor.user_id,
      title: "Payment Released! 💰",
      message: `${customerName} has approved your work for booking #${bookingId.slice(0, 8)}. Payment of $${Number(booking.total_price).toFixed(2)} will arrive in your bank account in 1-2 business days.`,
      type: "success",
      booking_id: bookingId,
    });

    // Send email to contractor
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey && contractorEmail) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "Yardly <onboarding@resend.dev>",
            to: [contractorEmail],
            subject: "Payment Approved! 💰",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #16a34a;">Payment Approved! 💰</h1>
                <p>Hi ${contractorName},</p>
                <p>Great news! ${customerName} has approved payment for Job #${bookingId.slice(0, 8)}.</p>
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Amount:</strong> $${Number(booking.total_price).toFixed(2)}</p>
                  <p style="margin: 5px 0;"><strong>Rating:</strong> ${rating ? `${rating}/5 stars` : "Not rated"}</p>
                </div>
                <p>Funds will arrive in your bank account in 1-2 business days.</p>
                <p style="color: #666; margin-top: 30px;">Best regards,<br>The Yardly Team</p>
              </div>
            `,
          }),
        });
        logStep("Contractor email sent");
      }
    } catch (emailError) {
      logStep("Email sending failed (non-blocking)", { error: String(emailError) });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
