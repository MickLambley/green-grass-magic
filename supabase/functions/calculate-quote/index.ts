import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface QuoteRequest {
  addressId: string;
  selectedDate: string;
  grassLength: string;
  clippingsRemoval: boolean;
  contractorId?: string; // Optional: use contractor-specific pricing
}

interface QuoteBreakdown {
  basePrice: number;
  areaPrice: number;
  slopeMultiplier: number;
  tierMultiplier: number;
  grassLengthMultiplier: number;
  clippingsCost: number;
  daySurcharge: number;
  subtotal: number;
  total: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { addressId, selectedDate, grassLength, clippingsRemoval, contractorId }: QuoteRequest = await req.json();

    if (!addressId || !selectedDate || !grassLength) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: addressId, selectedDate, grassLength" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user owns this address
    const { data: address, error: addressError } = await userClient
      .from("addresses")
      .select("id, square_meters, slope, tier_count, status")
      .eq("id", addressId)
      .single();

    if (addressError || !address) {
      return new Response(
        JSON.stringify({ error: "Address not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (address.status === "rejected") {
      return new Response(
        JSON.stringify({ error: "Address has been rejected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!address.square_meters) {
      return new Response(
        JSON.stringify({ error: "Address lawn area not set" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isPreliminary = address.status !== "verified";

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Try contractor-specific pricing first
    let settings: Record<string, number> = {};
    let usedContractorPricing = false;

    if (contractorId) {
      const { data: contractor } = await serviceClient
        .from("contractors")
        .select("questionnaire_responses")
        .eq("id", contractorId)
        .single();

      const pricing = (contractor?.questionnaire_responses as any)?.pricing;
      if (pricing) {
        usedContractorPricing = true;
        // Map contractor pricing fields to the settings keys
        settings.fixed_base_price = pricing.base_price ?? 50;
        settings.base_price_per_sqm = pricing.price_per_sqm ?? 0.15;
        settings.clipping_removal_cost = pricing.clippings_removal_fee ?? 20;
        settings.grass_length_short = 0.9;
        settings.grass_length_medium = 1;
        settings.grass_length_long = 1.3;
        settings.grass_length_very_long = 1.6;
        settings.slope_mild_multiplier = 1.1;
        settings.slope_steep_multiplier = 1.3;
        settings.tier_multiplier = 0.05;
        // Weekend surcharge from contractor settings
        if (pricing.enable_weekend_surcharge) {
          const satPct = pricing.saturday_surcharge_pct ?? pricing.weekend_surcharge_pct ?? 10;
          const sunPct = pricing.sunday_surcharge_pct ?? pricing.weekend_surcharge_pct ?? 15;
          settings.saturday_surcharge = 1 + satPct / 100;
          settings.sunday_surcharge = 1 + sunPct / 100;
        } else {
          settings.saturday_surcharge = 1;
          settings.sunday_surcharge = 1;
        }
      }
    }

    // Fall back to global pricing_settings if no contractor pricing
    if (!usedContractorPricing) {
      const { data: pricingData, error: pricingError } = await serviceClient
        .from("pricing_settings")
        .select("key, value");

      if (pricingError || !pricingData) {
        console.error("Error fetching pricing settings:", pricingError);
        return new Response(
          JSON.stringify({ error: "Unable to calculate quote" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      pricingData.forEach((row) => {
        settings[row.key] = Number(row.value);
      });
    }

    // Calculate quote
    const basePrice = settings.fixed_base_price || 0;
    const areaPrice = Number(address.square_meters) * (settings.base_price_per_sqm || 0);

    let slopeMultiplier = 1;
    if (address.slope === "mild") slopeMultiplier = settings.slope_mild_multiplier || 1;
    if (address.slope === "steep") slopeMultiplier = settings.slope_steep_multiplier || 1;

    const tierMultiplier = 1 + (address.tier_count - 1) * (settings.tier_multiplier || 0);

    const grassLengthKey = `grass_length_${grassLength}`;
    const grassLengthMultiplier = settings[grassLengthKey] || 1;

    const clippingsCost = clippingsRemoval ? (settings.clipping_removal_cost || 0) : 0;

    const date = new Date(selectedDate);
    const dayOfWeek = date.getDay();
    let daySurcharge = 1;
    if (dayOfWeek === 6) daySurcharge = settings.saturday_surcharge || 1;
    if (dayOfWeek === 0) daySurcharge = settings.sunday_surcharge || 1;

    const subtotal = (basePrice + areaPrice) * slopeMultiplier * tierMultiplier * grassLengthMultiplier;
    const total = Math.round(((subtotal * daySurcharge) + clippingsCost) * 100) / 100;

    const quote: QuoteBreakdown = {
      basePrice,
      areaPrice: Math.round(areaPrice * 100) / 100,
      slopeMultiplier,
      tierMultiplier,
      grassLengthMultiplier,
      clippingsCost,
      daySurcharge,
      subtotal: Math.round(subtotal * 100) / 100,
      total,
    };

    return new Response(
      JSON.stringify({ quote, isPreliminary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Calculate quote error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
