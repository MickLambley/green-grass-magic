import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);
    const in30Days = new Date(today);
    in30Days.setDate(today.getDate() + 30);

    // Get all active approved contractors with insurance expiry dates
    const { data: contractors, error } = await supabase
      .from("contractors")
      .select("id, user_id, business_name, insurance_expiry_date, is_active, approval_status")
      .eq("approval_status", "approved")
      .not("insurance_expiry_date", "is", null);

    if (error) throw error;

    const results = { reminded: 0, suspended: 0, expired: 0 };

    // Get admin user IDs for notifications
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = adminRoles?.map((r: any) => r.user_id) || [];

    // Get emails for contractors that need notification
    const contractorUserIds = contractors?.map((c: any) => c.user_id) || [];
    let emailMap: Record<string, string> = {};
    if (contractorUserIds.length > 0 && resendApiKey) {
      const { data: users } = await supabase.auth.admin.listUsers();
      if (users?.users) {
        for (const u of users.users) {
          if (contractorUserIds.includes(u.id)) {
            emailMap[u.id] = u.email || "";
          }
        }
      }
    }

    for (const contractor of (contractors || [])) {
      const expiryDate = new Date(contractor.insurance_expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const contractorName = contractor.business_name || "Unknown";

      // Expired - suspend immediately
      if (daysUntilExpiry <= 0 && contractor.is_active) {
        await supabase.from("contractors").update({
          is_active: false,
          suspension_reason: "Insurance expired",
          suspended_at: new Date().toISOString(),
          suspension_status: "suspended",
        }).eq("id", contractor.id);

        // Notify contractor
        await supabase.from("notifications").insert({
          user_id: contractor.user_id,
          title: "⛔ Account Suspended - Insurance Expired",
          message: "Your insurance has expired and your account has been suspended. Please upload a renewed certificate to continue accepting jobs.",
          type: "error",
        });

        // Notify admins
        for (const adminId of adminIds) {
          await supabase.from("notifications").insert({
            user_id: adminId,
            title: "🚨 Contractor Insurance Expired",
            message: `${contractorName}'s insurance has expired. Account suspended. Manual review needed to reallocate any assigned jobs.`,
            type: "warning",
          });
        }

        // Send email
        if (resendApiKey && emailMap[contractor.user_id]) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
            body: JSON.stringify({
              from: "Yardly <notifications@updates.lovable.app>",
              to: [emailMap[contractor.user_id]],
              subject: "⛔ Your Yardly Account Has Been Suspended - Insurance Expired",
              html: `<p>Hi ${contractorName},</p><p>Your public liability insurance has expired as of ${expiryDate.toLocaleDateString()}. Your account has been suspended and you cannot accept new jobs until you upload a renewed certificate.</p><p>Please log in to your contractor dashboard and upload your renewed insurance certificate.</p>`,
            }),
          });
        }

        results.expired++;
        results.suspended++;
      }
      // 7 days or less - suspend from new jobs
      else if (daysUntilExpiry <= 7 && daysUntilExpiry > 0 && contractor.is_active) {
        await supabase.from("contractors").update({
          is_active: false,
          suspension_reason: "Insurance expiring within 7 days",
          suspended_at: new Date().toISOString(),
          suspension_status: "warning",
        }).eq("id", contractor.id);

        await supabase.from("notifications").insert({
          user_id: contractor.user_id,
          title: "⚠️ Insurance Expiring - Account Restricted",
          message: `Your insurance expires in ${daysUntilExpiry} days. You've been suspended from accepting new jobs until you renew.`,
          type: "warning",
        });

        if (resendApiKey && emailMap[contractor.user_id]) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
            body: JSON.stringify({
              from: "Yardly <notifications@updates.lovable.app>",
              to: [emailMap[contractor.user_id]],
              subject: `⚠️ Insurance Expiring in ${daysUntilExpiry} Days - Action Required`,
              html: `<p>Hi ${contractorName},</p><p>Your public liability insurance expires on ${expiryDate.toLocaleDateString()} (${daysUntilExpiry} days). You've been suspended from accepting new jobs. Please renew and upload your new certificate.</p>`,
            }),
          });
        }

        results.suspended++;
      }
      // 30 days or less - send reminder
      else if (daysUntilExpiry <= 30 && daysUntilExpiry > 7) {
        await supabase.from("notifications").insert({
          user_id: contractor.user_id,
          title: "📋 Insurance Renewal Reminder",
          message: `Your insurance expires in ${daysUntilExpiry} days (${expiryDate.toLocaleDateString()}). Please renew before expiry to avoid service interruption.`,
          type: "info",
        });

        if (resendApiKey && emailMap[contractor.user_id]) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
            body: JSON.stringify({
              from: "Yardly <notifications@updates.lovable.app>",
              to: [emailMap[contractor.user_id]],
              subject: "📋 Insurance Renewal Reminder",
              html: `<p>Hi ${contractorName},</p><p>This is a friendly reminder that your public liability insurance expires on ${expiryDate.toLocaleDateString()} (${daysUntilExpiry} days away). Please renew it before expiry to avoid any disruption to your account.</p>`,
            }),
          });
        }

        results.reminded++;
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Insurance expiry check error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
