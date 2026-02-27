import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[AUTO-RELEASE-PAYOUTS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate: require CRON_SECRET or service role key
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isAuthorized = token && (token === cronSecret || token === serviceRoleKey);
    if (!isAuthorized) {
      logStep("Unauthorized request rejected");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }

    logStep("Cron job started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Find bookings eligible for auto-release
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: bookings, error: queryError } = await supabase
      .from("bookings")
      .select("id, user_id, contractor_id, total_price, completed_at, scheduled_date")
      .eq("status", "completed_pending_verification")
      .eq("payout_status", "pending")
      .lt("completed_at", cutoff);

    if (queryError) throw new Error(`Query failed: ${queryError.message}`);

    if (!bookings || bookings.length === 0) {
      logStep("No bookings eligible for auto-release");
      return new Response(
        JSON.stringify({ success: true, released: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    logStep("Found eligible bookings", { count: bookings.length });

    const results: { bookingId: string; success: boolean; error?: string }[] = [];

    for (const booking of bookings) {
      try {
        logStep("Processing booking", { bookingId: booking.id });

        // Auto-rate as 5 stars if no rating submitted
        const { data: bookingDetail } = await supabase
          .from("bookings")
          .select("customer_rating")
          .eq("id", booking.id)
          .single();

        if (bookingDetail && !bookingDetail.customer_rating) {
          await supabase
            .from("bookings")
            .update({
              customer_rating: 5,
              rating_comment: "Auto-rated: no review submitted within 48 hours",
              rating_submitted_at: new Date().toISOString(),
            })
            .eq("id", booking.id);
          logStep("Auto-rated 5 stars", { bookingId: booking.id });
        }

        // 2. Call release-payout
        const payoutResponse = await fetch(
          `${supabaseUrl}/functions/v1/release-payout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ bookingId: booking.id }),
          }
        );

        const payoutResult = await payoutResponse.json();

        if (!payoutResponse.ok) {
          throw new Error(payoutResult.error || "Payout failed");
        }

        logStep("Payout released", { bookingId: booking.id, payoutId: payoutResult.payoutId });

        // 3. Get names for emails
        const [customerProfile, contractorData] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("user_id", booking.user_id).single(),
          supabase.from("contractors").select("user_id").eq("id", booking.contractor_id).single(),
        ]);

        let contractorName = "your contractor";
        let contractorEmail: string | null = null;
        let customerEmail: string | null = null;

        if (contractorData.data) {
          const [contractorProfile, contractorAuth, customerAuth] = await Promise.all([
            supabase.from("profiles").select("full_name").eq("user_id", contractorData.data.user_id).single(),
            supabase.auth.admin.getUserById(contractorData.data.user_id),
            supabase.auth.admin.getUserById(booking.user_id),
          ]);
          contractorName = contractorProfile.data?.full_name || "your contractor";
          contractorEmail = contractorAuth.data?.user?.email || null;
          customerEmail = customerAuth.data?.user?.email || null;
        }

        // 4. Send emails
        if (resendApiKey) {
          // Email to customer
          if (customerEmail) {
            try {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${resendApiKey}`,
                },
                body: JSON.stringify({
                  from: "Lawn Care <onboarding@resend.dev>",
                  to: [customerEmail],
                  subject: "Payment Automatically Released",
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h1 style="color: #16a34a;">Payment Released</h1>
                      <p>Hi ${customerProfile.data?.full_name || "there"},</p>
                      <p>Payment for your lawn service on ${booking.scheduled_date} has been automatically released to ${contractorName}.</p>
                      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Amount:</strong> $${Number(booking.total_price).toFixed(2)}</p>
                        <p style="margin: 5px 0;">The 48-hour review period has elapsed and payment was released automatically.</p>
                      </div>
                      <p>You can still report an issue within 7 days if needed by visiting your dashboard.</p>
                      <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
                    </div>
                  `,
                }),
              });
              logStep("Customer email sent", { bookingId: booking.id });
            } catch (e) {
              logStep("Customer email failed (non-blocking)", { error: String(e) });
            }
          }

          // Email to contractor
          if (contractorEmail) {
            try {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${resendApiKey}`,
                },
                body: JSON.stringify({
                  from: "Lawn Care <onboarding@resend.dev>",
                  to: [contractorEmail],
                  subject: "Payment Released! 💰",
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h1 style="color: #16a34a;">Payment Released! 💰</h1>
                      <p>Hi ${contractorName},</p>
                      <p>Payment for Job #${booking.id.slice(0, 8)} has been released and is on its way to your bank account (1-2 business days).</p>
                      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Your Earnings:</strong> $${(Number(booking.total_price) * 0.85).toFixed(2)} AUD</p>
                      </div>
                      <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
                    </div>
                  `,
                }),
              });
              logStep("Contractor email sent", { bookingId: booking.id });
            } catch (e) {
              logStep("Contractor email failed (non-blocking)", { error: String(e) });
            }
          }
        }

        // 5. Send notification to customer
        await supabase.from("notifications").insert({
          user_id: booking.user_id,
          title: "Payment Auto-Released",
          message: `Payment of $${Number(booking.total_price).toFixed(2)} for your lawn service on ${booking.scheduled_date} has been automatically released to ${contractorName}. You can still report an issue within 7 days.`,
          type: "info",
          booking_id: booking.id,
        });

        results.push({ bookingId: booking.id, success: true });
      } catch (bookingError) {
        const errorMsg = bookingError instanceof Error ? bookingError.message : String(bookingError);
        logStep("Failed to process booking", { bookingId: booking.id, error: errorMsg });
        results.push({ bookingId: booking.id, success: false, error: errorMsg });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    logStep("Cron job complete", { total: bookings.length, success: successCount, failed: failCount });

    return new Response(
      JSON.stringify({ success: true, released: successCount, failed: failCount, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("FATAL ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
