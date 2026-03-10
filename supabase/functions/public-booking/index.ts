import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_REGEX = /^(\+?61|0)[2-9]\d{8}$/;
const MAX_NAME_LEN = 100;
const MAX_EMAIL_LEN = 254;
const MAX_NOTES_LEN = 500;
const MAX_ADDRESS_LEN = 300;
const MAX_SERVICE_LEN = 100;

const ipRequests = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequests.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

function sanitizeText(text: string, maxLen: number): string {
  return text.trim().slice(0, maxLen);
}

function isValidFutureDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) return false;
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 90);
  return d <= maxDate;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();

    // ─── ACTION: GET SERVICES ───
    if (body.action === "get_services") {
      const { contractor_slug } = body;
      if (!contractor_slug) {
        return new Response(JSON.stringify({ error: "Missing contractor_slug" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: contractor } = await supabase
        .from("contractors")
        .select("id, website_published")
        .eq("subdomain", contractor_slug)
        .single();

      if (!contractor || !contractor.website_published) {
        return new Response(JSON.stringify({ services: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: offerings } = await supabase
        .from("service_offerings")
        .select("name, requires_quote, category")
        .eq("contractor_id", contractor.id)
        .eq("is_active", true)
        .order("created_at");

      return new Response(JSON.stringify({ services: offerings || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── BOOKING / QUOTE REQUEST ───
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("cf-connecting-ip") || "unknown";
    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { contractor_slug, customer_name, customer_email, customer_phone, service_type, address, preferred_date, preferred_time, notes, customer_user_id, requires_quote } = body;

    if (!contractor_slug || !customer_name || !customer_email || !service_type || !preferred_date) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanName = sanitizeText(String(customer_name), MAX_NAME_LEN);
    const cleanEmail = sanitizeText(String(customer_email), MAX_EMAIL_LEN).toLowerCase();
    const cleanService = sanitizeText(String(service_type), MAX_SERVICE_LEN);
    const cleanNotes = notes ? sanitizeText(String(notes), MAX_NOTES_LEN) : null;
    const cleanAddress = address ? sanitizeText(String(address), MAX_ADDRESS_LEN) : null;

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (customer_phone && !PHONE_REGEX.test(String(customer_phone).replace(/[\s\-()]/g, ""))) {
      return new Response(JSON.stringify({ error: "Invalid Australian phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidFutureDate(preferred_date)) {
      return new Response(JSON.stringify({ error: "Date must be within the next 90 days" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!cleanName || cleanName.length < 2) {
      return new Response(JSON.stringify({ error: "Name must be at least 2 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let validatedCustomerUserId: string | null = null;
    if (customer_user_id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer_user_id)) {
        return new Response(JSON.stringify({ error: "Invalid user ID format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(customer_user_id);
      if (!authErr && authUser?.user) {
        validatedCustomerUserId = customer_user_id;
      }
    }

    const { data: contractor, error: cErr } = await supabase
      .from("contractors")
      .select("id, user_id, business_name, website_published")
      .eq("subdomain", contractor_slug)
      .single();

    if (cErr || !contractor) {
      return new Response(JSON.stringify({ error: "Contractor not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contractor.website_published) {
      return new Response(JSON.stringify({ error: "This contractor's website is not active" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine if this service requires a quote
    let isQuoteRequest = !!requires_quote;
    if (!isQuoteRequest) {
      const { data: offering } = await supabase
        .from("service_offerings")
        .select("requires_quote")
        .eq("contractor_id", contractor.id)
        .eq("name", cleanService)
        .eq("is_active", true)
        .maybeSingle();
      if (offering?.requires_quote) isQuoteRequest = true;
    }

    // Find or create client
    let clientId: string;
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("contractor_id", contractor.id)
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
      if (validatedCustomerUserId) {
        await supabase
          .from("clients")
          .update({ user_id: validatedCustomerUserId })
          .eq("id", existingClient.id)
          .is("user_id", null);
      }
    } else {
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          contractor_id: contractor.id,
          name: cleanName,
          email: cleanEmail,
          phone: customer_phone ? String(customer_phone).replace(/[\s\-()]/g, "").slice(0, 15) : null,
          address: cleanAddress ? { street: cleanAddress } : null,
          user_id: validatedCustomerUserId || null,
        })
        .select("id")
        .single();

      if (clientErr || !newClient) {
        console.error("Client creation error:", clientErr);
        return new Response(JSON.stringify({ error: "Failed to create booking" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      clientId = newClient.id;
    }

    // Create job
    const jobData: Record<string, unknown> = {
      contractor_id: contractor.id,
      client_id: clientId,
      title: cleanService || "Lawn Mowing",
      description: cleanNotes,
      scheduled_date: preferred_date,
      scheduled_time: preferred_time || null,
      source: "website_booking",
      customer_email: cleanEmail,
      customer_phone: customer_phone || null,
      customer_user_id: validatedCustomerUserId,
    };

    if (isQuoteRequest) {
      jobData.status = "pending_confirmation";
      jobData.requires_quote = true;
      jobData.quote_status = "pending";
      jobData.payment_status = "unpaid";
    } else {
      jobData.status = "pending_confirmation";
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert(jobData)
      .select("id")
      .single();

    if (jobErr || !job) {
      console.error("Job creation error:", jobErr);
      return new Response(JSON.stringify({ error: "Failed to create booking" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify contractor
    const notifTitle = isQuoteRequest ? "📋 New Quote Request" : "🌐 New Website Booking";
    const notifMessage = isQuoteRequest
      ? `${cleanName} has requested a quote for ${cleanService} on ${preferred_date}. Review and send a quote.`
      : `${cleanName} has requested a ${cleanService} on ${preferred_date}. Review and confirm the job.`;

    await supabase.from("notifications").insert({
      user_id: contractor.user_id,
      title: notifTitle,
      message: notifMessage,
      type: "booking",
    });

    // Send email notification to contractor for quote requests
    if (isQuoteRequest) {
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        // Get contractor email
        const { data: contractorAuth } = await supabase.auth.admin.getUserById(contractor.user_id);
        const contractorEmail = contractorAuth?.user?.email;

        if (resendApiKey && contractorEmail) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
            body: JSON.stringify({
              from: "Yardly <onboarding@resend.dev>",
              to: [contractorEmail],
              subject: `New Quote Request: ${cleanService} from ${cleanName}`,
              html: `
                <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h1 style="color: #16a34a;">📋 New Quote Request</h1>
                  <p>You have a new quote request from <strong>${cleanName}</strong>.</p>
                  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Service:</strong> ${cleanService}</p>
                    <p><strong>Preferred Date:</strong> ${preferred_date}</p>
                    ${cleanAddress ? `<p><strong>Address:</strong> ${cleanAddress}</p>` : ""}
                    ${cleanNotes ? `<p><strong>Details:</strong> ${cleanNotes}</p>` : ""}
                    <p><strong>Email:</strong> ${cleanEmail}</p>
                    ${customer_phone ? `<p><strong>Phone:</strong> ${customer_phone}</p>` : ""}
                  </div>
                  <p>Log in to your Yardly dashboard to review and send a quote.</p>
                  <p style="color: #666; font-size: 14px;">Powered by Yardly</p>
                </div>
              `,
            }),
          });
          console.log("Quote request email sent to contractor");
        }
      } catch (e) {
        console.error("Email notification failed (non-blocking):", e);
      }
    }

    return new Response(JSON.stringify({ success: true, job_id: job.id, is_quote_request: isQuoteRequest }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-booking error:", e);
    return new Response(JSON.stringify({ error: "Failed to process booking" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
