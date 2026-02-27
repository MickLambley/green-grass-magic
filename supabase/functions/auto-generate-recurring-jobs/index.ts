import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[AUTO-RECURRING-JOBS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate: require CRON_SECRET
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      logStep("Unauthorized request rejected");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }

    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find all completed jobs that have a recurrence_rule and are the most recent in their series
    const { data: completedJobs, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("status", "completed")
      .not("recurrence_rule", "is", null);

    if (error) {
      logStep("Error fetching completed recurring jobs", { error: error.message });
      throw new Error(error.message);
    }

    logStep("Found completed recurring jobs", { count: completedJobs?.length || 0 });

    let created = 0;
    let skipped = 0;

    for (const job of completedJobs || []) {
      const rule = job.recurrence_rule as {
        frequency: "weekly" | "fortnightly" | "monthly";
        interval?: number;
        count?: number;
      };

      if (!rule?.frequency) {
        skipped++;
        continue;
      }

      // Calculate next date
      const lastDate = new Date(job.scheduled_date);
      const nextDate = new Date(lastDate);

      switch (rule.frequency) {
        case "weekly":
          nextDate.setDate(lastDate.getDate() + 7 * (rule.interval || 1));
          break;
        case "fortnightly":
          nextDate.setDate(lastDate.getDate() + 14);
          break;
        case "monthly":
          nextDate.setMonth(lastDate.getMonth() + (rule.interval || 1));
          break;
      }

      const nextDateStr = nextDate.toISOString().split("T")[0];

      // Check if a job already exists for this client on that date with same title
      const { data: existing } = await supabase
        .from("jobs")
        .select("id")
        .eq("contractor_id", job.contractor_id)
        .eq("client_id", job.client_id)
        .eq("scheduled_date", nextDateStr)
        .eq("title", job.title)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Check count limit — count total jobs with same contractor, client, title, and recurrence rule
      if (rule.count) {
        const { count: seriesCount } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("contractor_id", job.contractor_id)
          .eq("client_id", job.client_id)
          .eq("title", job.title)
          .not("recurrence_rule", "is", null);

        if (seriesCount && seriesCount >= rule.count) {
          skipped++;
          continue;
        }
      }

      // Create next job
      const { error: insertError } = await supabase.from("jobs").insert({
        contractor_id: job.contractor_id,
        client_id: job.client_id,
        title: job.title,
        description: job.description,
        scheduled_date: nextDateStr,
        scheduled_time: job.scheduled_time,
        duration_minutes: job.duration_minutes,
        total_price: job.total_price,
        notes: job.notes,
        status: "scheduled",
        source: job.source,
        recurrence_rule: job.recurrence_rule,
      });

      if (insertError) {
        logStep("Failed to create recurring job", {
          jobId: job.id,
          error: insertError.message,
        });
      } else {
        created++;
        logStep("Created recurring job", {
          originalJobId: job.id,
          nextDate: nextDateStr,
          clientId: job.client_id,
        });

        // Notify contractor
        const { data: contractor } = await supabase
          .from("contractors")
          .select("user_id")
          .eq("id", job.contractor_id)
          .single();

        if (contractor) {
          await supabase.from("notifications").insert({
            user_id: contractor.user_id,
            title: "🔄 Recurring Job Scheduled",
            message: `"${job.title}" has been auto-scheduled for ${nextDateStr}.`,
            type: "info",
          });
        }
      }
    }

    logStep("Completed", { created, skipped });

    return new Response(
      JSON.stringify({ success: true, created, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    logStep("ERROR", { message: e instanceof Error ? e.message : String(e) });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
