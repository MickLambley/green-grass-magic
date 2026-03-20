import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, CreditCard, Clock, Mail, Lock, MapPin, FileText } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import WorkingHoursEditor, { DEFAULT_WORKING_HOURS, type WorkingHours } from "./WorkingHoursEditor";
import { z } from "zod";
import ServiceAreaSettingsCard from "./ServiceAreaSettingsCard";
import StripeConnectSettingsCard from "./StripeConnectSettingsCard";

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

const PAYMENT_TERMS_OPTIONS = [
  { value: "0", label: "Due on receipt" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "custom", label: "Custom" },
];

const ProfileSettingsTab = ({ contractor, onUpdate }: ProfileSettingsTabProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const responses = (contractor.questionnaire_responses as Record<string, unknown>) || {};

  const [form, setForm] = useState({
    business_name: contractor.business_name || "",
    abn: contractor.abn || "",
    business_address: contractor.business_address || "",
    phone: contractor.phone || "",
    gst_registered: contractor.gst_registered,
    bank_bsb: contractor.bank_bsb || "",
    bank_account_number: contractor.bank_account_number || "",
    bank_account_name: (responses.bank_account_name as string) || "",
  });

  const [workingHours, setWorkingHours] = useState<WorkingHours>(
    (contractor.working_hours as unknown as WorkingHours) || DEFAULT_WORKING_HOURS
  );

  // Invoice defaults
  const savedTerms = responses.default_payment_terms as string | undefined;
  const savedCustomDays = responses.default_payment_terms_custom_days as number | undefined;
  const savedNotes = responses.default_invoice_notes as string | undefined;

  const [paymentTerms, setPaymentTerms] = useState<string>(
    savedTerms !== undefined ? savedTerms : ""
  );
  const [customDays, setCustomDays] = useState<number>(savedCustomDays || 14);
  const [defaultInvoiceNotes, setDefaultInvoiceNotes] = useState(savedNotes || "");

  const handleSave = async () => {
    setIsSaving(true);

    // Merge invoice defaults into questionnaire_responses
    const updatedResponses = {
      ...responses,
      default_payment_terms: paymentTerms || null,
      default_payment_terms_custom_days: paymentTerms === "custom" ? customDays : null,
      default_invoice_notes: defaultInvoiceNotes.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
    };

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
        questionnaire_responses: updatedResponses as any,
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

      {/* Invoice Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Invoice Defaults
          </CardTitle>
          <CardDescription>Set default payment terms and notes for new invoices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default Payment Terms</Label>
            <Select value={paymentTerms} onValueChange={setPaymentTerms}>
              <SelectTrigger>
                <SelectValue placeholder="No default set" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {paymentTerms === "custom" && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-muted-foreground">Due</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={customDays}
                  onChange={(e) => setCustomDays(parseInt(e.target.value) || 14)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">days after invoice date</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Default Invoice Notes</Label>
            <Textarea
              value={defaultInvoiceNotes}
              onChange={(e) => setDefaultInvoiceNotes(e.target.value)}
              placeholder="e.g. Please pay via bank transfer to BSB 000-000, Account 12345678. Thank you for your business."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">This will pre-populate the Notes field on every new invoice.</p>
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

        </CardContent>
      </Card>

      {/* Save */}
      <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Settings
      </Button>

      {/* Stripe Connect */}
      <StripeConnectSettingsCard contractor={contractor} />

      {/* Service Area */}
      <ServiceAreaSettingsCard contractor={contractor} onUpdate={onUpdate} />

      {/* Account Section */}
      <AccountSection />
    </div>
  );
};

const emailChangeSchema = z.string().trim().email("Please enter a valid email address").max(255);
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

const AccountSection = () => {
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleChangeEmail = async () => {
    const result = emailChangeSchema.safeParse(newEmail);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    setEmailLoading(true);
    const { error } = await supabase.auth.updateUser({
      email: result.data,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Confirmation link sent to your new email address. Please check your inbox.");
      setNewEmail("");
    }
    setEmailLoading(false);
  };

  const handleChangePassword = async () => {
    const pwResult = passwordSchema.safeParse(newPassword);
    if (!pwResult.success) {
      toast.error(pwResult.error.errors[0].message);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    }
    setPasswordLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Account</CardTitle>
        <CardDescription>Update your email address or password</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Change Email */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="w-4 h-4" /> Change Email
          </Label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="new@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleChangeEmail} disabled={emailLoading || !newEmail.trim()} size="sm">
              {emailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Link"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">A confirmation link will be sent to the new address. The change takes effect after you click the link.</p>
        </div>

        <Separator />

        {/* Change Password */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="w-4 h-4" /> Change Password
          </Label>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={passwordLoading || !newPassword || !confirmPassword}
            size="sm"
          >
            {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProfileSettingsTab;
