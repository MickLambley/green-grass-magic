import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, DollarSign } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Contractor = Tables<"contractors">;

interface ContractorPricingTabProps {
  contractor: Contractor;
  onUpdate: (updated: Contractor) => void;
}

interface PricingConfig {
  base_price: number;
  price_per_sqm: number;
  clippings_removal_fee: number;
  saturday_surcharge_pct: number;
  sunday_surcharge_pct: number;
  enable_weekend_surcharge: boolean;
  minimum_price: number;
}

const DEFAULT_PRICING: PricingConfig = {
  base_price: 50,
  price_per_sqm: 0.15,
  clippings_removal_fee: 20,
  saturday_surcharge_pct: 10,
  sunday_surcharge_pct: 15,
  enable_weekend_surcharge: false,
  minimum_price: 40,
};

const ContractorPricingTab = ({ contractor, onUpdate }: ContractorPricingTabProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);

  useEffect(() => {
    // Load existing pricing from contractor's questionnaire_responses or a dedicated field
    const stored = (contractor.questionnaire_responses as any)?.pricing as PricingConfig | undefined;
    if (stored) {
      // Migrate old single weekend_surcharge_pct to split fields
      const migrated = { ...DEFAULT_PRICING, ...stored };
      if ((stored as any).weekend_surcharge_pct !== undefined && stored.saturday_surcharge_pct === undefined) {
        migrated.saturday_surcharge_pct = (stored as any).weekend_surcharge_pct;
        migrated.sunday_surcharge_pct = (stored as any).weekend_surcharge_pct;
      }
      setPricing(migrated);
    }
  }, [contractor]);

  const handleChange = (key: keyof PricingConfig, value: string | boolean) => {
    setPricing((prev) => ({
      ...prev,
      [key]: typeof value === "boolean" ? value : parseFloat(value) || 0,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const existingResponses = (contractor.questionnaire_responses as Record<string, unknown>) || {};
    const { data, error } = await supabase
      .from("contractors")
      .update({
        questionnaire_responses: { ...existingResponses, pricing: pricing as unknown as Json } as unknown as Json,
      })
      .eq("id", contractor.id)
      .select()
      .single();

    if (error) {
      toast.error("Failed to save pricing");
    } else if (data) {
      toast.success("Pricing saved");
      onUpdate(data);
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Service Pricing
          </CardTitle>
          <CardDescription>
            Set your pricing for lawn mowing and other services. These rates will be used for quotes and website bookings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Base Pricing */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Base Rates</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base Price ($)</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={pricing.base_price}
                  onChange={(e) => handleChange("base_price", e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Starting price per job</p>
              </div>
              <div className="space-y-2">
                <Label>Price per m² ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pricing.price_per_sqm}
                  onChange={(e) => handleChange("price_per_sqm", e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Additional charge per square metre</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Minimum Price ($)</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={pricing.minimum_price}
                onChange={(e) => handleChange("minimum_price", e.target.value)}
                className="font-mono max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">No job will be priced below this amount</p>
            </div>
          </div>

          {/* Extras */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Extras</h3>
            <div className="space-y-2">
              <Label>Clippings Removal Fee ($)</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={pricing.clippings_removal_fee}
                onChange={(e) => handleChange("clippings_removal_fee", e.target.value)}
                className="font-mono max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">Extra charge when customer requests clippings removal</p>
            </div>
          </div>

          {/* Surcharges */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Surcharges</h3>
            <div className="flex items-center gap-3">
              <Switch
                checked={pricing.enable_weekend_surcharge}
                onCheckedChange={(v) => handleChange("enable_weekend_surcharge", v)}
                id="weekend-surcharge"
              />
              <Label htmlFor="weekend-surcharge" className="cursor-pointer">Enable weekend surcharge</Label>
            </div>
            {pricing.enable_weekend_surcharge && (
              <div className="space-y-2">
                <Label>Weekend Surcharge (%)</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={pricing.weekend_surcharge_pct}
                  onChange={(e) => handleChange("weekend_surcharge_pct", e.target.value)}
                  className="font-mono max-w-[200px]"
                />
                <p className="text-xs text-muted-foreground">Percentage added for Saturday/Sunday jobs</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Price Preview */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">Price Preview</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Small lawn (100m²)</p>
              <p className="font-mono font-semibold text-foreground">
                ${Math.max(pricing.minimum_price, pricing.base_price + 100 * pricing.price_per_sqm).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Medium lawn (300m²)</p>
              <p className="font-mono font-semibold text-foreground">
                ${Math.max(pricing.minimum_price, pricing.base_price + 300 * pricing.price_per_sqm).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Large lawn (600m²)</p>
              <p className="font-mono font-semibold text-foreground">
                ${Math.max(pricing.minimum_price, pricing.base_price + 600 * pricing.price_per_sqm).toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Pricing
      </Button>
    </div>
  );
};

export default ContractorPricingTab;
