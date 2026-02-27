import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingEmailRequest {
  bookingId: string;
  emailType: "created" | "confirmed" | "updated" | "cancelled";
}

// Helper function to validate JWT and get user claims
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
  profile: any
) => {
  const customerName = profile?.full_name || "Valued Customer";
  const dateFormatted = new Date(booking.scheduled_date).toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
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
        subject: "Your Lawn Mowing Booking Request is Pending",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Booking Request Received! 🌿</h1>
            <p>Hi ${customerName},</p>
            <p>Thank you for your booking request! We've sent it to contractors in your area.</p>
            ${baseInfo}
            <p><strong>Your card has been saved but you will not be charged until a contractor accepts your job.</strong></p>
            <p>You will be charged <strong>$${booking.total_price?.toFixed(2) || "0.00"}</strong> when a contractor accepts.</p>
            <p>You'll receive another email once a contractor is assigned.</p>
            <p style="color: #666; margin-top: 30px;">Best regards,<br>The Yardly Team</p>
          </div>
        `,
      };

    case "confirmed":
      return {
        subject: "Your Lawn Mowing Booking is Confirmed! ✓",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Booking Confirmed! ✅</h1>
            <p>Hi ${customerName},</p>
            <p>Great news! Your payment has been received and your lawn mowing booking is now confirmed.</p>
            ${baseInfo}
            <p>A contractor will arrive during your selected time slot. Please ensure access to your lawn on the scheduled date.</p>
            <p style="color: #666; margin-top: 30px;">Best regards,<br>The Yardly Team</p>
          </div>
        `,
      };

    case "updated":
      return {
        subject: "Your Lawn Mowing Booking Has Been Updated",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Booking Updated 📝</h1>
            <p>Hi ${customerName},</p>
            <p>Your lawn mowing booking has been updated. Here are the current details:</p>
            ${baseInfo}
            <p><strong>Status:</strong> ${booking.status}</p>
            <p>If you have any questions, please don't hesitate to contact us.</p>
            <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawn Care Team</p>
          </div>
        `,
      };

    case "cancelled":
      return {
        subject: "Your Lawn Mowing Booking Has Been Cancelled",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">Booking Cancelled ❌</h1>
            <p>Hi ${customerName},</p>
            <p>Your lawn mowing booking has been cancelled.</p>
            ${baseInfo}
            <p>If this was a mistake or you'd like to rebook, please visit our website.</p>
            <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawn Care Team</p>
          </div>
        `,
      };

    default:
      return {
        subject: "Lawn Mowing Booking Notification",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Booking Notification</h1>
            <p>Hi ${customerName},</p>
            <p>Here's an update on your lawn mowing booking:</p>
            ${baseInfo}
            <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawn Care Team</p>
          </div>
        `,
      };
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
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

    // Create Supabase client with service role
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

    // Authorization check: verify user owns this booking, is assigned contractor, or is admin
    const isOwner = booking.user_id === userId;

    // Check if user is the assigned contractor
    let isContractor = false;
    if (booking.contractor_id) {
      const { data: contractor } = await supabase
        .from("contractors")
        .select("id")
        .eq("user_id", userId)
        .eq("id", booking.contractor_id)
        .single();
      isContractor = !!contractor;
    }

    // Check if user is an admin
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

    const emailContent = getEmailContent(emailType, booking, address, profile);

    console.log(`Sending ${emailType} email to ${userEmail}`);

    const emailResponse = await resend.emails.send({
      from: "Lawn Care <onboarding@resend.dev>",
      to: [userEmail],
      subject: emailContent.subject,
      html: emailContent.html,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-booking-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
