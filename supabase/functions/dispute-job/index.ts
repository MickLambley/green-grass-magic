import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DISPUTE-JOB] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");

    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    const { bookingId, description, photoUrls, disputeReason, suggestedRefundAmount } = await req.json();
    if (!bookingId) throw new Error("Missing bookingId");
    if (!description || description.length < 20) throw new Error("Description must be at least 20 characters");
    if (!disputeReason) throw new Error("Missing dispute reason");

    // Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, user_id, contractor_id, status, total_price, address_id, payout_status, completed_at")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) throw new Error("Booking not found");
    if (booking.user_id !== userId) throw new Error("Not your booking");

    // Determine if this is a post-payment dispute
    const isPostPayment = booking.status === "completed" && booking.payout_status === "released";
    const isPrePayment = booking.status === "completed_pending_verification";

    if (!isPrePayment && !isPostPayment) throw new Error("Booking is not eligible for dispute");

    // For post-payment disputes, verify within 7-day window
    if (isPostPayment) {
      if (!booking.completed_at) throw new Error("Booking has no completion date");
      const completedAt = new Date(booking.completed_at).getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - completedAt >= sevenDaysMs) throw new Error("The 7-day dispute window has expired");
    }

    logStep("Booking verified", { bookingId, isPostPayment });

    // Validate suggested refund amount
    if (suggestedRefundAmount !== undefined && suggestedRefundAmount !== null) {
      const amount = Number(suggestedRefundAmount);
      if (isNaN(amount) || amount < 0 || amount > Number(booking.total_price)) {
        throw new Error("Suggested refund amount is invalid");
      }
    }

    // Create dispute
    const { error: disputeError } = await supabase
      .from("disputes")
      .insert({
        booking_id: bookingId,
        raised_by: "customer",
        description,
        customer_photos: photoUrls || [],
        dispute_reason: disputeReason,
        suggested_refund_amount: suggestedRefundAmount || null,
      });

    if (disputeError) throw new Error(`Failed to create dispute: ${disputeError.message}`);
    logStep("Dispute created");

    // Update booking status
    const updateData: Record<string, unknown> = isPostPayment
      ? { status: "post_payment_dispute" }  // DO NOT change payout_status
      : { status: "disputed", payout_status: "frozen" };

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", bookingId);

    if (updateError) throw new Error(`Failed to update booking: ${updateError.message}`);
    logStep("Booking status updated", { newStatus: isPostPayment ? "post_payment_dispute" : "disputed" });

    // Get names for notifications
    const { data: contractor } = await supabase
      .from("contractors")
      .select("id, user_id")
      .eq("id", booking.contractor_id)
      .single();

    const [customerProfileResult, contractorProfileResult, contractorAuthResult] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("user_id", userId).single(),
      contractor ? supabase.from("profiles").select("full_name").eq("user_id", contractor.user_id).single() : Promise.resolve({ data: null }),
      contractor ? supabase.auth.admin.getUserById(contractor.user_id) : Promise.resolve({ data: null }),
    ]);

    const customerName = customerProfileResult.data?.full_name || "Customer";
    const contractorName = contractorProfileResult.data?.full_name || "Contractor";
    const contractorEmail = (contractorAuthResult.data as any)?.user?.email;

    // Notify contractor
    if (contractor) {
      const notifMessage = isPostPayment
        ? `${customerName} has raised an issue with Job #${bookingId.slice(0, 8)} after payment was released. This may result in a partial refund. Please respond within 24 hours.`
        : `${customerName} has raised an issue with Job #${bookingId.slice(0, 8)}. Please respond within 24 hours.`;

      await supabase.from("notifications").insert({
        user_id: contractor.user_id,
        title: isPostPayment ? "Post-Payment Issue Reported ⚠️" : "Issue Reported ⚠️",
        message: notifMessage,
        type: "warning",
        booking_id: bookingId,
      });
    }

    // Send emails
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const emailPromises = [];

        // Admin email
        emailPromises.push(
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: "Lawn Care <onboarding@resend.dev>",
              to: ["admin@lawnly.com.au"],
              subject: `${isPostPayment ? "⚠️ Post-Payment " : ""}Dispute Raised - Job #${bookingId.slice(0, 8)}`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h1 style="color: #d97706;">${isPostPayment ? "⚠️ Post-Payment Dispute" : "Dispute Raised ⚠️"}</h1>
                  ${isPostPayment ? '<p style="color: #dc2626; font-weight: bold;">⚠️ Payment Already Released - Refund will come from platform balance</p>' : ""}
                  <p>A dispute has been raised for Job #${bookingId.slice(0, 8)}. Review required.</p>
                  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>Customer:</strong> ${customerName}</p>
                    <p style="margin: 5px 0;"><strong>Contractor:</strong> ${contractorName}</p>
                    <p style="margin: 5px 0;"><strong>Amount:</strong> $${Number(booking.total_price).toFixed(2)}</p>
                    <p style="margin: 5px 0;"><strong>Issue:</strong> ${description}</p>
                  </div>
                </div>
              `,
            }),
          })
        );

        // Contractor email
        if (contractorEmail) {
          emailPromises.push(
            fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: "Lawn Care <onboarding@resend.dev>",
                to: [contractorEmail],
                subject: `Issue Reported - Job #${bookingId.slice(0, 8)}`,
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #d97706;">Issue Reported ⚠️</h1>
                    <p>Hi ${contractorName},</p>
                    <p>The customer has raised an issue with Job #${bookingId.slice(0, 8)}. Please respond within 24 hours.</p>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 5px 0;"><strong>Issue:</strong> ${description}</p>
                    </div>
                    <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
                  </div>
                `,
              }),
            })
          );
        }

        await Promise.all(emailPromises);
        logStep("Emails sent");
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
    const safeMessages = [
      "No authorization header provided", "User not authenticated", "Missing bookingId",
      "Description must be at least 20 characters", "Missing dispute reason",
      "Booking not found", "Not your booking", "Booking is not eligible for dispute",
      "The 7-day dispute window has expired", "Suggested refund amount is invalid",
      "Booking has no completion date",
    ];
    const isSafe = safeMessages.includes(errorMessage);
    return new Response(
      JSON.stringify({ error: isSafe ? errorMessage : "Unable to process dispute" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
