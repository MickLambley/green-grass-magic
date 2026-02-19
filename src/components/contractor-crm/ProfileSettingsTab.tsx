import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, CreditCard, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Contractor = Tables<"contractors">;

interface ProfileSettingsTabProps {
  contractor: Contractor;
  onUpdate: (updated: Contractor) => void;
}

const TIER_LABELS: Record<string, { label: string; fee: string; color: string }> = {
  free: { label: "Free", fee: "5%", color: "bg-muted text-muted-foreground" },
  starter: { label: "Starter", fee: "3%", color: "bg-sky/20 text-sky border-sky/30" },
  pro: { label: "Pro", fee: "1%", color: "bg-primary/20 text-primary border-primary/30" },
  team: { label: "Team", fee: "1%", color: "bg-primary/20 text-primary border-primary/30" },
};

const ProfileSettingsTab = ({ contractor, onUpdate }: ProfileSettingsTabProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isManaging, setIsManaging] = useState(false);

  const [form, setForm] = useState({
    business_name: contractor.business_name || "",
    abn: contractor.abn || "",
    business_address: contractor.business_address || "",
    phone: contractor.phone || "",
    gst_registered: contractor.gst_registered,
    bank_bsb: contractor.bank_bsb || "",
    bank_account_number: contractor.bank_account_number || "",
  });

  const handleSave = async () => {
    setIsSaving(true);
    const { data, error } = await supabase
      .from("contractors")
      .update({
        business_name: form.business_name.trim() || null,
        abn: form.abn.trim() || null,
        business_address: form.business_address.trim() || null,
        phone: form.phone.trim() || null,
        gst_registered: form.gst_registered,
        bank_bsb: form.bank_bsb.trim() || null,
        bank_account_number: form.bank_account_number.trim() || null,
      })
      .eq("id", contractor.id)
      .select()
      .single();

    if (error) {
      toast.error("Failed to save settings");
    } else if (data) {
      toast.success("Settings saved");
      onUpdate(data);
    }
    setIsSaving(false);
  };

  const handleUpgrade = async (tier: string) => {
    setIsUpgrading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscription", {
        body: { action: "create-checkout", tier },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      toast.error("Failed to start upgrade");
    }
    setIsUpgrading(false);
  };

  const handleManageBilling = async () => {
    setIsManaging(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscription", {
        body: { action: "create-portal" },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      toast.error("Failed to open billing portal");
    }
    setIsManaging(false);
  };

  const currentTier = TIER_LABELS[contractor.subscription_tier] || TIER_LABELS.free;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Subscription</CardTitle>
          <CardDescription>Manage your Yardly plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current Plan</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={currentTier.color}>{currentTier.label}</Badge>
                <span className="text-xs text-muted-foreground">{currentTier.fee} transaction fee</span>
              </div>
            </div>
            {contractor.subscription_tier !== "free" && (
              <Button variant="outline" size="sm" onClick={handleManageBilling} disabled={isManaging}>
                {isManaging ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CreditCard className="w-4 h-4 mr-2" /> Manage Billing</>}
              </Button>
            )}
          </div>

          {contractor.subscription_tier === "free" && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              {["starter", "pro", "team"].map((tier) => {
                const info = TIER_LABELS[tier];
                const prices: Record<string, string> = { starter: "$29", pro: "$59", team: "$99" };
                return (
                  <Button
                    key={tier}
                    variant="outline"
                    className="flex flex-col h-auto py-3"
                    onClick={() => handleUpgrade(tier)}
                    disabled={isUpgrading}
                  >
                    <span className="font-semibold">{info.label}</span>
                    <span className="text-xs text-muted-foreground">{prices[tier]}/mo • {info.fee} fee</span>
                  </Button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Business Details */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Business Details</CardTitle>
          <CardDescription>These details appear on your invoices and website</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Your Business Name" />
            </div>
            <div className="space-y-2">
              <Label>ABN</Label>
              <Input value={form.abn} onChange={(e) => setForm({ ...form, abn: e.target.value })} placeholder="12 345 678 901" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Business Address</Label>
            <Input value={form.business_address} onChange={(e) => setForm({ ...form, business_address: e.target.value })} placeholder="123 Main St, Melbourne VIC 3000" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0400 000 000" />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.gst_registered} onCheckedChange={(v) => setForm({ ...form, gst_registered: v })} id="gst" />
            <Label htmlFor="gst" className="cursor-pointer">GST Registered</Label>
          </div>
        </CardContent>
      </Card>

      {/* Banking */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Banking Details</CardTitle>
          <CardDescription>For payouts from website bookings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>BSB</Label>
              <Input value={form.bank_bsb} onChange={(e) => setForm({ ...form, bank_bsb: e.target.value })} placeholder="000-000" />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} placeholder="12345678" />
            </div>
          </div>

          {contractor.stripe_account_id && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <CreditCard className="w-4 h-4" />
              <span>Stripe Connect: {contractor.stripe_onboarding_complete ? "Active" : "Setup incomplete"}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Settings
      </Button>
    </div>
  );
};

export default ProfileSettingsTab;
