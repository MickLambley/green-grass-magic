import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

// In-memory rate limiter (per isolate — best-effort for edge)
const ipRequests = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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
    // Rate limiting
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("cf-connecting-ip") || "unknown";
    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { contractor_slug, customer_name, customer_email, customer_phone, service_type, address, preferred_date, preferred_time, notes, customer_user_id } = body;

    // Required field validation
    if (!contractor_slug || !customer_name || !customer_email || !service_type || !preferred_date) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Input format validation
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

    // Validate customer_user_id if provided — must be a valid UUID and belong to an actual auth user
    let validatedCustomerUserId: string | null = null;
    if (customer_user_id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer_user_id)) {
        return new Response(JSON.stringify({ error: "Invalid user ID format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify this user actually exists in auth
      const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(customer_user_id);
      if (authErr || !authUser?.user) {
        console.warn("customer_user_id does not match a real user, ignoring:", customer_user_id);
        // Silently ignore invalid user_id rather than linking to a non-existent user
      } else {
        validatedCustomerUserId = customer_user_id;
      }
    }

    // Find contractor by subdomain
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
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        contractor_id: contractor.id,
        client_id: clientId,
        title: cleanService || "Lawn Mowing",
        description: cleanNotes,
        scheduled_date: preferred_date,
        scheduled_time: preferred_time || null,
        status: "pending_confirmation",
        source: "website_booking",
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      console.error("Job creation error:", jobErr);
      return new Response(JSON.stringify({ error: "Failed to create booking" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify contractor
    await supabase.from("notifications").insert({
      user_id: contractor.user_id,
      title: "🌐 New Website Booking",
      message: `${cleanName} has requested a ${cleanService} on ${preferred_date}. Review and confirm the job.`,
      type: "booking",
    });

    return new Response(JSON.stringify({ success: true, job_id: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-booking error:", e);
    return new Response(JSON.stringify({ error: "Failed to process booking" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
