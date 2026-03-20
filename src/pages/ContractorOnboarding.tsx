import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Leaf, ArrowRight, ArrowLeft, Loader2, Check, Building2,
  Users, Calendar, Clock,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Contractor = Tables<"contractors">;

interface StepConfig {
  key: string;
  title: string;
  subtitle: string;
  icon: any;
}

const STEPS: StepConfig[] = [
  { key: "profile", title: "Business Setup", subtitle: "Tell us about your business", icon: Building2 },
  { key: "client", title: "First Client", subtitle: "Add your first client", icon: Users },
  { key: "job", title: "First Job", subtitle: "Schedule your first job", icon: Calendar },
];

const ContractorOnboarding = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Profile form
  const [profile, setProfile] = useState({
    business_name: "",
    phone: "",
  });

  // Client form
  const [clientForm, setClientForm] = useState({
    name: "",
    email: "",
    phone: "",
  });

  // Job form
  const [jobForm, setJobForm] = useState({
    title: "Lawn Mowing",
    scheduled_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    total_price: "",
    recurrence: "one-off" as "one-off" | "weekly" | "fortnightly" | "monthly",
  });

  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [createdClientName, setCreatedClientName] = useState<string>("");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/contractor-auth?mode=signup"); return; }
    setUser(user);

    const { data: roles } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "contractor");

    if (!roles || roles.length === 0) {
      await supabase.from("user_roles").insert({ user_id: user.id, role: "contractor" });
    }

    let { data: contractorData } = await supabase
      .from("contractors").select("*")
      .eq("user_id", user.id).single();

    if (!contractorData) {
      const { data: newC } = await supabase.from("contractors")
        .insert({ user_id: user.id, service_areas: [], is_active: false })
        .select().single();
      contractorData = newC;
    }

    if (contractorData) {
      setContractor(contractorData);
      if (contractorData.business_name) {
        setProfile({
          business_name: contractorData.business_name || "",
          phone: contractorData.phone || "",
        });
        setCurrentStep(1);
      }
    }

    setIsLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!profile.business_name.trim()) { toast.error("Business name is required"); return; }
    if (!user) return;

    setIsSaving(true);

    // Silent defaults: Mon-Fri 7am-5pm working hours
    const defaultWorkingHours = {
      monday: { start: "07:00", end: "17:00", enabled: true },
      tuesday: { start: "07:00", end: "17:00", enabled: true },
      wednesday: { start: "07:00", end: "17:00", enabled: true },
      thursday: { start: "07:00", end: "17:00", enabled: true },
      friday: { start: "07:00", end: "17:00", enabled: true },
      saturday: { start: "08:00", end: "14:00", enabled: false },
      sunday: { start: "08:00", end: "14:00", enabled: false },
    };

    const { data, error } = await supabase.from("contractors").update({
      business_name: profile.business_name.trim(),
      phone: profile.phone.trim() || null,
      working_hours: defaultWorkingHours as any,
      is_active: true,
    }).eq("user_id", user.id).select().single();

    if (error) { toast.error("Failed to save profile"); setIsSaving(false); return; }

    await supabase.from("profiles").update({
      full_name: profile.business_name.trim(),
      phone: profile.phone.trim() || null,
    }).eq("user_id", user.id);

    if (data) setContractor(data);
    toast.success("Profile saved!");
    setCurrentStep(1);
    setIsSaving(false);
  };

  const handleCreateClient = async () => {
    if (!clientForm.name.trim()) { toast.error("Client name is required"); return; }
    if (!contractor) return;

    setIsSaving(true);
    const { data, error } = await supabase.from("clients").insert({
      contractor_id: contractor.id,
      name: clientForm.name.trim(),
      email: clientForm.email.trim() || null,
      phone: clientForm.phone.trim() || null,
    }).select("id").single();

    if (error) { toast.error("Failed to create client"); setIsSaving(false); return; }

    if (data) {
      setCreatedClientId(data.id);
      setCreatedClientName(clientForm.name.trim());
    }
    toast.success("Client added!");
    setCurrentStep(2);
    setIsSaving(false);
  };

  const handleCreateJob = async () => {
    if (!createdClientId || !contractor) {
      toast.error("Please create a client first");
      return;
    }
    if (!jobForm.scheduled_date) { toast.error("Please pick a date"); return; }

    setIsSaving(true);

    const isRecurring = jobForm.recurrence !== "one-off";
    const seriesId = isRecurring ? crypto.randomUUID() : null;
    const recurrenceRule = isRecurring ? {
      frequency: jobForm.recurrence,
      interval: jobForm.recurrence === "fortnightly" ? 2 : 1,
      count: 4,
    } : null;

    const payload = {
      contractor_id: contractor.id,
      client_id: createdClientId,
      title: jobForm.title.trim() || "Lawn Mowing",
      scheduled_date: jobForm.scheduled_date,
      total_price: jobForm.total_price ? parseFloat(jobForm.total_price) : null,
      status: "scheduled",
      recurrence_rule: recurrenceRule as any,
      recurring_job_id: seriesId,
    };

    const { error } = await supabase.from("jobs").insert(payload);
    if (error) { toast.error("Failed to create job"); setIsSaving(false); return; }

    // Create recurring instances
    if (isRecurring && seriesId) {
      const baseDate = new Date(jobForm.scheduled_date);
      const additionalJobs = [];
      for (let i = 1; i < 4; i++) {
        const nextDate = new Date(baseDate);
        if (jobForm.recurrence === "weekly") nextDate.setDate(baseDate.getDate() + i * 7);
        else if (jobForm.recurrence === "fortnightly") nextDate.setDate(baseDate.getDate() + i * 14);
        else nextDate.setMonth(baseDate.getMonth() + i);
        additionalJobs.push({ ...payload, scheduled_date: nextDate.toISOString().split("T")[0] });
      }
      if (additionalJobs.length > 0) {
        await supabase.from("jobs").insert(additionalJobs as any);
      }
    }

    // Fire-and-forget: silently auto-generate website using business name
    const slug = (contractor.business_name || "my-business")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 40);

    // Set subdomain immediately, generate copy in background
    supabase.from("contractors").update({
      subdomain: slug,
      website_published: false,
    }).eq("id", contractor.id).then(() => {
      supabase.functions.invoke("generate-website-copy", {
        body: {
          business_name: contractor.business_name,
          location: contractor.business_address,
          phone: contractor.phone,
        },
      }).then(({ data: copyData }) => {
        if (copyData?.copy) {
          supabase.from("contractors").update({
            website_copy: copyData.copy,
          }).eq("id", contractor.id);
        }
      }).catch(() => { /* silent */ });
    });

    toast.success("First job scheduled! 🎉 You're all set.");
    setIsSaving(false);
    await markOnboardingComplete();
    navigate("/contractor");
  };

  const markOnboardingComplete = async () => {
    if (!user) return;
    await supabase.from("contractors").update({ onboarding_completed: true }).eq("user_id", user.id);
  };

  const handleSkip = () => {
    if (currentStep === STEPS.length - 1) {
      markOnboardingComplete();
      navigate("/contractor");
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-2xl gradient-hero animate-pulse flex items-center justify-center">
          <Leaf className="w-6 h-6 text-primary-foreground" />
        </div>
      </div>
    );
  }

  const step = STEPS[currentStep];
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl gradient-hero flex items-center justify-center">
              <Leaf className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-foreground text-sm">Yardly</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 sm:py-8">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <div key={s.key} className="flex flex-col items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    done ? "bg-primary text-primary-foreground" :
                    active ? "bg-primary/20 text-primary ring-2 ring-primary" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {done ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-[10px] mt-1 text-center ${active ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-primary h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Step Header */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-primary/10 flex items-center justify-center">
            <step.icon className="w-6 h-6 text-primary" />
          </div>
          <h1 className="font-display text-xl font-bold text-foreground">{step.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{step.subtitle}</p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70 mt-2">
            <Clock className="w-3 h-3" /> Setup takes about 3 minutes
          </p>
        </div>

        {/* ── Step 1: Business Setup ── */}
        {currentStep === 0 && (
          <Card>
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="space-y-2">
                <Label>Business Name *</Label>
                <Input value={profile.business_name} onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} placeholder="John's Lawn Care" />
              </div>
              <div className="space-y-2">
                <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="0400 000 000" />
              </div>
              <Button onClick={handleSaveProfile} disabled={isSaving} className="w-full" size="lg">
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Save & Continue <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: First Client ── */}
        {currentStep === 1 && (
          <Card>
            <CardContent className="pt-5 pb-5 space-y-4">
              {createdClientId ? (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-xl">
                  <Check className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-primary">Client "{createdClientName}" created!</span>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Client Name *</Label>
                    <Input value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} placeholder="Jane Smith" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input type="email" value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} placeholder="jane@email.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} placeholder="0400 000 000" />
                  </div>
                </>
              )}
              {!createdClientId ? (
                <Button onClick={handleCreateClient} disabled={isSaving} className="w-full" size="lg">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                  Add Client & Continue <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              ) : (
                <Button onClick={() => setCurrentStep(2)} className="w-full" size="lg">
                  Continue to First Job <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              )}
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(0)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSkip} variant="outline" className="flex-1">
                  Skip for now <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: First Job ── */}
        {currentStep === 2 && (
          <Card>
            <CardContent className="pt-5 pb-5 space-y-4">
              {!createdClientId ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">You need to create a client first.</p>
                  <Button onClick={() => setCurrentStep(1)} variant="outline" size="sm">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Go Back to Add Client
                  </Button>
                </div>
              ) : (
                <>
                  {/* Pre-selected client indicator */}
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">Client: <strong>{createdClientName}</strong></span>
                  </div>
                  <div className="space-y-2">
                    <Label>Job Title</Label>
                    <Input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} placeholder="Lawn Mowing" />
                  </div>
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input type="date" value={jobForm.scheduled_date} onChange={(e) => setJobForm({ ...jobForm, scheduled_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Price <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input type="number" value={jobForm.total_price} onChange={(e) => setJobForm({ ...jobForm, total_price: e.target.value })} placeholder="0.00" className="pl-7" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Recurring?</Label>
                    <Select value={jobForm.recurrence} onValueChange={(v) => setJobForm({ ...jobForm, recurrence: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one-off">One-off</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="fortnightly">Fortnightly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateJob} disabled={isSaving} className="w-full" size="lg">
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Check className="w-5 h-5 mr-2" />}
                    Create Job & Finish Setup
                  </Button>
                </>
              )}
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(1)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={() => { markOnboardingComplete(); navigate("/contractor"); }} variant="outline" className="flex-1">
                  Skip & Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ContractorOnboarding;
