import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, DollarSign, Percent, Clock } from "lucide-react";

interface PricingSetting {
  id: string;
  key: string;
  value: number;
  description: string | null;
}

const settingGroups = {
  base: {
    title: "Base Pricing",
    icon: DollarSign,
    keys: ["fixed_base_price", "base_price_per_sqm"],
  },
  grass: {
    title: "Grass Length Multipliers",
    icon: Percent,
    keys: ["grass_length_short", "grass_length_medium", "grass_length_long", "grass_length_very_long"],
  },
  terrain: {
    title: "Terrain Multipliers",
    icon: Percent,
    keys: ["slope_mild_multiplier", "slope_steep_multiplier", "tier_multiplier"],
  },
  extras: {
    title: "Extra Charges",
    icon: DollarSign,
    keys: ["clipping_removal_cost"],
  },
  surcharges: {
    title: "Day Surcharges",
    icon: Percent,
    keys: ["saturday_surcharge", "sunday_surcharge", "public_holiday_surcharge"],
  },
  system: {
    title: "System Settings",
    icon: Clock,
    keys: ["contractor_acceptance_hours"],
  },
};

const settingLabels: Record<string, string> = {
  fixed_base_price: "Fixed Base Price ($)",
  base_price_per_sqm: "Price per m² ($)",
  grass_length_short: "Short Grass (×)",
  grass_length_medium: "Medium Grass (×)",
  grass_length_long: "Long Grass (×)",
  grass_length_very_long: "Very Long Grass (×)",
  slope_mild_multiplier: "Mild Slope (×)",
  slope_steep_multiplier: "Steep Slope (×)",
  tier_multiplier: "Per Extra Tier (×)",
  clipping_removal_cost: "Clippings Removal ($)",
  saturday_surcharge: "Saturday (×)",
  sunday_surcharge: "Sunday (×)",
  public_holiday_surcharge: "Public Holiday (×)",
  contractor_acceptance_hours: "Contractor Response Time (hours)",
};

const PricingSettingsTab = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PricingSetting[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("pricing_settings")
      .select("*")
      .order("key");

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load pricing settings",
        variant: "destructive",
      });
      return;
    }

    setSettings(data || []);
    const values: Record<string, string> = {};
    data?.forEach((s) => {
      values[s.key] = s.value.toString();
    });
    setEditedValues(values);
    setLoading(false);
  };

  const handleValueChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = settings.map((setting) => ({
        id: setting.id,
        key: setting.key,
        value: parseFloat(editedValues[setting.key]) || 0,
        description: setting.description,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("pricing_settings")
          .update({ value: update.value })
          .eq("id", update.id);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Pricing settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save pricing settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const getSettingsForGroup = (keys: string[]) => {
    return settings.filter((s) => keys.includes(s.key));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Pricing Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Configure pricing multipliers and base rates for all services
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(settingGroups).map(([groupKey, group]) => {
          const Icon = group.icon;
          const groupSettings = getSettingsForGroup(group.keys);
          
          if (groupSettings.length === 0) return null;

          return (
            <Card key={groupKey}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="w-4 h-4" />
                  {group.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {groupSettings.map((setting) => (
                  <div key={setting.key} className="space-y-2">
                    <Label htmlFor={setting.key} className="text-sm">
                      {settingLabels[setting.key] || setting.key}
                    </Label>
                    <Input
                      id={setting.key}
                      type="number"
                      step="0.01"
                      value={editedValues[setting.key] || ""}
                      onChange={(e) => handleValueChange(setting.key, e.target.value)}
                      className="font-mono"
                    />
                    {setting.description && (
                      <p className="text-xs text-muted-foreground">{setting.description}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default PricingSettingsTab;
