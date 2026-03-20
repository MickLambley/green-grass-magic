import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YARDLY_FOOTER = `<p style="color: #999; font-size: 11px; text-align: center; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">Sent via Yardly · yardly.app</p>`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const { jobId } = await req.json();
    if (!jobId) throw new Error("Missing jobId");

    // Fetch job
    const { data: job, error: jErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (jErr || !job) throw new Error("Job not found");

    // Verify contractor owns this job
    const { data: contractor } = await supabase
      .from("contractors")
      .select("id, business_name, primary_color, user_id")
      .eq("id", job.contractor_id)
      .single();
    if (!contractor || contractor.user_id !== userData.user.id) throw new Error("Not authorized");

    // Get contractor's login email for reply-to and full name as fallback
    const contractorEmail = userData.user.email;
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userData.user.id)
      .single();

    // Get client email
    const { data: client } = await supabase
      .from("clients")
      .select("name, email, user_id")
      .eq("id", job.client_id)
      .single();

    const customerEmail = job.customer_email || client?.email;
    if (!customerEmail) {
      console.log("[SEND-JOB-QUOTE] No customer email, skipping email but quote saved");
      return new Response(
        JSON.stringify({ success: true, emailSent: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const senderName = contractor.business_name || contractorProfile?.full_name || "Yardly";
    const businessName = contractor.business_name || "Your Contractor";
    const brandColor = contractor.primary_color || "#16a34a";
    const clientName = client?.name || "Customer";
    const isHourly = job.quote_type === "hourly";

    const pricingHtml = isHourly
      ? `
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #666;">Hourly Rate:</td>
              <td style="padding: 4px 0; text-align: right; font-weight: bold;">$${Number(job.quoted_rate).toFixed(2)}/hr</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #666;">Estimated Hours:</td>
              <td style="padding: 4px 0; text-align: right; font-weight: bold;">${Number(job.quoted_hours)}</td>
            </tr>
            <tr style="border-top: 2px solid #e5e7eb;">
              <td style="padding: 8px 0 0; font-weight: bold;">Estimated Total:</td>
              <td style="padding: 8px 0 0; text-align: right; font-size: 20px; font-weight: bold; color: ${brandColor};">$${Number(job.total_price).toFixed(2)}</td>
            </tr>
          </table>
          <p style="margin: 8px 0 0; font-size: 12px; color: #999;">* Final amount may vary based on actual hours worked.</p>
        </div>`
      : `
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #666;">Quoted Price</p>
          <p style="margin: 8px 0 0; font-size: 28px; font-weight: bold; color: ${brandColor};">$${Number(job.total_price).toFixed(2)}</p>
        </div>`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: ${brandColor}; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Quote from ${businessName}</h1>
        </div>
        <div style="padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-top: none;">
          <p>Hi ${clientName},</p>
          <p>Here's our quote for <strong>${job.title}</strong>${job.description ? ` — ${job.description}` : ""}.</p>
          ${pricingHtml}
          ${job.notes ? `<p style="color: #666; margin-top: 16px;">${job.notes}</p>` : ""}
          <p style="margin-top: 24px;">If you have any questions, feel free to reach out to us directly.</p>
          <p style="color: #666;">— ${businessName}</p>
        </div>
        <div style="padding: 16px; text-align: center; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; background: #fafafa;">
          ${YARDLY_FOOTER}
        </div>
      </div>`;

    const emailPayload: Record<string, unknown> = {
      from: `${senderName} <invoices@mail.yardly.app>`,
      to: [customerEmail],
      subject: `Quote from ${senderName} for ${job.title}`,
      html: emailHtml,
    };
    if (contractorEmail) {
      emailPayload.reply_to = contractorEmail;
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      throw new Error(`Email send failed: ${errText}`);
    }

    // Send in-app notification if client has user_id
    if (client?.user_id) {
      await supabase.from("notifications").insert({
        user_id: client.user_id,
        title: "Quote Received",
        message: `${businessName} has quoted $${Number(job.total_price).toFixed(2)} for ${job.title}.`,
        type: "info",
      });
    }

    console.log(`[SEND-JOB-QUOTE] Quote email sent to ${customerEmail} for job ${jobId}`);

    return new Response(
      JSON.stringify({ success: true, emailSent: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[SEND-JOB-QUOTE] ERROR:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});