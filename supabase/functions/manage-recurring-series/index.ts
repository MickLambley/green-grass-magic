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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, series_id, current_job_id, new_frequency, contractor_id } = body;

    // Verify ownership
    const { data: contractor } = await supabase
      .from("contractors")
      .select("id")
      .eq("id", contractor_id)
      .eq("user_id", user.id)
      .single();

    if (!contractor) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "change_frequency") {
      const { data: currentJob } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", current_job_id)
        .single();

      if (!currentJob) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const today = new Date().toISOString().split("T")[0];

      // Count and delete future scheduled jobs
      const { data: futureJobs } = await supabase
        .from("jobs")
        .select("id")
        .eq("recurring_job_id", series_id)
        .neq("id", current_job_id)
        .gte("scheduled_date", today)
        .eq("status", "scheduled");

      const deletedCount = futureJobs?.length || 0;

      if (deletedCount > 0) {
        await supabase
          .from("jobs")
          .delete()
          .eq("recurring_job_id", series_id)
          .neq("id", current_job_id)
          .gte("scheduled_date", today)
          .eq("status", "scheduled");
      }

      // Regenerate future jobs with new frequency
      const remainingCount = Math.max(deletedCount, 3);
      const baseDate = new Date(currentJob.scheduled_date);
      const newJobs = [];

      for (let i = 1; i <= remainingCount; i++) {
        const nextDate = new Date(baseDate);
        if (new_frequency === "weekly") {
          nextDate.setDate(baseDate.getDate() + i * 7);
        } else if (new_frequency === "fortnightly") {
          nextDate.setDate(baseDate.getDate() + i * 14);
        } else if (new_frequency === "monthly") {
          nextDate.setMonth(baseDate.getMonth() + i);
        }

        newJobs.push({
          contractor_id: currentJob.contractor_id,
          client_id: currentJob.client_id,
          title: currentJob.title,
          description: currentJob.description,
          scheduled_date: nextDate.toISOString().split("T")[0],
          scheduled_time: currentJob.scheduled_time,
          duration_minutes: currentJob.duration_minutes,
          total_price: currentJob.total_price,
          notes: currentJob.notes,
          status: "scheduled",
          source: currentJob.source,
          recurring_job_id: series_id,
          recurrence_rule: {
            frequency: new_frequency,
            interval: new_frequency === "fortnightly" ? 2 : 1,
            count: remainingCount + 1,
          },
        });
      }

      if (newJobs.length > 0) {
        const { error: insertError } = await supabase.from("jobs").insert(newJobs);
        if (insertError) {
          console.error("Failed to insert new recurring jobs:", insertError);
          return new Response(JSON.stringify({ error: "Failed to create new jobs" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Update the current job's recurrence_rule
      await supabase.from("jobs").update({
        recurrence_rule: {
          frequency: new_frequency,
          interval: new_frequency === "fortnightly" ? 2 : 1,
          count: remainingCount + 1,
        },
      }).eq("id", current_job_id);

      // Update recurring_series record
      await supabase.from("recurring_series").update({
        frequency: new_frequency,
        series_anchor_day: baseDate.getDay(),
        total_count: remainingCount + 1,
      }).eq("id", series_id);

      return new Response(JSON.stringify({
        success: true,
        deleted: deletedCount,
        created: newJobs.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete_future") {
      const today = new Date().toISOString().split("T")[0];
      const { data: deleted, error } = await supabase
        .from("jobs")
        .delete()
        .eq("recurring_job_id", series_id)
        .gte("scheduled_date", today)
        .eq("status", "scheduled")
        .neq("id", current_job_id)
        .select("id");

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to delete" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        deleted: deleted?.length || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
