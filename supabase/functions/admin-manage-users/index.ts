import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();

    if (action === "list") {
      return await handleList(supabaseAdmin, corsHeaders);
    } else if (action === "change_status") {
      return await handleChangeStatus(
        supabaseAdmin,
        caller,
        params,
        corsHeaders,
      );
    } else if (action === "delete_user") {
      return await handleDeleteUser(
        supabaseAdmin,
        caller,
        params,
        corsHeaders,
      );
    } else if (action === "get_audit") {
      return await handleGetAudit(supabaseAdmin, params, corsHeaders);
    } else if (action === "get_user_details") {
      return await handleGetUserDetails(supabaseAdmin, params, corsHeaders);
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleList(supabase: any, headers: any) {
  // Get all auth users
  const {
    data: { users },
    error: usersError,
  } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) throw usersError;

  // Get all profiles
  const { data: profiles } = await supabase.from("profiles").select("*");
  const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) || []);

  // Get all roles
  const { data: roles } = await supabase.from("user_roles").select("*");
  const roleMap = new Map<string, string[]>();
  for (const r of roles || []) {
    const arr = roleMap.get(r.user_id) || [];
    arr.push(r.role);
    roleMap.set(r.user_id, arr);
  }

  // Get contractor details
  const { data: contractors } = await supabase
    .from("contractors")
    .select(
      "id, user_id, approval_status, is_active, suspension_status, business_name, completed_jobs_count, cancelled_jobs_count, disputed_jobs_count, average_rating, total_revenue, last_active_at",
    );
  const contractorMap = new Map(
    contractors?.map((c: any) => [c.user_id, c]) || [],
  );

  const result = users.map((u: any) => {
    const profile = profileMap.get(u.id) as any;
    const userRoles = roleMap.get(u.id) || ["user"];
    const contractor = contractorMap.get(u.id) as any;

    // Determine user type
    let userType = "customer";
    if (userRoles.includes("admin")) userType = "admin";
    else if (userRoles.includes("contractor")) userType = "contractor";

    // Determine status
    let status = "active";
    if (userType === "contractor" && contractor) {
      if (contractor.approval_status === "pending") status = "pending_approval";
      else if (contractor.approval_status === "declined") status = "declined";
      else if (
        contractor.suspension_status === "suspended" ||
        !contractor.is_active
      )
        status = "suspended";
      else status = "active";
    }
    // For customers/admins, we check if user is banned
    if (userType !== "contractor" && u.banned_until) {
      const bannedUntil = new Date(u.banned_until);
      if (bannedUntil > new Date() || u.banned_until === "2100-01-01T00:00:00Z")
        status = "suspended";
    }

    return {
      id: u.id,
      email: u.email,
      fullName: profile?.full_name || u.user_metadata?.full_name || null,
      phone: profile?.phone || null,
      userType,
      status,
      roles: userRoles,
      joinedAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
      contractor: contractor || null,
    };
  });

  return new Response(JSON.stringify({ users: result }), {
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleChangeStatus(
  supabase: any,
  caller: any,
  params: any,
  headers: any,
) {
  const { userId, newStatus, reason, userType } = params;

  if (!userId || !newStatus || !userType) {
    return new Response(
      JSON.stringify({ error: "Missing userId, newStatus, or userType" }),
      {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  // Prevent self-modification
  if (userId === caller.id) {
    return new Response(
      JSON.stringify({ error: "You cannot change your own status." }),
      {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  // Get current status for audit
  let previousStatus = "active";

  if (userType === "contractor") {
    const { data: contractor } = await supabase
      .from("contractors")
      .select("approval_status, is_active, suspension_status")
      .eq("user_id", userId)
      .maybeSingle();

    if (contractor) {
      if (contractor.approval_status === "pending")
        previousStatus = "pending_approval";
      else if (contractor.approval_status === "declined")
        previousStatus = "declined";
      else if (
        contractor.suspension_status === "suspended" ||
        !contractor.is_active
      )
        previousStatus = "suspended";
      else previousStatus = "active";
    }

    // Update contractor based on new status
    const updates: any = {};
    if (newStatus === "active") {
      updates.approval_status = "approved";
      updates.is_active = true;
      updates.suspension_status = "active";
      updates.suspended_at = null;
      updates.suspension_reason = null;
    } else if (newStatus === "pending_approval") {
      updates.approval_status = "pending";
      updates.is_active = true;
      updates.suspension_status = "active";
    } else if (newStatus === "suspended") {
      updates.is_active = false;
      updates.suspension_status = "suspended";
      updates.suspended_at = new Date().toISOString();
      updates.suspension_reason = reason || "Suspended by admin";
    } else if (newStatus === "declined") {
      updates.approval_status = "declined";
      updates.is_active = false;
      updates.suspension_status = "active";
    }

    await supabase.from("contractors").update(updates).eq("user_id", userId);
  } else {
    // For customers and admins - use ban/unban
    const {
      data: { user: targetUser },
    } = await supabase.auth.admin.getUserById(userId);
    if (targetUser?.banned_until) {
      const bannedUntil = new Date(targetUser.banned_until);
      if (
        bannedUntil > new Date() ||
        targetUser.banned_until === "2100-01-01T00:00:00Z"
      )
        previousStatus = "suspended";
    }

    if (userType === "admin" && newStatus === "suspended") {
      // Check we're not suspending the last admin
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const activeAdminCount = adminRoles?.filter(
        (r: any) => r.user_id !== userId,
      ).length;
      if (!activeAdminCount || activeAdminCount === 0) {
        return new Response(
          JSON.stringify({
            error:
              "Cannot suspend the last active admin. Please assign another admin first.",
          }),
          {
            status: 400,
            headers: { ...headers, "Content-Type": "application/json" },
          },
        );
      }
    }

    if (newStatus === "suspended") {
      await supabase.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      }); // ~100 years
    } else if (newStatus === "active") {
      await supabase.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
    }
  }

  // Write audit log
  await supabase.from("user_status_audit").insert({
    user_id: userId,
    previous_status: previousStatus,
    new_status: newStatus,
    changed_by: caller.id,
    changed_by_email: caller.email,
    reason: reason || null,
    user_type: userType,
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleDeleteUser(
  supabase: any,
  caller: any,
  params: any,
  headers: any,
) {
  const { userId, reason, userType } = params;

  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing userId" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Prevent self-deletion
  if (userId === caller.id) {
    return new Response(
      JSON.stringify({ error: "You cannot delete your own account." }),
      {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  if (userType === "admin") {
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const remaining = adminRoles?.filter(
      (r: any) => r.user_id !== userId,
    ).length;
    if (!remaining || remaining === 0) {
      return new Response(
        JSON.stringify({
          error:
            "Cannot delete the last active admin. Please assign another admin first.",
        }),
        {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" },
        },
      );
    }
  }

  // Write audit log before deletion
  await supabase.from("user_status_audit").insert({
    user_id: userId,
    previous_status: "various",
    new_status: "deleted",
    changed_by: caller.id,
    changed_by_email: caller.email,
    reason: reason || "User deleted by admin",
    user_type: userType || "unknown",
  });

  // Delete the user from auth (cascades to profiles, roles, etc.)
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleGetAudit(supabase: any, params: any, headers: any) {
  const { userId } = params;
  const { data: audit } = await supabase
    .from("user_status_audit")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return new Response(JSON.stringify({ audit: audit || [] }), {
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleGetUserDetails(
  supabase: any,
  params: any,
  headers: any,
) {
  const { userId } = params;

  const {
    data: { user },
  } = await supabase.auth.admin.getUserById(userId);
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const { data: contractor } = await supabase
    .from("contractors")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  // Activity stats
  const { count: totalBookings } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  const { count: completedBookings } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed");
  const { count: disputes } = await supabase
    .from("disputes")
    .select("*", { count: "exact", head: true })
    .in(
      "booking_id",
      (
        await supabase.from("bookings").select("id").eq("user_id", userId)
      ).data?.map((b: any) => b.id) || [],
    );

  // Audit trail
  const { data: audit } = await supabase
    .from("user_status_audit")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return new Response(
    JSON.stringify({
      user: {
        id: user?.id,
        email: user?.email,
        fullName:
          profile?.full_name || user?.user_metadata?.full_name || null,
        phone: profile?.phone || null,
        roles: roles?.map((r: any) => r.role) || [],
        joinedAt: user?.created_at,
        lastSignIn: user?.last_sign_in_at,
        contractor,
        activity: {
          totalBookings: totalBookings || 0,
          completedBookings: completedBookings || 0,
          disputes: disputes || 0,
        },
        audit: audit || [],
      },
    }),
    { headers: { ...headers, "Content-Type": "application/json" } },
  );
}
