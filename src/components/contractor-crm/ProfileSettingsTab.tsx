import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, CreditCard, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import WorkingHoursEditor, { DEFAULT_WORKING_HOURS, type WorkingHours } from "./WorkingHoursEditor";

type Contractor = Tables<"contractors">;

interface ProfileSettingsTabProps {
  contractor: Contractor;
  onUpdate: (updated: Contractor) => void;
}

const TIER_LABELS: Record<string, { label: string; fee: string; color: string }> = {
  free: { label: "Free", fee: "5%", color: "bg-muted text-muted-foreground" },
  starter: { label: "Starter", fee: "2.5%", color: "bg-sky/20 text-sky border-sky/30" },
  pro: { label: "Pro", fee: "1%", color: "bg-primary/20 text-primary border-primary/30" },
};

const ProfileSettingsTab = ({ contractor, onUpdate }: ProfileSettingsTabProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  

  const [form, setForm] = useState({
    business_name: contractor.business_name || "",
    abn: contractor.abn || "",
    business_address: contractor.business_address || "",
    phone: contractor.phone || "",
    gst_registered: contractor.gst_registered,
    bank_bsb: contractor.bank_bsb || "",
    bank_account_number: contractor.bank_account_number || "",
  });

  const [workingHours, setWorkingHours] = useState<WorkingHours>(
    (contractor.working_hours as unknown as WorkingHours) || DEFAULT_WORKING_HOURS
  );

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
        working_hours: workingHours as any,
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

  const handleSelectTier = async (tier: string) => {
    setIsUpgrading(true);
    const { data, error } = await supabase
      .from("contractors")
      .update({ subscription_tier: tier })
      .eq("id", contractor.id)
      .select()
      .single();

    if (error) {
      toast.error("Failed to update plan");
    } else if (data) {
      toast.success(`Switched to ${TIER_LABELS[tier]?.label || tier} plan`);
      onUpdate(data);
    }
    setIsUpgrading(false);
  };

  const currentTier = TIER_LABELS[contractor.subscription_tier] || TIER_LABELS.free;
  const allTiers = ["free", "starter", "pro"];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Subscription</CardTitle>
          <CardDescription>Choose your Yardly plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {allTiers.map((tier) => {
              const info = TIER_LABELS[tier];
              const prices: Record<string, string> = { free: "$0", starter: "$39", pro: "$79" };
              const isActive = contractor.subscription_tier === tier;
              return (
                <Button
                  key={tier}
                  variant={isActive ? "default" : "outline"}
                  className="flex flex-col h-auto py-3"
                  onClick={() => handleSelectTier(tier)}
                  disabled={isUpgrading || isActive}
                >
                  <span className="font-semibold">{info.label}</span>
                  <span className="text-xs opacity-80">{prices[tier]}/mo • {info.fee} fee</span>
                </Button>
              );
            })}
          </div>
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

      {/* Working Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Working Hours
          </CardTitle>
          <CardDescription>Set your available working days and times</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
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
