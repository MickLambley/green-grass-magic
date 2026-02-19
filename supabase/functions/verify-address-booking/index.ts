import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-ADDRESS-BOOKING] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: adminRole } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { addressId } = await req.json();
    if (!addressId) {
      return new Response(JSON.stringify({ error: "Missing addressId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Processing address verification bookings", { addressId });

    // Fetch verified address data
    const { data: address, error: addrError } = await serviceClient
      .from("addresses")
      .select("id, square_meters, slope, tier_count, status, user_id")
      .eq("id", addressId)
      .single();

    if (addrError || !address) {
      return new Response(JSON.stringify({ error: "Address not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find bookings pending address verification for this address
    const { data: pendingBookings, error: bookingsError } = await serviceClient
      .from("bookings")
      .select("id, total_price, grass_length, clippings_removal, scheduled_date, user_id")
      .eq("address_id", addressId)
      .eq("status", "pending_address_verification");

    if (bookingsError) {
      logStep("Error fetching bookings", { error: bookingsError.message });
      return new Response(JSON.stringify({ error: "Failed to fetch bookings" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingBookings || pendingBookings.length === 0) {
      logStep("No pending bookings for this address");
      return new Response(JSON.stringify({ message: "No pending bookings", updated: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Found pending bookings", { count: pendingBookings.length });

    // If address was rejected, cancel all pending bookings
    if (address.status === "rejected") {
      for (const booking of pendingBookings) {
        await serviceClient
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", booking.id);

        // Notify customer
        await serviceClient.from("notifications").insert({
          user_id: booking.user_id,
          title: "Booking Cancelled - Address Rejected",
          message:
            "Your booking has been cancelled because your address could not be verified. Please contact us if you believe this is an error.",
          type: "warning",
          booking_id: booking.id,
        });

        // Send cancellation email
        try {
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (resendApiKey) {
            const { data: authData } = await serviceClient.auth.admin.getUserById(booking.user_id);
            const email = authData?.user?.email;
            if (email) {
              const { data: profile } = await serviceClient
                .from("profiles")
                .select("full_name")
                .eq("user_id", booking.user_id)
                .single();
              
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${resendApiKey}`,
                },
                body: JSON.stringify({
                  from: "Lawn Care <onboarding@resend.dev>",
                  to: [email],
                  subject: "Booking Cancelled - Address Could Not Be Verified",
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h1 style="color: #dc2626;">Booking Cancelled ❌</h1>
                      <p>Hi ${profile?.full_name || "Valued Customer"},</p>
                      <p>Unfortunately, we were unable to verify your address and your booking has been cancelled.</p>
                      <p>If you believe this is an error, please contact our support team.</p>
                      <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
                    </div>
                  `,
                }),
              });
            }
          }
        } catch (e) {
          logStep("Email error (non-blocking)", { error: String(e) });
        }
      }

      return new Response(
        JSON.stringify({ message: "Bookings cancelled due to address rejection", updated: pendingBookings.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Address verified - fetch pricing to recalculate quotes
    const { data: pricingData } = await serviceClient
      .from("pricing_settings")
      .select("key, value");

    const settings: Record<string, number> = {};
    pricingData?.forEach((row) => {
      settings[row.key] = Number(row.value);
    });

    const GST_RATE = 0.1;
    let updated = 0;

    for (const booking of pendingBookings) {
      // Recalculate quote with verified address data
      const basePrice = settings.fixed_base_price || 0;
      const areaPrice = Number(address.square_meters) * (settings.base_price_per_sqm || 0);

      let slopeMultiplier = 1;
      if (address.slope === "mild") slopeMultiplier = settings.slope_mild_multiplier || 1;
      if (address.slope === "steep") slopeMultiplier = settings.slope_steep_multiplier || 1;

      const tierMultiplier = 1 + (address.tier_count - 1) * (settings.tier_multiplier || 0);
      const grassLengthKey = `grass_length_${booking.grass_length}`;
      const grassLengthMultiplier = settings[grassLengthKey] || 1;
      const clippingsCost = booking.clippings_removal ? settings.clipping_removal_cost || 0 : 0;

      const date = new Date(booking.scheduled_date);
      const dayOfWeek = date.getDay();
      let daySurcharge = 1;
      if (dayOfWeek === 6) daySurcharge = settings.saturday_surcharge || 1;
      if (dayOfWeek === 0) daySurcharge = settings.sunday_surcharge || 1;

      const subtotal = (basePrice + areaPrice) * slopeMultiplier * tierMultiplier * grassLengthMultiplier;
      const total = Math.round((subtotal * daySurcharge + clippingsCost) * 100) / 100;
      const newTotalWithGst = Math.round((total + total * GST_RATE) * 100) / 100;

      const originalPrice = Number(booking.total_price) || 0;
      const priceDifference = Math.abs(newTotalWithGst - originalPrice);
      const priceIncreased = newTotalWithGst > originalPrice && priceDifference > 0.5; // More than 50c difference

      logStep("Quote recalculated", {
        bookingId: booking.id,
        originalPrice,
        newPrice: newTotalWithGst,
        priceIncreased,
      });

      if (priceIncreased) {
        // Price increased - needs customer approval
        await serviceClient
          .from("bookings")
          .update({
            status: "price_change_pending",
            original_price: originalPrice,
            total_price: newTotalWithGst,
            price_change_notified_at: new Date().toISOString(),
            quote_breakdown: {
              basePrice,
              areaPrice: Math.round(areaPrice * 100) / 100,
              slopeMultiplier,
              tierMultiplier,
              grassLengthMultiplier,
              clippingsCost,
              daySurcharge,
              subtotal: Math.round(subtotal * 100) / 100,
              total,
            },
          })
          .eq("id", booking.id);

        // Notify customer of price change
        await serviceClient.from("notifications").insert({
          user_id: booking.user_id,
          title: "Price Update - Action Required",
          message: `Your address has been verified and the updated price is $${newTotalWithGst.toFixed(2)} (was $${originalPrice.toFixed(2)}). Please review and approve the new price to confirm your booking.`,
          type: "warning",
          booking_id: booking.id,
        });

        // Send price change email
        try {
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (resendApiKey) {
            const { data: authData } = await serviceClient.auth.admin.getUserById(booking.user_id);
            const email = authData?.user?.email;
            if (email) {
              const { data: profile } = await serviceClient
                .from("profiles")
                .select("full_name")
                .eq("user_id", booking.user_id)
                .single();

              const dashboardUrl = Deno.env.get("SITE_URL") || "https://green-lawn-joy.lovable.app";

              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${resendApiKey}`,
                },
                body: JSON.stringify({
                  from: "Lawn Care <onboarding@resend.dev>",
                  to: [email],
                  subject: "Price Update - Action Required for Your Booking",
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h1 style="color: #2563eb;">Price Update 📝</h1>
                      <p>Hi ${profile?.full_name || "Valued Customer"},</p>
                      <p>Your address has been verified! Based on the verified lawn size, the price for your booking has been updated.</p>
                      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Original Price:</strong> <s>$${originalPrice.toFixed(2)}</s></p>
                        <p style="margin: 5px 0;"><strong>Updated Price:</strong> $${newTotalWithGst.toFixed(2)}</p>
                      </div>
                      <p>Please log in to your dashboard to approve the new price or cancel your booking.</p>
                      <div style="margin: 30px 0;">
                        <a href="${dashboardUrl}/dashboard" style="background-color: #16a34a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Review & Approve</a>
                      </div>
                      <p style="color: #666; font-size: 14px;">If you don't respond within 48 hours, your booking will be automatically cancelled.</p>
                      <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
                    </div>
                  `,
                }),
              });
            }
          }
        } catch (e) {
          logStep("Email error (non-blocking)", { error: String(e) });
        }
      } else {
        // Price same or decreased - auto-confirm, move to pending (awaiting payment setup)
        const updateData: Record<string, unknown> = {
          status: "pending",
          payment_status: "unpaid",
        };

        // Update price if it decreased
        if (newTotalWithGst !== originalPrice) {
          updateData.total_price = newTotalWithGst;
          updateData.original_price = originalPrice;
          updateData.quote_breakdown = {
            basePrice,
            areaPrice: Math.round(areaPrice * 100) / 100,
            slopeMultiplier,
            tierMultiplier,
            grassLengthMultiplier,
            clippingsCost,
            daySurcharge,
            subtotal: Math.round(subtotal * 100) / 100,
            total,
          };
        }

        await serviceClient.from("bookings").update(updateData).eq("id", booking.id);

        // Notify customer
        const priceNote =
          newTotalWithGst < originalPrice
            ? ` The price has been adjusted to $${newTotalWithGst.toFixed(2)} (was $${originalPrice.toFixed(2)}).`
            : "";

        await serviceClient.from("notifications").insert({
          user_id: booking.user_id,
          title: "Address Verified - Complete Your Booking",
          message: `Your address has been verified!${priceNote} Please add a payment method to confirm your booking.`,
          type: "success",
          booking_id: booking.id,
        });

        // Send confirmation email
        try {
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (resendApiKey) {
            const { data: authData } = await serviceClient.auth.admin.getUserById(booking.user_id);
            const email = authData?.user?.email;
            if (email) {
              const { data: profile } = await serviceClient
                .from("profiles")
                .select("full_name")
                .eq("user_id", booking.user_id)
                .single();

              const dashboardUrl = Deno.env.get("SITE_URL") || "https://green-lawn-joy.lovable.app";

              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${resendApiKey}`,
                },
                body: JSON.stringify({
                  from: "Lawn Care <onboarding@resend.dev>",
                  to: [email],
                  subject: "Address Verified - Complete Your Booking! ✅",
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h1 style="color: #16a34a;">Address Verified! ✅</h1>
                      <p>Hi ${profile?.full_name || "Valued Customer"},</p>
                      <p>Great news! Your address has been verified.${priceNote}</p>
                      <p>Please log in to your dashboard to add a payment method and confirm your booking.</p>
                      <div style="margin: 30px 0;">
                        <a href="${dashboardUrl}/dashboard" style="background-color: #16a34a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Complete Booking</a>
                      </div>
                      <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
                    </div>
                  `,
                }),
              });
            }
          }
        } catch (e) {
          logStep("Email error (non-blocking)", { error: String(e) });
        }
      }

      updated++;
    }

    return new Response(
      JSON.stringify({ message: "Bookings processed", updated }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    logStep("ERROR", { error: String(error) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
