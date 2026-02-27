import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_SECRET_KEY = Deno.env.get("VITE_TEST_MODE_SECRET_KEY") || Deno.env.get("TEST_MODE_SECRET_KEY") || "";
const TEST_MODE_ENABLED = Deno.env.get("VITE_ENABLE_TEST_MODE") === "true" || Deno.env.get("ENABLE_TEST_MODE") === "true";

interface TestPersonaConfig {
  email: string;
  password: string;
  full_name: string;
  role: "user" | "contractor";
  contractor_profile?: {
    business_name: string;
    phone: string;
    service_areas: string[];
    approval_status: string;
    is_active: boolean;
    tier: string;
    stripe_onboarding_complete: boolean;
    abn: string;
    business_address: string;
  };
}

const PERSONAS: Record<string, TestPersonaConfig> = {
  customer_new: {
    email: "test.customer@lawnly-test.local",
    password: "TestCustomer123!",
    full_name: "Test Customer",
    role: "user",
  },
  contractor_active: {
    email: "test.contractor@lawnly-test.local",
    password: "TestContractor123!",
    full_name: "Test Contractor",
    role: "contractor",
    contractor_profile: {
      business_name: "Test Lawn Care Co.",
      phone: "0400000000",
      service_areas: ["Melbourne", "VIC", "Sydney", "NSW", "Brisbane", "QLD"],
      approval_status: "approved",
      is_active: true,
      tier: "standard",
      stripe_onboarding_complete: true,
      abn: "12345678901",
      business_address: "123 Test Street, Melbourne VIC 3000",
    },
  },
};

async function ensureTestAddress(adminClient: any, userId: string) {
  const { data: existingAddr } = await adminClient
    .from("addresses")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!existingAddr) {
    await adminClient.from("addresses").insert({
      user_id: userId,
      street_address: "42 Test Avenue",
      city: "Melbourne",
      state: "VIC",
      postal_code: "3000",
      country: "Australia",
      status: "verified",
      square_meters: 150,
      slope: "flat",
      tier_count: 1,
      verified_at: new Date().toISOString(),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Kill switch: disable entirely in production
  if (!TEST_MODE_ENABLED) {
    return new Response(JSON.stringify({ error: "Test mode is disabled" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { persona, test_key } = await req.json();

    // Validate test key
    if (!TEST_SECRET_KEY || test_key !== TEST_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = PERSONAS[persona];
    if (!config) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey);

    let signInResult = await anonClient.auth.signInWithPassword({
      email: config.email,
      password: config.password,
    });

    if (signInResult.error) {
      console.log(`Creating test user: ${config.email}`);

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: config.email,
        password: config.password,
        email_confirm: true,
        user_metadata: { full_name: config.full_name },
      });

      if (createError) throw new Error("Failed to create test user");

      const userId = newUser.user.id;

      if (config.role === "contractor") {
        const { data: existingRole } = await adminClient
          .from("user_roles").select("id")
          .eq("user_id", userId).eq("role", "contractor").maybeSingle();

        if (!existingRole) {
          await adminClient.from("user_roles").insert({ user_id: userId, role: "contractor" });
        }

        if (config.contractor_profile) {
          const { data: existingContractor } = await adminClient
            .from("contractors").select("id")
            .eq("user_id", userId).maybeSingle();

          if (!existingContractor) {
            await adminClient.from("contractors").insert({
              user_id: userId, ...config.contractor_profile,
            });
          }
        }
      }

      if (config.role === "user") {
        await ensureTestAddress(adminClient, userId);
      }

      signInResult = await anonClient.auth.signInWithPassword({
        email: config.email, password: config.password,
      });

      if (signInResult.error) throw new Error("Failed to sign in after creation");
    } else {
      const userId = signInResult.data.user.id;

      if (config.role === "user") {
        await ensureTestAddress(adminClient, userId);
      }

      if (config.role === "contractor" && config.contractor_profile) {
        const { data: existingContractor } = await adminClient
          .from("contractors").select("id, abn")
          .eq("user_id", userId).maybeSingle();

        if (!existingContractor) {
          const { data: existingRole } = await adminClient
            .from("user_roles").select("id")
            .eq("user_id", userId).eq("role", "contractor").maybeSingle();

          if (!existingRole) {
            await adminClient.from("user_roles").insert({ user_id: userId, role: "contractor" });
          }

          await adminClient.from("contractors").insert({
            user_id: userId, ...config.contractor_profile,
          });
        } else if (!existingContractor.abn) {
          await adminClient.from("contractors").update({
            abn: config.contractor_profile.abn,
            business_address: config.contractor_profile.business_address,
            approval_status: config.contractor_profile.approval_status,
            is_active: config.contractor_profile.is_active,
            tier: config.contractor_profile.tier,
            stripe_onboarding_complete: config.contractor_profile.stripe_onboarding_complete,
          }).eq("id", existingContractor.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        session: signInResult.data.session,
        user: signInResult.data.user,
        persona,
        role: config.role,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Test mode login error:", error);
    return new Response(
      JSON.stringify({ error: "Request failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
