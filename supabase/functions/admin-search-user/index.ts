import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  searchQuery: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create client with user's auth token to verify they're logged in
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user is authenticated
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      console.log("User authentication failed:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("User authenticated:", user.id);

    // Check if user has admin role using service role client
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: adminRole, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !adminRole) {
      console.log("User is not an admin:", roleError?.message);
      return new Response(
        JSON.stringify({ error: "Forbidden - Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Admin access verified for user:", user.id);

    // Parse the search query
    const { searchQuery }: SearchRequest = await req.json();
    
    if (!searchQuery || typeof searchQuery !== "string") {
      return new Response(
        JSON.stringify({ error: "Search query is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const sanitizedQuery = searchQuery.trim().toLowerCase();
    
    if (sanitizedQuery.length < 2) {
      return new Response(
        JSON.stringify({ error: "Search query must be at least 2 characters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Searching for users matching:", sanitizedQuery);

    // Search profiles by name using server-side filtering
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("user_id, full_name")
      .ilike("full_name", `%${sanitizedQuery}%`)
      .limit(10);

    if (profilesError) {
      console.error("Error searching profiles:", profilesError);
      return new Response(
        JSON.stringify({ error: "Failed to search users" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Filter out users who are already contractors
    const userIds = profiles?.map(p => p.user_id) || [];
    
    let nonContractorProfiles = profiles || [];
    
    if (userIds.length > 0) {
      const { data: existingContractors } = await adminClient
        .from("contractors")
        .select("user_id")
        .in("user_id", userIds);

      const contractorUserIds = new Set(existingContractors?.map(c => c.user_id) || []);
      nonContractorProfiles = profiles!.filter(p => !contractorUserIds.has(p.user_id));
    }

    console.log(`Found ${nonContractorProfiles.length} matching non-contractor users`);

    return new Response(
      JSON.stringify({ 
        users: nonContractorProfiles.map(p => ({
          user_id: p.user_id,
          full_name: p.full_name,
        }))
      }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  } catch (error) {
    console.error("Error in admin-search-user function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
