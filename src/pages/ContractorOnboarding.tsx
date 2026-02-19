import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Leaf, ArrowRight, ArrowLeft, Loader2, Check, Building2,
  CreditCard, Globe, Users, Calendar, Sparkles, ExternalLink,
  CheckCircle2, User as UserIcon, Plus,
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
  { key: "profile", title: "Business Profile", subtitle: "Tell us about your business", icon: Building2 },
  { key: "stripe", title: "Get Paid", subtitle: "Connect your Stripe account", icon: CreditCard },
  { key: "website", title: "Your Website", subtitle: "Generate a free website", icon: Globe },
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
    abn: "",
    phone: "",
    business_address: "",
  });

  // Client form
  const [clientForm, setClientForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  // Job form
  const [jobForm, setJobForm] = useState({
    title: "Lawn Mowing",
    scheduled_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    scheduled_time: "09:00",
    total_price: "",
    notes: "",
  });

  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/contractor-auth?mode=signup"); return; }
    setUser(user);

    // Ensure contractor role exists
    const { data: roles } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "contractor");

    if (!roles || roles.length === 0) {
      await supabase.from("user_roles").insert({ user_id: user.id, role: "contractor" });
    }

    // Ensure contractor profile exists
    let { data: contractorData } = await supabase
      .from("contractors").select("*")
      .eq("user_id", user.id).single();

    if (!contractorData) {
      const { data: newC } = await supabase.from("contractors")
        .insert({ user_id: user.id, service_areas: [], is_active: false, approval_status: "approved" })
        .select().single();
      contractorData = newC;
    }

    if (contractorData) {
      setContractor(contractorData);
      // Pre-fill profile if data exists
      if (contractorData.business_name || contractorData.abn) {
        setProfile({
          business_name: contractorData.business_name || "",
          abn: contractorData.abn || "",
          phone: contractorData.phone || "",
          business_address: contractorData.business_address || "",
        });
        // If profile is already set, determine which step to start on
        if (contractorData.business_name) {
          if (contractorData.stripe_onboarding_complete) {
            setCurrentStep(contractorData.website_published ? 3 : 2);
          } else {
            setCurrentStep(1);
          }
        }
      }
    }

    setIsLoading(false);
  };

  // ── Step Handlers ──

  const handleSaveProfile = async () => {
    if (!profile.business_name.trim()) { toast.error("Business name is required"); return; }
    if (!user) return;

    setIsSaving(true);
    const { data, error } = await supabase.from("contractors").update({
      business_name: profile.business_name.trim(),
      abn: profile.abn.replace(/\s/g, "") || null,
      phone: profile.phone.trim() || null,
      business_address: profile.business_address.trim() || null,
      approval_status: "approved",
      is_active: true,
    }).eq("user_id", user.id).select().single();

    if (error) { toast.error("Failed to save profile"); setIsSaving(false); return; }

    // Update profiles table
    await supabase.from("profiles").update({
      full_name: profile.business_name.trim(),
      phone: profile.phone.trim() || null,
    }).eq("user_id", user.id);

    if (data) setContractor(data);
    toast.success("Profile saved!");
    setCurrentStep(1);
    setIsSaving(false);
  };

  const handleStripeConnect = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "create-account" },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        toast.success("Complete your Stripe setup in the new tab, then click Next.");
      }
    } catch {
      toast.error("Failed to start Stripe setup. You can do this later in Settings.");
    }
    setIsSaving(false);
  };

  const handleGenerateWebsite = async () => {
    if (!contractor) return;
    setIsSaving(true);
    try {
      // Generate copy
      const { data: copyData, error: copyError } = await supabase.functions.invoke("generate-website-copy", {
        body: {
          business_name: contractor.business_name,
          location: contractor.business_address,
          phone: contractor.phone,
        },
      });
      if (copyError) throw copyError;

      // Generate slug and publish
      const slug = (contractor.business_name || "my-business")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 40);

      const { data, error } = await supabase.from("contractors").update({
        subdomain: slug,
        website_copy: copyData?.copy || null,
        website_published: true,
      }).eq("id", contractor.id).select().single();

      if (error) {
        if (error.code === "23505") {
          toast.error("Subdomain taken — you can change it later in Website settings.");
        } else {
          throw error;
        }
      } else if (data) {
        setContractor(data);
        toast.success("Website generated & published! 🎉");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate website. You can do this later.");
    }
    setIsSaving(false);
    setCurrentStep(3);
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
      address: clientForm.address ? { street: clientForm.address } : null,
    }).select("id").single();

    if (error) { toast.error("Failed to create client"); setIsSaving(false); return; }

    if (data) setCreatedClientId(data.id);
    toast.success("Client added!");
    setCurrentStep(4);
    setIsSaving(false);
  };

  const handleCreateJob = async () => {
    if (!createdClientId || !contractor) {
      toast.error("Please create a client first");
      return;
    }
    if (!jobForm.scheduled_date) { toast.error("Please pick a date"); return; }

    setIsSaving(true);
    const { error } = await supabase.from("jobs").insert({
      contractor_id: contractor.id,
      client_id: createdClientId,
      title: jobForm.title.trim() || "Lawn Mowing",
      scheduled_date: jobForm.scheduled_date,
      scheduled_time: jobForm.scheduled_time || null,
      total_price: jobForm.total_price ? parseFloat(jobForm.total_price) : null,
      notes: jobForm.notes.trim() || null,
      status: "scheduled",
    });

    if (error) { toast.error("Failed to create job"); setIsSaving(false); return; }

    toast.success("First job scheduled! 🎉 You're all set.");
    setIsSaving(false);
    navigate("/contractor");
  };

  const handleSkip = () => {
    if (currentStep === STEPS.length - 1) {
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

      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Progress */}
        <div className="mb-8">
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
                  <span className={`text-[10px] mt-1 text-center hidden sm:block ${active ? "text-primary font-medium" : "text-muted-foreground"}`}>
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
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <step.icon className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">{step.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{step.subtitle}</p>
        </div>

        {/* ── Step 1: Profile ── */}
        {currentStep === 0 && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>Business Name *</Label>
                <Input
                  value={profile.business_name}
                  onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                  placeholder="John's Lawn Care"
                />
              </div>
              <div className="space-y-2">
                <Label>ABN <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={profile.abn}
                  onChange={(e) => setProfile({ ...profile, abn: e.target.value })}
                  placeholder="12 345 678 901"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="0400 000 000"
                />
              </div>
              <div className="space-y-2">
                <Label>Business Address</Label>
                <Input
                  value={profile.business_address}
                  onChange={(e) => setProfile({ ...profile, business_address: e.target.value })}
                  placeholder="123 Main St, Melbourne VIC 3000"
                />
              </div>

              <Button onClick={handleSaveProfile} disabled={isSaving} className="w-full" size="lg">
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Save & Continue
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Stripe Connect ── */}
        {currentStep === 1 && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Accept payments from customers</p>
                    <p className="text-xs text-muted-foreground">Get paid directly to your bank account via Stripe.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Automatic payouts</p>
                    <p className="text-xs text-muted-foreground">Funds are transferred to your account automatically.</p>
                  </div>
                </div>
              </div>

              {contractor?.stripe_onboarding_complete ? (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-primary">Stripe is connected!</span>
                </div>
              ) : (
                <Button onClick={handleStripeConnect} disabled={isSaving} className="w-full" size="lg" variant="outline">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CreditCard className="w-5 h-5 mr-2" />}
                  Connect Stripe
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              )}

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(0)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSkip} variant="outline" className="flex-1">
                  {contractor?.stripe_onboarding_complete ? "Next" : "Skip for now"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Website ── */}
        {currentStep === 2 && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div className="bg-muted/50 rounded-xl p-4 text-center space-y-2">
                <Sparkles className="w-8 h-8 text-primary mx-auto" />
                <p className="text-sm font-medium text-foreground">AI-powered website generation</p>
                <p className="text-xs text-muted-foreground">
                  We'll create a professional website for your business using AI. It takes about 10 seconds and you can customize it later.
                </p>
              </div>

              {contractor?.website_published ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium text-primary">Website is live!</span>
                  </div>
                  {contractor.subdomain && (
                    <a
                      href={`${window.location.origin}/site/${contractor.subdomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Globe className="w-4 h-4" /> View your website
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : (
                <Button onClick={handleGenerateWebsite} disabled={isSaving} className="w-full" size="lg">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />}
                  Generate My Website
                </Button>
              )}

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(1)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSkip} variant="outline" className="flex-1">
                  {contractor?.website_published ? "Next" : "Skip for now"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: First Client ── */}
        {currentStep === 3 && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              {createdClientId ? (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-primary">Client created!</span>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Client Name *</Label>
                    <Input
                      value={clientForm.name}
                      onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      type="email"
                      value={clientForm.email}
                      onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                      placeholder="jane@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      value={clientForm.phone}
                      onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                      placeholder="0400 000 000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Address <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      value={clientForm.address}
                      onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                      placeholder="123 Client St, Melbourne VIC"
                    />
                  </div>
                </>
              )}

              {!createdClientId ? (
                <Button onClick={handleCreateClient} disabled={isSaving} className="w-full" size="lg">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                  Add Client & Continue
                </Button>
              ) : (
                <Button onClick={() => setCurrentStep(4)} className="w-full" size="lg">
                  Continue to First Job
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              )}

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(2)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSkip} variant="outline" className="flex-1">
                  Skip for now
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 5: First Job ── */}
        {currentStep === 4 && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              {!createdClientId ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">You need to create a client first.</p>
                  <Button onClick={() => setCurrentStep(3)} variant="outline" size="sm">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Go Back to Add Client
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Job Title</Label>
                    <Input
                      value={jobForm.title}
                      onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                      placeholder="Lawn Mowing"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={jobForm.scheduled_date}
                        onChange={(e) => setJobForm({ ...jobForm, scheduled_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Time</Label>
                      <Input
                        type="time"
                        value={jobForm.scheduled_time}
                        onChange={(e) => setJobForm({ ...jobForm, scheduled_time: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Price <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={jobForm.total_price}
                        onChange={(e) => setJobForm({ ...jobForm, total_price: e.target.value })}
                        placeholder="0.00"
                        className="pl-7"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Textarea
                      value={jobForm.notes}
                      onChange={(e) => setJobForm({ ...jobForm, notes: e.target.value })}
                      placeholder="Any details about this job..."
                      rows={2}
                    />
                  </div>

                  <Button onClick={handleCreateJob} disabled={isSaving} className="w-full" size="lg">
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Check className="w-5 h-5 mr-2" />}
                    Create Job & Finish Setup
                  </Button>
                </>
              )}

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(3)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={() => navigate("/contractor")} variant="outline" className="flex-1">
                  Skip & Go to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
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
