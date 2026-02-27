import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is a contractor
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: contractor } = await adminClient
      .from("contractors")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!contractor) {
      return new Response(JSON.stringify({ error: "Contractor profile required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { business_name, location, services, phone } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `Generate website copy for a lawn care / landscaping business. Return a JSON object with these keys:
- hero_headline (short, punchy, max 8 words)
- hero_subheadline (1 sentence, max 20 words)
- about_title (max 5 words)
- about_text (2-3 sentences about the business)
- services_title (max 4 words)
- services (array of 3-4 objects with "name" and "description" keys, each description max 15 words)
- cta_headline (max 6 words)
- cta_text (1 sentence, max 15 words)

Business details:
- Name: ${business_name || "Professional Lawn Care"}
- Location: ${location || "Your local area"}
- Phone: ${phone || ""}
- Services offered: ${services || "Lawn mowing, edging, hedge trimming, garden cleanup"}

Make the copy professional, friendly, and locally focused. Use Australian English.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a marketing copywriter. Return ONLY valid JSON, no markdown fences." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_website_copy",
              description: "Return the generated website copy as structured data",
              parameters: {
                type: "object",
                properties: {
                  hero_headline: { type: "string" },
                  hero_subheadline: { type: "string" },
                  about_title: { type: "string" },
                  about_text: { type: "string" },
                  services_title: { type: "string" },
                  services: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["name", "description"],
                      additionalProperties: false,
                    },
                  },
                  cta_headline: { type: "string" },
                  cta_text: { type: "string" },
                },
                required: ["hero_headline", "hero_subheadline", "about_title", "about_text", "services_title", "services", "cta_headline", "cta_text"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_website_copy" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let copy;
    if (toolCall?.function?.arguments) {
      copy = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try parsing content directly
      const content = data.choices?.[0]?.message?.content || "";
      copy = JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    }

    return new Response(JSON.stringify({ copy }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-website-copy error:", e);
    return new Response(JSON.stringify({ error: "Failed to generate website copy" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
