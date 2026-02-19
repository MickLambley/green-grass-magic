 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface RequestBody {
   userIds: string[];
 }
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const authHeader = req.headers.get("Authorization");
     if (!authHeader) {
       return new Response(
         JSON.stringify({ error: "Unauthorized" }),
         { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
     
     const userClient = createClient(supabaseUrl, supabaseAnonKey, {
       global: { headers: { Authorization: authHeader } },
     });
 
     const { data: { user }, error: userError } = await userClient.auth.getUser();
     
     if (userError || !user) {
       return new Response(
         JSON.stringify({ error: "Unauthorized" }),
         { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     // Check admin role
     const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const adminClient = createClient(supabaseUrl, serviceRoleKey);
 
     const { data: adminRole, error: roleError } = await adminClient
       .from("user_roles")
       .select("role")
       .eq("user_id", user.id)
       .eq("role", "admin")
       .single();
 
     if (roleError || !adminRole) {
       return new Response(
         JSON.stringify({ error: "Forbidden - Admin access required" }),
         { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     const { userIds }: RequestBody = await req.json();
     
     if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
       return new Response(
         JSON.stringify({ emails: {} }),
         { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     // Fetch user emails using admin API
     const emailMap: Record<string, string> = {};
     
     for (const userId of userIds) {
       const { data: userData, error: fetchError } = await adminClient.auth.admin.getUserById(userId);
       if (!fetchError && userData?.user?.email) {
         emailMap[userId] = userData.user.email;
       }
     }
 
     return new Response(
       JSON.stringify({ emails: emailMap }),
       { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
     );
   } catch (error) {
     console.error("Error in admin-get-user-emails function:", error);
     return new Response(
       JSON.stringify({ error: "Internal server error" }),
       { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
     );
   }
 });