import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TIER-PROMOTIONS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Tier promotion check started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const promotions: { contractorId: string; from: string; to: string }[] = [];

    // ── Probation → Standard ──
    // Contractors with tier='probation', 5+ completed jobs, avg rating >= 4.5
    const { data: probationContractors, error: probErr } = await supabase
      .from("contractors")
      .select("id, user_id, business_name")
      .eq("tier", "probation")
      .eq("is_active", true)
      .eq("approval_status", "approved");

    if (probErr) throw new Error(`Failed to query probation contractors: ${probErr.message}`);

    logStep("Probation contractors found", { count: probationContractors?.length ?? 0 });

    for (const c of probationContractors || []) {
      // Count completed jobs
      const { count: jobCount } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("contractor_id", c.id)
        .in("status", ["completed", "completed_pending_verification"]);

      if ((jobCount ?? 0) < 5) continue;

      // Get average rating
      const { data: ratingData } = await supabase
        .from("reviews")
        .select("rating")
        .eq("contractor_id", c.id);

      if (!ratingData || ratingData.length === 0) continue;

      const avgRating = ratingData.reduce((s, r) => s + r.rating, 0) / ratingData.length;
      if (avgRating < 4.5) continue;

      // Promote!
      const { error: updateErr } = await supabase
        .from("contractors")
        .update({ tier: "standard" })
        .eq("id", c.id);

      if (updateErr) {
        logStep("Failed to promote contractor", { id: c.id, error: updateErr.message });
        continue;
      }

      promotions.push({ contractorId: c.id, from: "probation", to: "standard" });
      logStep("Promoted to standard", { id: c.id, jobs: jobCount, avgRating });

      // Send email
      if (resendApiKey) {
        const { data: authData } = await supabase.auth.admin.getUserById(c.user_id);
        const email = authData?.user?.email;
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", c.user_id).maybeSingle();
        const name = profile?.full_name || "there";

        if (email) {
          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
              body: JSON.stringify({
                from: "Lawn Care <onboarding@resend.dev>",
                to: [email],
                subject: "🎉 You've been promoted to Verified Contractor!",
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #16a34a;">Congratulations! 🎉</h1>
                    <p>Hi ${name},</p>
                    <p>You've been promoted to <strong>Verified Contractor</strong> status!</p>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 5px 0;">✅ You can now accept up to <strong>10 concurrent jobs</strong></p>
                      <p style="margin: 5px 0;">✅ No maximum job value restriction</p>
                    </div>
                    <p>Keep up the great work!</p>
                    <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
                  </div>
                `,
              }),
            });
          } catch (e) {
            logStep("Email failed (non-blocking)", { error: String(e) });
          }
        }
      }

      // In-app notification
      await supabase.from("notifications").insert({
        user_id: c.user_id,
        title: "🎉 Promoted to Verified Contractor!",
        message: "Congratulations! You've been promoted to Verified Contractor status. You can now accept up to 10 concurrent jobs with no maximum job value.",
        type: "success",
      });
    }

    // ── Standard → Premium ──
    // Only run if platform has 50+ total completed jobs
    const { count: totalJobs } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("status", ["completed", "completed_pending_verification"]);

    if ((totalJobs ?? 0) >= 50) {
      const { data: standardContractors, error: stdErr } = await supabase
        .from("contractors")
        .select("id, user_id, business_name")
        .eq("tier", "standard")
        .eq("is_active", true)
        .eq("approval_status", "approved");

      if (stdErr) throw new Error(`Failed to query standard contractors: ${stdErr.message}`);

      logStep("Standard contractors found", { count: standardContractors?.length ?? 0 });

      for (const c of standardContractors || []) {
        // Count completed jobs
        const { count: jobCount } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("contractor_id", c.id)
          .in("status", ["completed", "completed_pending_verification"]);

        if ((jobCount ?? 0) < 50) continue;

        // Get average rating
        const { data: ratingData } = await supabase
          .from("reviews")
          .select("rating")
          .eq("contractor_id", c.id);

        if (!ratingData || ratingData.length === 0) continue;

        const avgRating = ratingData.reduce((s, r) => s + r.rating, 0) / ratingData.length;
        if (avgRating < 4.7) continue;

        // Check dispute rate < 3%
        const { count: disputeCount } = await supabase
          .from("disputes")
          .select("id", { count: "exact", head: true })
          .in("booking_id", (await supabase
            .from("bookings")
            .select("id")
            .eq("contractor_id", c.id)).data?.map(b => b.id) || []);

        const disputeRate = (disputeCount ?? 0) / (jobCount ?? 1);
        if (disputeRate >= 0.03) continue;

        // Promote!
        const { error: updateErr } = await supabase
          .from("contractors")
          .update({ tier: "premium" })
          .eq("id", c.id);

        if (updateErr) {
          logStep("Failed to promote contractor", { id: c.id, error: updateErr.message });
          continue;
        }

        promotions.push({ contractorId: c.id, from: "standard", to: "premium" });
        logStep("Promoted to premium", { id: c.id, jobs: jobCount, avgRating, disputeRate });

        // Send email
        if (resendApiKey) {
          const { data: authData } = await supabase.auth.admin.getUserById(c.user_id);
          const email = authData?.user?.email;
          const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", c.user_id).maybeSingle();
          const name = profile?.full_name || "there";

          if (email) {
            try {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
                body: JSON.stringify({
                  from: "Lawn Care <onboarding@resend.dev>",
                  to: [email],
                  subject: "⭐ You've been promoted to Premium Contractor!",
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h1 style="color: #16a34a;">Congratulations! ⭐</h1>
                      <p>Hi ${name},</p>
                      <p>You've been promoted to <strong>Premium Contractor</strong> status! You're now one of Lawnly's top performers.</p>
                      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;">⭐ No job restrictions</p>
                        <p style="margin: 5px 0;">⭐ Priority in future features</p>
                      </div>
                      <p>Thank you for your outstanding service!</p>
                      <p style="color: #666; margin-top: 30px;">Best regards,<br>The Lawnly Team</p>
                    </div>
                  `,
                }),
              });
            } catch (e) {
              logStep("Email failed (non-blocking)", { error: String(e) });
            }
          }
        }

        // In-app notification
        await supabase.from("notifications").insert({
          user_id: c.user_id,
          title: "⭐ Promoted to Premium Contractor!",
          message: "Congratulations! You've been promoted to Premium Contractor status. You're now one of Lawnly's top performers and will receive priority in future features.",
          type: "success",
        });
      }
    } else {
      logStep("Skipping premium promotions - platform has fewer than 50 total jobs", { totalJobs });
    }

    logStep("Tier promotion check complete", { promotionsCount: promotions.length });

    return new Response(
      JSON.stringify({ success: true, promotions }),
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
