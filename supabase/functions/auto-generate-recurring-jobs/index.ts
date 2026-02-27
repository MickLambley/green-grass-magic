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
    // Authenticate: require CRON_SECRET or service role key
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isAuthorized = token && (token === cronSecret || token === serviceRoleKey);
    if (!isAuthorized) {
      logStep("Unauthorized request rejected");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }

    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Paginated fetch of completed recurring jobs
    const BATCH_SIZE = 100;
    let offset = 0;
    let created = 0;
    let skipped = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: completedJobs, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "completed")
        .not("recurrence_rule", "is", null)
        .range(offset, offset + BATCH_SIZE - 1)
        .order("scheduled_date", { ascending: false });

      if (error) {
        logStep("Error fetching completed recurring jobs", { error: error.message });
        throw new Error(error.message);
      }

      if (!completedJobs || completedJobs.length === 0) {
        hasMore = false;
        break;
      }

      logStep("Processing batch", { offset, count: completedJobs.length });

      // Collect all next-job candidates
      const toInsert: Array<Record<string, unknown>> = [];
      const notificationsToInsert: Array<Record<string, unknown>> = [];

      for (const job of completedJobs) {
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

        // Check count limit
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

        toInsert.push({
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

        // Prepare notification (contractor user_id resolved below)
        notificationsToInsert.push({
          contractor_id: job.contractor_id,
          title_text: job.title,
          next_date: nextDateStr,
        });
      }

      // Batch insert new jobs
      if (toInsert.length > 0) {
        const { error: insertError, data: insertedJobs } = await supabase
          .from("jobs")
          .insert(toInsert)
          .select("id");

        if (insertError) {
          logStep("Batch insert failed, falling back to individual inserts", { error: insertError.message });
          // Fallback: insert individually
          for (const job of toInsert) {
            const { error: singleError } = await supabase.from("jobs").insert(job);
            if (singleError) {
              logStep("Failed to create recurring job", { error: singleError.message });
            } else {
              created++;
            }
          }
        } else {
          created += insertedJobs?.length || toInsert.length;
          logStep("Batch inserted jobs", { count: insertedJobs?.length || toInsert.length });
        }

        // Batch resolve contractor user_ids for notifications
        const contractorIds = [...new Set(notificationsToInsert.map(n => n.contractor_id as string))];
        const { data: contractors } = await supabase
          .from("contractors")
          .select("id, user_id")
          .in("id", contractorIds);

        if (contractors && contractors.length > 0) {
          const contractorUserMap = new Map(contractors.map(c => [c.id, c.user_id]));
          const notifications = notificationsToInsert
            .map(n => {
              const userId = contractorUserMap.get(n.contractor_id as string);
              if (!userId) return null;
              return {
                user_id: userId,
                title: "🔄 Recurring Job Scheduled",
                message: `"${n.title_text}" has been auto-scheduled for ${n.next_date}.`,
                type: "info",
              };
            })
            .filter(Boolean);

          if (notifications.length > 0) {
            await supabase.from("notifications").insert(notifications);
          }
        }
      }

      // If we got fewer than BATCH_SIZE, we're done
      if (completedJobs.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        offset += BATCH_SIZE;
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
      JSON.stringify({ error: "An internal error occurred" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
