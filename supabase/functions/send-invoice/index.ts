import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Format ABN as XX XXX XXX XXX */
function formatAbn(abn: string): string {
  const digits = abn.replace(/\s/g, "");
  if (digits.length !== 11) return abn;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}

const YARDLY_FOOTER = `<p style="color: #999; font-size: 11px; text-align: center; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">Sent via Yardly · yardly.app</p>`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const { invoiceId } = await req.json();
    if (!invoiceId) throw new Error("Missing invoiceId");

    // Fetch invoice
    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invError || !invoice) throw new Error("Invoice not found");

    // Verify contractor owns this invoice
    const { data: contractor } = await supabase
      .from("contractors")
      .select("id, business_name, gst_registered, abn, phone, bank_bsb, bank_account_number, stripe_account_id, stripe_onboarding_complete, questionnaire_responses")
      .eq("user_id", userData.user.id)
      .single();

    if (!contractor || contractor.id !== invoice.contractor_id) {
      throw new Error("Not authorized");
    }

    // Get contractor's login email for reply-to
    const contractorEmail = userData.user.email;

    // Get contractor's full name as fallback
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userData.user.id)
      .single();

    // Get client
    const { data: client } = await supabase
      .from("clients")
      .select("name, email, business_client, client_abn")
      .eq("id", invoice.client_id)
      .single();

    if (!client?.email) throw new Error("Client has no email address");

    // Build line items HTML
    const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
    const lineItemsHtml = (lineItems as Array<{ description: string; quantity: number; unit_price: number }>)
      .map((li) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${li.description}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${li.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(li.unit_price).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(li.quantity * li.unit_price).toFixed(2)}</td>
        </tr>
      `).join("");

    const senderName = contractor.business_name || contractorProfile?.full_name || "Yardly";
    const businessName = contractor.business_name || "Your Contractor";
    const isGst = contractor.gst_registered;
    const invoiceLabel = "Tax Invoice";
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
      : "Upon receipt";
    const dueDateShort = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : null;

    // Payment methods
    const hasStripe = contractor.stripe_account_id && contractor.stripe_onboarding_complete;
    const hasBankTransfer = !!(contractor.bank_bsb && contractor.bank_account_number);
    const responses = (contractor.questionnaire_responses as Record<string, unknown>) || {};
    const bankAccountName = (responses.bank_account_name as string) || businessName;
    const invoiceNumber = invoice.invoice_number || "";

    // Totals
    const subtotal = Number(invoice.subtotal);
    const gstAmount = Number(invoice.gst_amount);
    const total = Number(invoice.total);
    const subtotalExGst = subtotal - gstAmount;

    // ABN
    const contractorAbn = contractor.abn ? formatAbn(contractor.abn) : null;

    // Client ABN for business clients on $1000+ invoices
    let clientAbnHtml = "";
    if (isGst && client.business_client && total >= 1000 && client.client_abn) {
      clientAbnHtml = `<p style="margin: 2px 0 0; font-size: 13px; color: #666;">ABN: ${formatAbn(client.client_abn)}</p>`;
    }

    // Totals section
    let totalsHtml = "";
    if (isGst) {
      totalsHtml = `
        <p style="margin: 4px 0;">Subtotal (ex. GST): <strong>$${subtotalExGst.toFixed(2)}</strong></p>
        <p style="margin: 4px 0;">GST (10%): <strong>$${gstAmount.toFixed(2)}</strong></p>
        <p style="margin: 8px 0 0; font-size: 20px; font-weight: bold;">Total (inc. GST): $${total.toFixed(2)}</p>
      `;
    } else {
      totalsHtml = `
        <p style="margin: 8px 0 0; font-size: 20px; font-weight: bold;">Total: $${total.toFixed(2)}</p>
      `;
    }

    // Rate column header
    const rateHeader = isGst ? "Rate (inc. GST)" : "Rate";

    // ─── Create Stripe Payment Link if Stripe is connected ───
    let stripePaymentUrl: string | null = null;
    if (hasStripe && stripeSecretKey) {
      try {
        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
        const totalCents = Math.round(total * 100);

        const price = await stripe.prices.create({
          unit_amount: totalCents,
          currency: "aud",
          product_data: {
            name: `${invoiceLabel} ${invoiceNumber} — ${businessName}`,
          },
        });

        const paymentLinkParams: Stripe.PaymentLinkCreateParams = {
          line_items: [{ price: price.id, quantity: 1 }],
          metadata: {
            invoice_id: invoiceId,
            contractor_id: contractor.id,
            invoice_number: invoiceNumber,
          },
        };

        if (contractor.stripe_account_id) {
          paymentLinkParams.application_fee_amount = Math.round(totalCents * 0.01);
          paymentLinkParams.transfer_data = {
            destination: contractor.stripe_account_id,
          };
        }

        const paymentLink = await stripe.paymentLinks.create(paymentLinkParams);
        stripePaymentUrl = paymentLink.url;
        console.log("[SEND-INVOICE] Stripe payment link created:", stripePaymentUrl);

        // Persist the payment URL on the invoice record
        await supabase.from("invoices").update({ stripe_payment_url: stripePaymentUrl }).eq("id", invoiceId);
      } catch (stripeErr) {
        console.error("[SEND-INVOICE] Failed to create Stripe payment link, continuing without it:", stripeErr);
      }
    }

    // Payment section
    let paymentSectionHtml = "";
    if (hasStripe || hasBankTransfer) {
      let stripeHtml = "";
      if (hasStripe && stripePaymentUrl) {
        stripeHtml = `
          <div style="margin-bottom: 16px;">
            <p style="margin: 0 0 12px; font-weight: bold; color: #16a34a;">💳 Pay instantly by credit or debit card</p>
            <a href="${stripePaymentUrl}" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 12px 32px; border-radius: 6px;">Pay Now — $${total.toFixed(2)}</a>
            <p style="margin: 8px 0 0; font-size: 12px; color: #888;">Secure payment powered by Stripe.</p>
          </div>
        `;
      } else if (hasStripe) {
        stripeHtml = `
          <div style="margin-bottom: 16px;">
            <p style="margin: 0 0 8px; font-weight: bold; color: #16a34a;">💳 Pay instantly by credit or debit card</p>
            <p style="margin: 0; font-size: 13px; color: #666;">Contact ${businessName} to receive a secure payment link.</p>
          </div>
        `;
      }

      let bankHtml = "";
      if (hasBankTransfer) {
        bankHtml = `
          <div>
            <p style="margin: 0 0 8px; font-weight: bold; color: #333;">${hasStripe ? "Or pay" : "Pay"} by Bank Transfer</p>
            <table style="font-size: 13px; color: #555;">
              <tr><td style="padding: 2px 12px 2px 0; font-weight: 600;">BSB:</td><td>${contractor.bank_bsb}</td></tr>
              <tr><td style="padding: 2px 12px 2px 0; font-weight: 600;">Account:</td><td>${contractor.bank_account_number}</td></tr>
              <tr><td style="padding: 2px 12px 2px 0; font-weight: 600;">Name:</td><td>${bankAccountName}</td></tr>
              <tr><td style="padding: 2px 12px 2px 0; font-weight: 600;">Reference:</td><td>${invoiceNumber}</td></tr>
            </table>
            <p style="margin: 8px 0 0; font-size: 12px; color: #888;">Please use your invoice number as the payment reference.</p>
          </div>
        `;
      }

      paymentSectionHtml = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin-top: 20px;">
          <h3 style="margin: 0 0 12px; font-size: 16px; color: #333;">💰 How to Pay</h3>
          ${stripeHtml}
          ${bankHtml}
        </div>
      `;
    }

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #16a34a; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${invoiceLabel} ${invoiceNumber}</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0;">From ${businessName}</p>
          ${contractorAbn ? `<p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">ABN: ${contractorAbn}</p>` : ""}
        </div>
        
        <div style="padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hi ${client.name},</p>
          <p>Please find your ${invoiceLabel.toLowerCase()} below.</p>

          ${clientAbnHtml ? `<div style="margin-bottom: 12px;">${clientAbnHtml}</div>` : ""}
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 8px; text-align: left;">Description</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">${rateHeader}</th>
                <th style="padding: 8px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemsHtml}
            </tbody>
          </table>
          
          <div style="text-align: right; margin-top: 16px; border-top: 2px solid #e5e7eb; padding-top: 12px;">
            ${totalsHtml}
          </div>
          
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-top: 20px;">
            <p style="margin: 0;"><strong>Due Date:</strong> ${dueDate}</p>
            ${contractorAbn ? `<p style="margin: 4px 0 0;"><strong>ABN:</strong> ${contractorAbn}</p>` : ""}
            ${isGst ? `<p style="margin: 4px 0 0; font-size: 12px; color: #666;">All prices are in AUD. GST is included in the total.</p>` : ""}
          </div>

          ${paymentSectionHtml}
          
          ${invoice.notes ? `<p style="margin-top: 16px; color: #666;">${invoice.notes}</p>` : ""}
          
          ${YARDLY_FOOTER}
        </div>
      </div>
    `;

    // Build subject
    let subject = `Invoice ${invoiceNumber} from ${senderName} — $${total.toFixed(2)}`;
    if (dueDateShort) {
      subject += ` due ${dueDateShort}`;
    }

    const emailPayload: Record<string, unknown> = {
      from: `${senderName} <invoices@mail.lawnly.com.au>`,
      to: [client.email],
      subject,
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

    console.log("[SEND-INVOICE] Email sent to", client.email);

    return new Response(
      JSON.stringify({ success: true, stripePaymentUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SEND-INVOICE] ERROR:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
