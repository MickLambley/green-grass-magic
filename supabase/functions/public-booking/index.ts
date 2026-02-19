import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { contractor_slug, customer_name, customer_email, customer_phone, service_type, address, preferred_date, preferred_time, notes } = await req.json();

    if (!contractor_slug || !customer_name || !customer_email || !service_type || !preferred_date) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      .eq("email", customer_email)
      .maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          contractor_id: contractor.id,
          name: customer_name,
          email: customer_email,
          phone: customer_phone || null,
          address: address ? { street: address } : null,
        })
        .select("id")
        .single();

      if (clientErr || !newClient) {
        console.error("Client creation error:", clientErr);
        return new Response(JSON.stringify({ error: "Failed to create client record" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      clientId = newClient.id;
    }

    // Create job with source = website_booking
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        contractor_id: contractor.id,
        client_id: clientId,
        title: service_type || "Lawn Mowing",
        description: notes || null,
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
      message: `${customer_name} has requested a ${service_type} on ${preferred_date}. Review and confirm the job.`,
      type: "booking",
    });

    return new Response(JSON.stringify({ success: true, job_id: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-booking error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
