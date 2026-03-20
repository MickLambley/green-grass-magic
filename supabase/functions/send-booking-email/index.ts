import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YARDLY_FOOTER = `<p style="color: #999; font-size: 11px; text-align: center; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">Sent via Yardly · yardly.app</p>`;

interface BookingEmailRequest {
  bookingId: string;
  emailType: "created" | "confirmed" | "updated" | "cancelled";
}

async function validateAuth(req: Request): Promise<{ userId: string; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: "", error: "Missing or invalid authorization header" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);

  if (error || !data?.claims) {
    console.error("JWT validation failed:", error);
    return { userId: "", error: "Invalid or expired token" };
  }

  return { userId: data.claims.sub as string };
}

const getEmailContent = (
  emailType: string,
  booking: any,
  address: any,
  profile: any,
  senderName: string
) => {
  const customerName = profile?.full_name || "Valued Customer";
  const dateFormatted = new Date(booking.scheduled_date).toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const dateShort = new Date(booking.scheduled_date).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const baseInfo = `
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Address:</strong> ${address.street_address}, ${address.city}, ${address.state}</p>
      <p style="margin: 5px 0;"><strong>Date:</strong> ${dateFormatted}</p>
      <p style="margin: 5px 0;"><strong>Time:</strong> ${booking.scheduled_time || booking.time_slot}</p>
      <p style="margin: 5px 0;"><strong>Total:</strong> $${booking.total_price?.toFixed(2) || "0.00"}</p>
    </div>
  `;

  switch (emailType) {
    case "created":
      return {
        subject: `Booking request received — ${senderName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Booking Request Received! 🌿</h1>
            <p>Hi ${customerName},</p>
            <p>Thank you for your booking request! We've sent it to contractors in your area.</p>
            ${baseInfo}
            <p><strong>Your card has been saved but you will not be charged until a contractor accepts your job.</strong></p>
            <p>You will be charged <strong>$${booking.total_price?.toFixed(2) || "0.00"}</strong> when a contractor accepts.</p>
            <p>You'll receive another email once a contractor is assigned.</p>
            ${YARDLY_FOOTER}
          </div>
        `,
      };

    case "confirmed":
      return {
        subject: `Booking confirmed with ${senderName} — ${dateShort}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Booking Confirmed! ✅</h1>
            <p>Hi ${customerName},</p>
            <p>Great news! Your payment has been received and your lawn mowing booking is now confirmed.</p>
            ${baseInfo}
            <p>A contractor will arrive during your selected time slot. Please ensure access to your lawn on the scheduled date.</p>
            ${YARDLY_FOOTER}
          </div>
        `,
      };

    case "updated":
      return {
        subject: `Booking updated — ${senderName} — ${dateShort}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Booking Updated 📝</h1>
            <p>Hi ${customerName},</p>
            <p>Your lawn mowing booking has been updated. Here are the current details:</p>
            ${baseInfo}
            <p><strong>Status:</strong> ${booking.status}</p>
            <p>If you have any questions, please don't hesitate to contact us.</p>
            ${YARDLY_FOOTER}
          </div>
        `,
      };

    case "cancelled":
      return {
        subject: `Booking cancelled — ${senderName} — ${dateShort}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">Booking Cancelled ❌</h1>
            <p>Hi ${customerName},</p>
            <p>Your lawn mowing booking has been cancelled.</p>
            ${baseInfo}
            <p>If this was a mistake or you'd like to rebook, please visit our website.</p>
            ${YARDLY_FOOTER}
          </div>
        `,
      };

    default:
      return {
        subject: `Booking notification — ${senderName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Booking Notification</h1>
            <p>Hi ${customerName},</p>
            <p>Here's an update on your lawn mowing booking:</p>
            ${baseInfo}
            ${YARDLY_FOOTER}
          </div>
        `,
      };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, error: authError } = await validateAuth(req);
    if (authError) {
      console.error("Authentication failed:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Authenticated user ${userId} requesting email`);

    const { bookingId, emailType }: BookingEmailRequest = await req.json();

    console.log(`Processing ${emailType} email for booking ${bookingId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch booking details
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Error fetching booking:", bookingError);
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Authorization check
    const isOwner = booking.user_id === userId;
    let isContractor = false;
    if (booking.contractor_id) {
      const { data: contractorCheck } = await supabase
        .from("contractors")
        .select("id")
        .eq("user_id", userId)
        .eq("id", booking.contractor_id)
        .single();
      isContractor = !!contractorCheck;
    }

    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .single();
    const isAdmin = !!adminRole;

    if (!isOwner && !isContractor && !isAdmin) {
      console.error(`Authorization denied: User ${userId} attempted to send email for booking ${bookingId}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized to send email for this booking" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Authorization granted: owner=${isOwner}, contractor=${isContractor}, admin=${isAdmin}`);

    // Fetch address details
    const { data: address, error: addressError } = await supabase
      .from("addresses")
      .select("*")
      .eq("id", booking.address_id)
      .single();

    if (addressError || !address) {
      console.error("Error fetching address:", addressError);
      throw new Error("Address not found");
    }

    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", booking.user_id)
      .single();

    // Fetch user email from auth
    const { data: authData } = await supabase.auth.admin.getUserById(booking.user_id);
    const userEmail = authData?.user?.email;

    if (!userEmail) {
      console.error("User email not found for user:", booking.user_id);
      throw new Error("User email not found");
    }

    // Fetch contractor info for branding (if contractor assigned)
    let senderName = "Yardly";
    let contractorReplyTo: string | undefined;

    if (booking.contractor_id) {
      const { data: contractorData } = await supabase
        .from("contractors")
        .select("business_name, user_id")
        .eq("id", booking.contractor_id)
        .single();

      if (contractorData) {
        // Get contractor's login email for reply-to
        const { data: contractorAuth } = await supabase.auth.admin.getUserById(contractorData.user_id);
        contractorReplyTo = contractorAuth?.user?.email || undefined;

        // Get contractor profile name as fallback
        const { data: contractorProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", contractorData.user_id)
          .single();

        senderName = contractorData.business_name || contractorProfile?.full_name || "Yardly";
      }
    }

    const emailContent = getEmailContent(emailType, booking, address, profile, senderName);

    console.log(`Sending ${emailType} email to ${userEmail}`);

    const emailPayload: Record<string, unknown> = {
      from: `${senderName} <invoices@mail.yardly.app>`,
      to: [userEmail],
      subject: emailContent.subject,
      html: emailContent.html,
    };
    if (contractorReplyTo) {
      emailPayload.reply_to = contractorReplyTo;
    }

    const emailResponse = await resend.emails.send(emailPayload as any);

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-booking-email function:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});