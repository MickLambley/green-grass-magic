import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: Record<string, unknown>) => {
  console.log(`[COMPLETE-JOB-V2] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const userId = userData.user.id;
    log("Authenticated", { userId });

    // Verify contractor
    const { data: contractor } = await supabase
      .from("contractors")
      .select("id, user_id, business_name, stripe_account_id, gst_registered, subscription_tier")
      .eq("user_id", userId)
      .single();
    if (!contractor) throw new Error("Contractor not found");

    const { jobId, action } = await req.json();
    // action: "complete" (initial), "generate_invoice", "send_payment_link", "mark_paid"
    if (!jobId) throw new Error("Missing jobId");

    // Fetch job
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .eq("contractor_id", contractor.id)
      .single();

    if (jobErr || !job) throw new Error("Job not found or unauthorized");

    // Fetch client
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, email, user_id")
      .eq("id", job.client_id)
      .single();

    if (!client) throw new Error("Client not found");

    // ─── ACTION: COMPLETE ───
    if (action === "complete") {
      if (job.status !== "scheduled" && job.status !== "in_progress" && job.status !== "confirmed" && job.status !== "pending_confirmation") {
        throw new Error(`Cannot complete job in status: ${job.status}`);
      }

      const now = new Date().toISOString();

      if (job.source === "website_booking") {
        // PATH A: Auto-charge saved payment method
        log("Path A: Website booking auto-charge", { jobId });

        if (!stripeSecretKey) throw new Error("Stripe not configured");
        if (!job.payment_method_id || !job.stripe_customer_id) {
          throw new Error("No saved payment method for this website booking");
        }
        if (!job.total_price || job.total_price <= 0) {
          throw new Error("Job has no valid price to charge");
        }

        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

        // Calculate application fee based on subscription tier
        const feePercentages: Record<string, number> = {
          free: 0.05,
          starter: 0.025,
          pro: 0.01,
        };
        const feePercent = feePercentages[contractor.subscription_tier] || 0.05;
        const amountCents = Math.round(Number(job.total_price) * 100);
        const applicationFee = Math.round(amountCents * feePercent);

        // Create payment intent and charge immediately
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: "aud",
          customer: job.stripe_customer_id,
          payment_method: job.payment_method_id,
          off_session: true,
          confirm: true,
          application_fee_amount: contractor.stripe_account_id ? applicationFee : undefined,
          transfer_data: contractor.stripe_account_id ? {
            destination: contractor.stripe_account_id,
          } : undefined,
          metadata: {
            job_id: jobId,
            contractor_id: contractor.id,
            source: "website_booking",
          },
        });

        log("Payment captured", { paymentIntentId: paymentIntent.id, amount: amountCents });

        // Auto-generate invoice
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
        const subtotal = Number(job.total_price);
        const gstAmount = contractor.gst_registered ? subtotal * 0.1 : 0;
        const total = subtotal + gstAmount;

        const { data: invoice } = await supabase
          .from("invoices")
          .insert({
            contractor_id: contractor.id,
            client_id: job.client_id,
            job_id: jobId,
            invoice_number: invoiceNumber,
            line_items: [{ description: job.title, quantity: 1, unit_price: subtotal }],
            subtotal,
            gst_amount: gstAmount,
            total,
            status: "paid",
            paid_at: now,
          })
          .select("id")
          .single();

        // Record transaction fee
        const stripeFee = Math.round(amountCents * 0.0175 + 30) / 100; // ~1.75% + 30c
        await supabase.from("transaction_fees").insert({
          contractor_id: contractor.id,
          job_id: jobId,
          payment_amount: subtotal,
          stripe_fee: stripeFee,
          yardly_fee: applicationFee / 100,
          yardly_fee_percentage: feePercent * 100,
          contractor_payout: subtotal - stripeFee - applicationFee / 100,
        });

        // Update job
        await supabase.from("jobs").update({
          status: "completed",
          completed_at: now,
          payment_status: "paid",
          payment_intent_id: paymentIntent.id,
        }).eq("id", jobId);

        // Notify customer
        if (client.user_id) {
          await supabase.from("notifications").insert({
            user_id: client.user_id,
            title: "✅ Job Complete & Paid",
            message: `Your ${job.title} by ${contractor.business_name || "your contractor"} is complete. Payment of $${total.toFixed(2)} has been processed.`,
            type: "success",
          });
        }

        // Send receipt email
        try {
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (resendApiKey && client.email) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
              body: JSON.stringify({
                from: "Yardly <onboarding@resend.dev>",
                to: [client.email],
                subject: `Receipt: ${job.title} - $${total.toFixed(2)}`,
                html: `
                  <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #16a34a;">✅ Payment Receipt</h1>
                    <p>Hi ${client.name},</p>
                    <p>Your ${job.title} has been completed by ${contractor.business_name || "your contractor"}.</p>
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <p><strong>Invoice:</strong> ${invoiceNumber}</p>
                      <p><strong>Service:</strong> ${job.title}</p>
                      <p><strong>Subtotal:</strong> $${subtotal.toFixed(2)}</p>
                      ${gstAmount > 0 ? `<p><strong>GST:</strong> $${gstAmount.toFixed(2)}</p>` : ""}
                      <p><strong>Total Charged:</strong> $${total.toFixed(2)}</p>
                    </div>
                    <p style="color: #666; font-size: 14px;">Powered by Yardly</p>
                  </div>
                `,
              }),
            });
            log("Receipt email sent");
          }
        } catch (e) {
          log("Receipt email failed (non-blocking)", { error: String(e) });
        }

        return new Response(JSON.stringify({
          success: true,
          path: "website_booking",
          payment_status: "paid",
          invoice_id: invoice?.id,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } else {
        // PATH B: Manual job — just mark as completed, return options
        log("Path B: Manual job completion", { jobId });

        await supabase.from("jobs").update({
          status: "completed",
          completed_at: now,
        }).eq("id", jobId);

        return new Response(JSON.stringify({
          success: true,
          path: "manual",
          options: ["generate_invoice", "send_payment_link"],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ─── ACTION: GENERATE INVOICE ───
    if (action === "generate_invoice") {
      if (job.source !== "manual") throw new Error("Only manual jobs support invoice generation");

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
      const subtotal = Number(job.total_price) || 0;
      const gstAmount = contractor.gst_registered ? subtotal * 0.1 : 0;
      const total = subtotal + gstAmount;

      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          contractor_id: contractor.id,
          client_id: job.client_id,
          job_id: jobId,
          invoice_number: invoiceNumber,
          line_items: [{ description: job.title, quantity: 1, unit_price: subtotal }],
          subtotal,
          gst_amount: gstAmount,
          total,
          status: "unpaid",
        })
        .select("id")
        .single();

      if (invErr) throw new Error(`Failed to create invoice: ${invErr.message}`);

      await supabase.from("jobs").update({ payment_status: "invoiced" }).eq("id", jobId);

      log("Invoice generated", { invoiceId: invoice?.id });

      return new Response(JSON.stringify({
        success: true,
        invoice_id: invoice?.id,
        invoice_number: invoiceNumber,
        total,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACTION: SEND PAYMENT LINK ───
    if (action === "send_payment_link") {
      if (!stripeSecretKey) throw new Error("Stripe not configured");

      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
      const amount = Number(job.total_price) || 0;
      if (amount <= 0) throw new Error("Job has no valid price");

      const gstAmount = contractor.gst_registered ? amount * 0.1 : 0;
      const totalCents = Math.round((amount + gstAmount) * 100);

      // Create a Stripe Payment Link via price + payment link
      const price = await stripe.prices.create({
        unit_amount: totalCents,
        currency: "aud",
        product_data: {
          name: `${job.title} - ${contractor.business_name || "Service"}`,
        },
      });

      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: {
          job_id: jobId,
          contractor_id: contractor.id,
        },
        application_fee_amount: contractor.stripe_account_id ? Math.round(totalCents * 0.01) : undefined,
        transfer_data: contractor.stripe_account_id ? {
          destination: contractor.stripe_account_id,
        } : undefined,
      });

      await supabase.from("jobs").update({
        payment_status: "invoiced",
        stripe_payment_link_id: paymentLink.id,
        stripe_payment_link_url: paymentLink.url,
      }).eq("id", jobId);

      log("Payment link created", { url: paymentLink.url });

      return new Response(JSON.stringify({
        success: true,
        payment_link_url: paymentLink.url,
        payment_link_id: paymentLink.id,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACTION: MARK PAID (manual) ───
    if (action === "mark_paid") {
      await supabase.from("jobs").update({
        payment_status: "paid",
      }).eq("id", jobId);

      // Also update linked invoice
      await supabase.from("invoices").update({
        status: "paid",
        paid_at: new Date().toISOString(),
      }).eq("job_id", jobId).eq("contractor_id", contractor.id);

      log("Job manually marked as paid", { jobId });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
