import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RELEASE-PAYOUT] ${step}${detailsStr}`);
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const authHeader = req.headers.get("Authorization");
    let callerUserId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      callerUserId = userData.user?.id || null;
    }

    const { bookingId } = await req.json();
    if (!bookingId) throw new Error("Missing bookingId");

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, user_id, contractor_id, status, total_price, payment_intent_id, payout_status, stripe_payout_id")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) throw new Error("Booking not found");
    if (booking.payout_status !== "pending") {
      logStep("Payout already processed", { payout_status: booking.payout_status });
      return new Response(
        JSON.stringify({ success: true, message: "Payout already processed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (callerUserId && booking.user_id !== callerUserId) {
      throw new Error("Not authorized to release payout for this booking");
    }

    logStep("Booking verified", { bookingId, status: booking.status, totalPrice: booking.total_price });

    const { data: contractor } = await supabase
      .from("contractors")
      .select("id, user_id, stripe_account_id, subscription_tier")
      .eq("id", booking.contractor_id)
      .single();

    if (!contractor) throw new Error("Contractor not found");
    if (!contractor.stripe_account_id) throw new Error("Contractor has no Stripe account configured");

    // With direct charges the funds already sit in the contractor's connected account.
    // We just need to trigger a payout from the connected account's balance to their bank.
    const totalAmount = Number(booking.total_price);
    if (!totalAmount || totalAmount <= 0) throw new Error("Invalid booking amount");

    // Look up actual fee from transaction_fees if recorded, otherwise estimate
    const { data: feeRecord } = await supabase
      .from("transaction_fees")
      .select("contractor_payout")
      .eq("contractor_id", contractor.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // The connected account balance already has the amount minus application_fee.
    // We trigger a payout of the full available balance for this charge.
    const amountInCents = Math.round(totalAmount * 100);
    // Approximate: total minus yardly fee (application_fee was already deducted by Stripe)
    // The actual balance available is amountInCents - applicationFee, but Stripe handles this.
    // We just trigger a payout for the estimated contractor share.
    const contractorPayoutCents = feeRecord
      ? Math.round(feeRecord.contractor_payout * 100)
      : amountInCents; // fallback: full amount

    let payoutId: string;
    try {
      const payout = await stripe.payouts.create(
        {
          amount: contractorPayoutCents,
          currency: "aud",
          metadata: { booking_id: booking.id, contractor_id: contractor.id },
        },
        { stripeAccount: contractor.stripe_account_id }
      );
      payoutId = payout.id;
      logStep("Stripe payout created", { payoutId, amount: contractorPayoutCents });
    } catch (stripeError) {
      const errorMessage = stripeError instanceof Error ? stripeError.message : String(stripeError);
      logStep("Stripe payout FAILED", { error: errorMessage });
      await supabase.from("notifications").insert({
        user_id: booking.user_id,
        title: "⚠️ Payout Failed",
        message: `Stripe payout failed for booking #${bookingId.slice(0, 8)}. Error: ${errorMessage}.`,
        type: "error",
        booking_id: bookingId,
      });
      throw new Error(`Stripe payout failed: ${errorMessage}`);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      payout_status: "released",
      payout_released_at: now,
      stripe_payout_id: payoutId,
    };
    if (booking.status === "completed_pending_verification") {
      updateData.status = "completed";
    }

    await supabase.from("bookings").update(updateData).eq("id", bookingId);
    logStep("Booking updated", { payoutId });

    // Notify contractor
    const { data: contractorProfile } = await supabase
      .from("profiles").select("full_name").eq("user_id", contractor.user_id).single();

    await supabase.from("notifications").insert({
      user_id: contractor.user_id,
      title: "Payment Released! 💰",
      message: `Payment for booking #${bookingId.slice(0, 8)} has been released. Funds will arrive in 1-2 business days.`,
      type: "success",
      booking_id: bookingId,
    });

    // Email (non-blocking)
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const { data: contractorAuth } = await supabase.auth.admin.getUserById(contractor.user_id);
      const contractorEmail = contractorAuth?.user?.email;
      const contractorName = contractorProfile?.full_name || "Contractor";

      if (resendApiKey && contractorEmail) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
          body: JSON.stringify({
            from: "Yardly <onboarding@resend.dev>",
            to: [contractorEmail],
            subject: "Payment Released! 💰",
            html: `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #16a34a;">Payment Released! 💰</h1>
              <p>Hi ${contractorName},</p>
              <p>Payment for Job #${bookingId.slice(0, 8)} has been released.</p>
              <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;">
                <p><strong>Your Earnings:</strong> $${(contractorPayoutCents / 100).toFixed(2)} AUD</p>
              </div>
              <p>Funds will arrive in your bank account in 1-2 business days.</p>
              <p style="color:#666;margin-top:30px;">Best regards,<br>The Yardly Team</p>
            </div>`,
          }),
        });
      }
    } catch (emailError) {
      logStep("Email sending failed (non-blocking)", { error: String(emailError) });
    }

    return new Response(
      JSON.stringify({ success: true, payoutId }),
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
