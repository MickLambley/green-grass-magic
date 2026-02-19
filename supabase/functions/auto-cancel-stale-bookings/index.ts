import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[AUTO-CANCEL-STALE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Cron job started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find bookings that have been in price_change_pending for > 7 days
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: bookings, error: queryError } = await supabase
      .from("bookings")
      .select("id, user_id, address_id, total_price, original_price, scheduled_date, price_change_notified_at")
      .eq("status", "price_change_pending")
      .lt("price_change_notified_at", cutoff);

    if (queryError) throw new Error(`Query failed: ${queryError.message}`);

    if (!bookings || bookings.length === 0) {
      logStep("No stale bookings found");
      return new Response(
        JSON.stringify({ success: true, cancelled: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    logStep("Found stale bookings", { count: bookings.length });

    let cancelledCount = 0;

    for (const booking of bookings) {
      try {
        // Cancel the booking
        const { error: updateError } = await supabase
          .from("bookings")
          .update({
            status: "cancelled",
            admin_notes: "Auto-cancelled: customer did not approve price change within 7 days",
          })
          .eq("id", booking.id);

        if (updateError) throw new Error(updateError.message);

        logStep("Cancelled booking", { bookingId: booking.id });

        // Notify customer in-app
        await supabase.from("notifications").insert({
          user_id: booking.user_id,
          title: "Booking Auto-Cancelled",
          message: `Your booking for ${booking.scheduled_date} was cancelled because the updated price was not approved within 7 days.`,
          type: "warning",
          booking_id: booking.id,
        });

        // Send cancellation email
        if (resendApiKey) {
          try {
            const { data: authData } = await supabase.auth.admin.getUserById(booking.user_id);
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", booking.user_id)
              .single();

            const email = authData?.user?.email;
            if (email) {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${resendApiKey}`,
                },
                body: JSON.stringify({
                  from: "Lawn Care <onboarding@resend.dev>",
                  to: [email],
                  subject: "Booking Cancelled – Price Change Not Approved",
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h1 style="color: #dc2626;">Booking Cancelled</h1>
                      <p>Hi ${profile?.full_name || "there"},</p>
                      <p>Your booking scheduled for ${new Date(booking.scheduled_date).toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} has been automatically cancelled because the updated price was not approved within 7 days.</p>
                      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Original Price:</strong> $${Number(booking.original_price).toFixed(2)}</p>
                        <p style="margin: 5px 0;"><strong>Updated Price:</strong> $${Number(booking.total_price).toFixed(2)}</p>
                      </div>
                      <p>If you'd like to rebook, please visit your dashboard to create a new booking.</p>
                      <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
                    </div>
                  `,
                }),
              });
              logStep("Cancellation email sent", { bookingId: booking.id });
            }
          } catch (e) {
            logStep("Email failed (non-blocking)", { error: String(e) });
          }
        }

        cancelledCount++;
      } catch (e) {
        logStep("Failed to cancel booking", { bookingId: booking.id, error: String(e) });
      }
    }

    logStep("Cron job complete", { cancelled: cancelledCount, total: bookings.length });

    return new Response(
      JSON.stringify({ success: true, cancelled: cancelledCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("FATAL ERROR", { message: msg });
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
