import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[QUALITY-CHECK] ${step}${detailsStr}`);
};

interface QualityEntry {
  type: string;
  reason: string;
  triggered_at: string;
  metric_value?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Quality check started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all active, approved contractors
    const { data: contractors, error: cErr } = await supabase
      .from("contractors")
      .select("id, user_id, business_name, average_rating, completed_jobs_count, disputed_jobs_count, cancelled_jobs_count, suspension_status, quality_warnings, quality_reviews")
      .eq("is_active", true)
      .eq("approval_status", "approved");

    if (cErr) throw new Error(`Failed to fetch contractors: ${cErr.message}`);
    logStep("Contractors fetched", { count: contractors?.length ?? 0 });

    const adminNotifications: { title: string; message: string; type: string }[] = [];

    for (const c of contractors || []) {
      let newStatus: string = c.suspension_status || "active";
      const warnings: QualityEntry[] = Array.isArray(c.quality_warnings) ? [...c.quality_warnings as QualityEntry[]] : [];
      const reviews: QualityEntry[] = Array.isArray(c.quality_reviews) ? [...c.quality_reviews as QualityEntry[]] : [];
      const reasons: string[] = [];

      // --- Get recent data ---
      // Cancellations in last 7 / 14 / 30 days
      const [cancel7Res, cancel14Res, cancel30Res] = await Promise.all([
        supabase.from("bookings").select("id", { count: "exact", head: true })
          .eq("contractor_id", c.id).eq("status", "cancelled").gte("updated_at", sevenDaysAgo),
        supabase.from("bookings").select("id", { count: "exact", head: true })
          .eq("contractor_id", c.id).eq("status", "cancelled").gte("updated_at", fourteenDaysAgo),
        supabase.from("bookings").select("id", { count: "exact", head: true })
          .eq("contractor_id", c.id).eq("status", "cancelled").gte("updated_at", thirtyDaysAgo),
      ]);

      const cancel7 = cancel7Res.count ?? 0;
      const cancel14 = cancel14Res.count ?? 0;
      const cancel30 = cancel30Res.count ?? 0;

      // Recent ratings (last 7 days)
      const { data: recentRatings } = await supabase
        .from("bookings")
        .select("customer_rating")
        .eq("contractor_id", c.id)
        .not("customer_rating", "is", null)
        .gte("rating_submitted_at", sevenDaysAgo);

      const hasOneStarRecent = recentRatings?.some(r => r.customer_rating === 1) ?? false;

      // Dispute rate
      const disputeRate = (c.completed_jobs_count || 0) > 0
        ? ((c.disputed_jobs_count || 0) / (c.completed_jobs_count || 0)) * 100
        : 0;

      const avgRating = Number(c.average_rating || 0);
      const nowStr = now.toISOString();

      // --- SUSPEND thresholds (most severe first) ---
      if (avgRating > 0 && avgRating < 3.0) {
        reasons.push(`Average rating ${avgRating} below 3.0`);
        newStatus = "suspended";
      }
      if (disputeRate > 20) {
        reasons.push(`Dispute rate ${disputeRate.toFixed(0)}% exceeds 20%`);
        newStatus = "suspended";
      }
      if (cancel30 >= 5) {
        reasons.push(`${cancel30} cancellations in 30 days`);
        newStatus = "suspended";
      }

      // --- REVIEW thresholds ---
      if (newStatus !== "suspended") {
        if (avgRating > 0 && avgRating < 3.5) {
          reasons.push(`Average rating ${avgRating} below 3.5`);
          newStatus = "review_required";
        }
        if (disputeRate > 10) {
          reasons.push(`Dispute rate ${disputeRate.toFixed(0)}% exceeds 10%`);
          newStatus = "review_required";
        }
        if (cancel14 >= 3) {
          reasons.push(`${cancel14} cancellations in 14 days`);
          newStatus = "review_required";
        }
        if (hasOneStarRecent) {
          reasons.push("Received 1-star rating in last 7 days");
          newStatus = "review_required";
        }
      }

      // --- WARNING thresholds ---
      if (newStatus !== "suspended" && newStatus !== "review_required") {
        if (avgRating > 0 && avgRating < 4.0) {
          reasons.push(`Average rating ${avgRating} below 4.0`);
          newStatus = "warning";
        }
        if (disputeRate > 5) {
          reasons.push(`Dispute rate ${disputeRate.toFixed(0)}% exceeds 5%`);
          newStatus = "warning";
        }
        if (cancel7 >= 2) {
          reasons.push(`${cancel7} cancellations in 7 days`);
          newStatus = "warning";
        }
      }

      // If no issues, reset to active
      if (reasons.length === 0) {
        newStatus = "active";
      }

      // Skip if status hasn't changed
      if (newStatus === (c.suspension_status || "active") && reasons.length === 0) continue;

      // Log the entry
      const entry: QualityEntry = {
        type: newStatus,
        reason: reasons.join("; "),
        triggered_at: nowStr,
      };

      if (newStatus === "warning") {
        warnings.push(entry);
      } else if (newStatus === "review_required" || newStatus === "suspended") {
        reviews.push(entry);
      }

      // Keep only last 20 entries
      const trimmedWarnings = warnings.slice(-20);
      const trimmedReviews = reviews.slice(-20);

      // Update contractor
      const updateData: Record<string, unknown> = {
        suspension_status: newStatus,
        quality_warnings: trimmedWarnings,
        quality_reviews: trimmedReviews,
      };

      if (newStatus === "suspended") {
        updateData.suspended_at = nowStr;
        updateData.suspension_reason = reasons.join("; ");
        updateData.is_active = false;
      }

      await supabase.from("contractors").update(updateData).eq("id", c.id);
      logStep(`Contractor ${c.id} status: ${c.suspension_status} → ${newStatus}`, { reasons });

      // Send admin notification for review/suspend
      if (newStatus === "review_required" || newStatus === "suspended") {
        const emoji = newStatus === "suspended" ? "🚫" : "🔍";
        const title = newStatus === "suspended"
          ? `${emoji} Contractor Auto-Suspended`
          : `${emoji} Contractor Requires Review`;

        adminNotifications.push({
          title,
          message: `${c.business_name || "Contractor"} (ID: ${c.id}): ${reasons.join("; ")}`,
          type: "warning",
        });
      }

      // Notify the contractor
      if (newStatus !== "active" && newStatus !== (c.suspension_status || "active")) {
        const msgs: Record<string, { title: string; message: string }> = {
          warning: {
            title: "⚠️ Quality Alert",
            message: `Your account has a quality warning: ${reasons.join("; ")}. Please improve to avoid further action.`,
          },
          review_required: {
            title: "🔍 Account Under Review",
            message: "Your account is under review due to quality concerns. Our support team will contact you shortly.",
          },
          suspended: {
            title: "🚫 Account Suspended",
            message: `Your account has been suspended: ${reasons.join("; ")}. Contact support for assistance.`,
          },
        };

        const msg = msgs[newStatus];
        if (msg) {
          await supabase.from("notifications").insert({
            user_id: c.user_id,
            title: msg.title,
            message: msg.message,
            type: newStatus === "suspended" ? "error" : "warning",
          });
        }
      }
    }

    // Send admin notifications
    if (adminNotifications.length > 0) {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      for (const admin of admins || []) {
        for (const notif of adminNotifications) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            title: notif.title,
            message: notif.message,
            type: notif.type,
          });
        }
      }

      // Send email to admins
      if (resendApiKey) {
        for (const admin of admins || []) {
          const { data: authData } = await supabase.auth.admin.getUserById(admin.user_id);
          const email = authData?.user?.email;
          if (!email) continue;

          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
              body: JSON.stringify({
                from: "Lawn Care <onboarding@resend.dev>",
                to: [email],
                subject: `🔍 ${adminNotifications.length} Quality Alert(s) Require Attention`,
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #dc2626;">Quality Monitoring Alerts</h1>
                    ${adminNotifications.map(n => `
                      <div style="background: #fef2f2; padding: 12px; border-radius: 8px; margin: 10px 0;">
                        <strong>${n.title}</strong>
                        <p style="margin: 4px 0 0;">${n.message}</p>
                      </div>
                    `).join("")}
                    <p style="color: #666; margin-top: 20px;">Please review these alerts in the admin panel.</p>
                  </div>
                `,
              }),
            });
          } catch (e) {
            logStep("Email failed (non-blocking)", { error: String(e) });
          }
        }
      }
    }

    logStep("Quality check complete", { alertsGenerated: adminNotifications.length });

    return new Response(
      JSON.stringify({ success: true, alertsGenerated: adminNotifications.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("FATAL ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
