import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const { quoteId } = await req.json();
    if (!quoteId) throw new Error("Missing quoteId");

    // Fetch quote (including token)
    const { data: quote, error: qError } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    if (qError || !quote) throw new Error("Quote not found");

    // Verify contractor owns this quote
    const { data: contractor } = await supabase
      .from("contractors")
      .select("id, business_name, gst_registered, abn, primary_color, business_logo_url")
      .eq("user_id", userData.user.id)
      .single();

    if (!contractor || contractor.id !== quote.contractor_id) {
      throw new Error("Not authorized");
    }

    // Get client
    const { data: client } = await supabase
      .from("clients")
      .select("name, email")
      .eq("id", quote.client_id)
      .single();

    if (!client?.email) throw new Error("Client has no email address");

    // Build quote response URL
    // Determine the app origin from the Referer header or fallback
    const referer = req.headers.get("referer") || req.headers.get("origin") || "";
    const appOrigin = referer ? new URL(referer).origin : "https://green-grass-magic.lovable.app";
    const quoteUrl = `${appOrigin}/quote?token=${quote.token}`;

    // Build line items HTML
    const lineItems = Array.isArray(quote.line_items) ? quote.line_items : [];
    const lineItemsHtml = (lineItems as Array<{ description: string; quantity: number; unit_price: number }>)
      .map((li) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${li.description}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${li.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(li.unit_price).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(li.quantity * li.unit_price).toFixed(2)}</td>
        </tr>
      `).join("");

    const businessName = contractor.business_name || "Your Contractor";
    const brandColor = contractor.primary_color || "#16a34a";
    const isGst = contractor.gst_registered;
    const validUntil = quote.valid_until
      ? new Date(quote.valid_until).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
      : null;

    const logoHtml = contractor.business_logo_url
      ? `<img src="${contractor.business_logo_url}" alt="${businessName}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover; margin-right: 12px; vertical-align: middle;" />`
      : "";

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: ${brandColor}; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${logoHtml}Quote from ${businessName}</h1>
          ${isGst && contractor.abn ? `<p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">ABN: ${contractor.abn}</p>` : ""}
        </div>
        
        <div style="padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-top: none;">
          <p>Hi ${client.name},</p>
          <p>Please find your quote below. We'd love to work with you!</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 8px; text-align: left;">Description</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Rate${isGst ? " (ex GST)" : ""}</th>
                <th style="padding: 8px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemsHtml}
            </tbody>
          </table>
          
          <div style="text-align: right; margin-top: 16px; border-top: 2px solid #e5e7eb; padding-top: 12px;">
            <p style="margin: 8px 0 0; font-size: 20px; font-weight: bold;">Total: $${Number(quote.total).toFixed(2)}</p>
          </div>
          
          ${validUntil ? `
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-top: 20px;">
            <p style="margin: 0;"><strong>Valid Until:</strong> ${validUntil}</p>
          </div>
          ` : ""}
          
          ${quote.notes ? `<p style="margin-top: 16px; color: #666;">${quote.notes}</p>` : ""}
          
          <!-- Accept / Decline Buttons -->
          <div style="margin-top: 32px; text-align: center;">
            <a href="${quoteUrl}" style="display: inline-block; background: ${brandColor}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin-right: 12px;">
              ✓ Accept Quote
            </a>
            <a href="${quoteUrl}" style="display: inline-block; background: #fff; color: #333; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; border: 2px solid #d1d5db;">
              ✗ Decline Quote
            </a>
          </div>
          <p style="text-align: center; color: #999; font-size: 12px; margin-top: 12px;">
            Click either button to view the full quote and confirm your decision.
          </p>
        </div>
        
        <div style="padding: 16px; text-align: center; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; background: #fafafa;">
          <p style="color: #666; margin: 0; font-size: 12px;">
            This quote was sent via Yardly. If you have questions, contact ${businessName} directly.
          </p>
        </div>
      </div>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Yardly <onboarding@resend.dev>",
        to: [client.email],
        subject: `Quote from ${businessName}`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      throw new Error(`Email send failed: ${errText}`);
    }

    console.log("[SEND-QUOTE] Email sent to", client.email, "with quote URL:", quoteUrl);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SEND-QUOTE] ERROR:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
