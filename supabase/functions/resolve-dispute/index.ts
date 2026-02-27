import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RESOLVE-DISPUTE] ${step}${detailsStr}`);
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

    // Verify admin
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .single();

    if (!adminRole) throw new Error("Not authorized - admin only");

    const adminEmail = userData.user.email || "admin";
    logStep("Admin authenticated", { adminEmail });

    const { disputeId, resolution, refundPercentage } = await req.json();
    if (!disputeId) throw new Error("Missing disputeId");
    if (!resolution || !["full_refund", "partial_refund", "no_refund"].includes(resolution)) {
      throw new Error("Invalid resolution type");
    }

    // Fetch dispute with booking
    const { data: dispute, error: disputeError } = await supabase
      .from("disputes")
      .select("*")
      .eq("id", disputeId)
      .single();

    if (disputeError || !dispute) throw new Error("Dispute not found");
    if (dispute.status === "resolved") throw new Error("Dispute already resolved");

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, contractor_id, total_price, payment_intent_id, payout_status, status")
      .eq("id", dispute.booking_id)
      .single();

    if (!booking) throw new Error("Booking not found");

    const { data: contractor } = await supabase
      .from("contractors")
      .select("id, user_id, stripe_account_id")
      .eq("id", booking.contractor_id)
      .single();

    if (!contractor) throw new Error("Contractor not found");

    // Get names and emails
    const [customerProfile, contractorProfile, customerAuth, contractorAuth] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("user_id", booking.user_id).single(),
      supabase.from("profiles").select("full_name").eq("user_id", contractor.user_id).single(),
      supabase.auth.admin.getUserById(booking.user_id),
      supabase.auth.admin.getUserById(contractor.user_id),
    ]);

    const customerName = customerProfile.data?.full_name || "Customer";
    const contractorName = contractorProfile.data?.full_name || "Contractor";
    const customerEmail = customerAuth.data?.user?.email;
    const contractorEmail = contractorAuth.data?.user?.email;
    const totalPrice = Number(booking.total_price);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const sendEmail = async (to: string, subject: string, html: string) => {
      if (!resendApiKey) return;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
          body: JSON.stringify({ from: "Yardly <onboarding@resend.dev>", to: [to], subject, html }),
        });
      } catch (e) {
        logStep("Email failed (non-blocking)", { error: String(e) });
      }
    };

    const wrapEmail = (content: string) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        ${content}
        <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
      </div>
    `;

    let newPayoutStatus = booking.payout_status;

    if (resolution === "full_refund") {
      logStep("Processing full refund");

      if (booking.payment_intent_id) {
        try {
          await stripe.refunds.create({ payment_intent: booking.payment_intent_id });
          logStep("Stripe refund created");
        } catch (stripeErr) {
          logStep("Stripe refund failed", { error: String(stripeErr) });
          throw new Error(`Stripe refund failed: ${stripeErr instanceof Error ? stripeErr.message : String(stripeErr)}`);
        }
      }
      newPayoutStatus = "refunded";

      if (customerEmail) {
        await sendEmail(customerEmail, "Dispute Resolved - Full Refund",
          wrapEmail(`
            <h1 style="color: #16a34a;">Dispute Resolved</h1>
            <p>Hi ${customerName},</p>
            <p>Your dispute for Job #${booking.id.slice(0, 8)} has been resolved. A full refund of <strong>$${totalPrice.toFixed(2)}</strong> has been issued and will appear in your account in 5-10 business days.</p>
          `)
        );
      }
      if (contractorEmail) {
        await sendEmail(contractorEmail, "Dispute Resolved - Job #" + booking.id.slice(0, 8),
          wrapEmail(`
            <h1 style="color: #d97706;">Dispute Resolved</h1>
            <p>Hi ${contractorName},</p>
            <p>The dispute for Job #${booking.id.slice(0, 8)} has been resolved with a full refund to the customer. No payment will be issued for this job.</p>
          `)
        );
      }
    } else if (resolution === "partial_refund") {
      const pct = Math.min(100, Math.max(0, refundPercentage || 50));
      const refundAmount = Math.round(totalPrice * (pct / 100) * 100); // cents
      const contractorAmount = totalPrice * ((100 - pct) / 100);

      logStep("Processing partial refund", { percentage: pct, refundAmount, contractorAmount });

      if (booking.payment_intent_id && refundAmount > 0) {
        try {
          await stripe.refunds.create({ payment_intent: booking.payment_intent_id, amount: refundAmount });
          logStep("Stripe partial refund created");
        } catch (stripeErr) {
          throw new Error(`Stripe refund failed: ${stripeErr instanceof Error ? stripeErr.message : String(stripeErr)}`);
        }
      }

      // If payout not released yet, release remaining to contractor
      if (booking.payout_status === "frozen" || booking.payout_status === "pending") {
        try {
          const payoutResponse = await fetch(`${supabaseUrl}/functions/v1/release-payout`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ bookingId: booking.id }),
          });
          if (payoutResponse.ok) logStep("Remaining payout released to contractor");
        } catch (e) {
          logStep("Payout release failed (non-blocking)", { error: String(e) });
        }
      }
      newPayoutStatus = "partial_refund";

      if (customerEmail) {
        await sendEmail(customerEmail, "Dispute Resolved - Partial Refund",
          wrapEmail(`
            <h1 style="color: #16a34a;">Dispute Resolved</h1>
            <p>Hi ${customerName},</p>
            <p>Your dispute for Job #${booking.id.slice(0, 8)} has been resolved. A partial refund of <strong>$${(refundAmount / 100).toFixed(2)}</strong> (${pct}%) has been issued.</p>
          `)
        );
      }
      if (contractorEmail) {
        await sendEmail(contractorEmail, "Dispute Resolved - Job #" + booking.id.slice(0, 8),
          wrapEmail(`
            <h1 style="color: #d97706;">Dispute Resolved</h1>
            <p>Hi ${contractorName},</p>
            <p>The dispute for Job #${booking.id.slice(0, 8)} has been resolved with a ${pct}% refund to the customer. You will receive <strong>$${contractorAmount.toFixed(2)}</strong>.</p>
          `)
        );
      }
    } else if (resolution === "no_refund") {
      logStep("Rejecting dispute - paying contractor");

      // Release payout if not yet released
      if (booking.payout_status === "frozen" || booking.payout_status === "pending") {
        try {
          const payoutResponse = await fetch(`${supabaseUrl}/functions/v1/release-payout`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ bookingId: booking.id }),
          });
          if (payoutResponse.ok) {
            logStep("Payout released to contractor");
            newPayoutStatus = "released";
          }
        } catch (e) {
          logStep("Payout release failed", { error: String(e) });
        }
      }

      if (customerEmail) {
        await sendEmail(customerEmail, "Dispute Reviewed - Job #" + booking.id.slice(0, 8),
          wrapEmail(`
            <h1>Dispute Reviewed</h1>
            <p>Hi ${customerName},</p>
            <p>We've reviewed your dispute for Job #${booking.id.slice(0, 8)}. Based on the evidence, we've determined the work was completed satisfactorily. No refund will be issued.</p>
          `)
        );
      }
      if (contractorEmail) {
        await sendEmail(contractorEmail, "Dispute Resolved in Your Favor! 🎉",
          wrapEmail(`
            <h1 style="color: #16a34a;">Good News! 🎉</h1>
            <p>Hi ${contractorName},</p>
            <p>The dispute for Job #${booking.id.slice(0, 8)} has been resolved in your favor. Payment is being released.</p>
          `)
        );
      }
    }

    // Update dispute record
    const now = new Date().toISOString();
    await supabase.from("disputes").update({
      status: "resolved",
      resolution,
      refund_percentage: resolution === "partial_refund" ? (refundPercentage || 50) : resolution === "full_refund" ? 100 : 0,
      resolved_at: now,
      resolved_by: adminEmail,
    }).eq("id", disputeId);

    // Update booking
    await supabase.from("bookings").update({
      status: "completed",
      payout_status: newPayoutStatus,
    }).eq("id", booking.id);

    // Notifications
    await Promise.all([
      supabase.from("notifications").insert({
        user_id: booking.user_id,
        title: "Dispute Resolved",
        message: resolution === "full_refund"
          ? `Your dispute for Job #${booking.id.slice(0, 8)} has been resolved with a full refund.`
          : resolution === "partial_refund"
          ? `Your dispute for Job #${booking.id.slice(0, 8)} has been resolved with a ${refundPercentage || 50}% refund.`
          : `Your dispute for Job #${booking.id.slice(0, 8)} has been reviewed. No refund will be issued.`,
        type: "info",
        booking_id: booking.id,
      }),
      supabase.from("notifications").insert({
        user_id: contractor.user_id,
        title: "Dispute Resolved",
        message: resolution === "no_refund"
          ? `The dispute for Job #${booking.id.slice(0, 8)} was resolved in your favor!`
          : `The dispute for Job #${booking.id.slice(0, 8)} has been resolved. ${resolution === "full_refund" ? "Full refund issued." : `${refundPercentage || 50}% refund issued.`}`,
        type: resolution === "no_refund" ? "success" : "info",
        booking_id: booking.id,
      }),
    ]);

    logStep("Dispute resolved", { disputeId, resolution });

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
