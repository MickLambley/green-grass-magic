import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CSV_URL = "https://raw.githubusercontent.com/Elkfox/Australian-Postcode-Data/master/au_postcodes.csv";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require service role key or CRON_SECRET
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || (token !== cronSecret && token !== serviceRoleKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if table already has data
    const { count } = await supabase
      .from("australian_postcodes")
      .select("id", { count: "exact", head: true });

    if (count && count > 0) {
      return new Response(
        JSON.stringify({ message: `Table already has ${count} rows. Skipping seed.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[SEED] Fetching CSV from GitHub...");
    const csvResponse = await fetch(CSV_URL);
    if (!csvResponse.ok) {
      throw new Error(`Failed to fetch CSV: ${csvResponse.status}`);
    }

    const csvText = await csvResponse.text();
    const lines = csvText.split("\n").filter((line) => line.trim());

    // Skip header: postcode,place_name,state_name,state_code,latitude,longitude,accuracy
    const dataLines = lines.slice(1);
    console.log(`[SEED] Parsed ${dataLines.length} rows from CSV`);

    // Batch insert in chunks of 500
    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
      const batch = dataLines.slice(i, i + BATCH_SIZE);
      const rows = batch
        .map((line) => {
          // Handle CSV parsing (some place names may contain commas, but this dataset doesn't use quotes)
          const parts = line.split(",");
          if (parts.length < 6) return null;

          const postcode = parts[0].trim();
          const suburb = parts[1].trim();
          const state = parts[3].trim(); // state_code
          const lat = parseFloat(parts[4]);
          const lng = parseFloat(parts[5]);

          if (!postcode || !suburb || !state || isNaN(lat) || isNaN(lng)) return null;

          return { suburb, postcode, state, lat, lng };
        })
        .filter(Boolean);

      if (rows.length > 0) {
        const { error } = await supabase.from("australian_postcodes").insert(rows);
        if (error) {
          console.error(`[SEED] Batch insert error at offset ${i}:`, error.message);
        } else {
          inserted += rows.length;
        }
      }

      if (i % 5000 === 0) {
        console.log(`[SEED] Progress: ${inserted} rows inserted...`);
      }
    }

    console.log(`[SEED] Complete. Inserted ${inserted} rows.`);

    return new Response(
      JSON.stringify({ success: true, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[SEED] Error:", e);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
