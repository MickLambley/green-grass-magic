import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ stripePaymentUrl: null, reason: "No Stripe key configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

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
      .select("id, business_name, stripe_account_id, stripe_onboarding_complete")
      .eq("user_id", userData.user.id)
      .single();

    if (!contractor || contractor.id !== invoice.contractor_id) {
      throw new Error("Not authorized");
    }

    const hasStripe = contractor.stripe_account_id && contractor.stripe_onboarding_complete;
    if (!hasStripe) {
      return new Response(
        JSON.stringify({ stripePaymentUrl: null, reason: "Stripe not connected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // If invoice already has a payment URL, return it
    if (invoice.stripe_payment_url) {
      return new Response(
        JSON.stringify({ stripePaymentUrl: invoice.stripe_payment_url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    const total = Number(invoice.total);
    const totalCents = Math.round(total * 100);
    const invoiceNumber = invoice.invoice_number || "";
    const businessName = contractor.business_name || "Invoice";

    const price = await stripe.prices.create({
      unit_amount: totalCents,
      currency: "aud",
      product_data: {
        name: `Tax Invoice ${invoiceNumber} — ${businessName}`,
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
    const stripePaymentUrl = paymentLink.url;

    // Persist
    await supabase.from("invoices").update({ stripe_payment_url: stripePaymentUrl }).eq("id", invoiceId);

    console.log("[GENERATE-PAYMENT-LINK] Created:", stripePaymentUrl);

    return new Response(
      JSON.stringify({ stripePaymentUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[GENERATE-PAYMENT-LINK] ERROR:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
