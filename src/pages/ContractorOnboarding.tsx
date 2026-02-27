import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Leaf, ArrowRight, ArrowLeft, Loader2, Check, Building2,
  CreditCard, Globe, Users, Calendar, Sparkles, ExternalLink,
  CheckCircle2, User as UserIcon, Plus, MapPin, Search,
} from "lucide-react";
import WorkingHoursEditor, { DEFAULT_WORKING_HOURS, type WorkingHours } from "@/components/contractor-crm/WorkingHoursEditor";
import { GeographicReachStep } from "@/components/contractor-onboarding/GeographicReachStep";
import type { GeographicData } from "@/components/contractor-onboarding/types";
import { toast } from "sonner";
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
  { key: "service_area", title: "Service Area", subtitle: "Define where you work", icon: MapPin },
  { key: "client", title: "First Client", subtitle: "Add your first client", icon: Users },
  { key: "job", title: "First Job", subtitle: "Schedule your first job", icon: Calendar },
];

interface SuburbEntry {
  suburb: string;
  postcode: string;
  state: string;
  selected: boolean;
}

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
  const [workingHours, setWorkingHours] = useState<WorkingHours>(DEFAULT_WORKING_HOURS);

  // Geographic data for service area step
  const [geoData, setGeoData] = useState<GeographicData>({
    maxTravelDistanceKm: 15,
    baseAddress: "",
    baseAddressLat: null,
    baseAddressLng: null,
    servicedSuburbs: [],
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
        .insert({ user_id: user.id, service_areas: [], is_active: false })
        .select().single();
      contractorData = newC;
    }

    if (contractorData) {
      setContractor(contractorData);
      if (contractorData.business_name || contractorData.abn) {
        setProfile({
          business_name: contractorData.business_name || "",
          abn: contractorData.abn || "",
          phone: contractorData.phone || "",
          business_address: contractorData.business_address || "",
        });
        if (contractorData.working_hours) {
          setWorkingHours(contractorData.working_hours as unknown as WorkingHours);
        }
        if (contractorData.business_name) {
          if (contractorData.stripe_onboarding_complete) {
            setCurrentStep(contractorData.website_published ? 3 : 2);
          } else {
            setCurrentStep(1);
          }
        }
      }
      // Pre-fill service area from business address
      if (contractorData.business_address) {
        setServiceAreaAddress(contractorData.business_address);
      }
      if (contractorData.service_center_lat && contractorData.service_center_lng) {
        setServiceAreaLat(contractorData.service_center_lat);
        setServiceAreaLng(contractorData.service_center_lng);
      }
      if (contractorData.service_radius_km) {
        setServiceRadiusKm(contractorData.service_radius_km);
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
      working_hours: workingHours as any,
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
      const { data: copyData, error: copyError } = await supabase.functions.invoke("generate-website-copy", {
        body: {
          business_name: contractor.business_name,
          location: contractor.business_address,
          phone: contractor.phone,
        },
      });
      if (copyError) throw copyError;

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

  // ── Service Area Handlers ──

  const handleGeocodeAddress = async () => {
    if (!serviceAreaAddress.trim()) {
      toast.error("Please enter your home base address");
      return;
    }

    setIsLoadingSuburbs(true);
    try {
      // Geocode the address
      const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke("geocode-address", {
        body: { address: serviceAreaAddress.trim() },
      });

      if (geocodeError || !geocodeData?.lat) {
        toast.error("Could not find that address. Please try a more specific address.");
        setIsLoadingSuburbs(false);
        return;
      }

      setServiceAreaLat(geocodeData.lat);
      setServiceAreaLng(geocodeData.lng);
      if (geocodeData.formatted_address) {
        setServiceAreaAddress(geocodeData.formatted_address);
      }

      // Update contractor with service center
      if (contractor) {
        await supabase.from("contractors").update({
          service_center_lat: geocodeData.lat,
          service_center_lng: geocodeData.lng,
          service_radius_km: serviceRadiusKm,
        }).eq("id", contractor.id);
      }

      // Get suburbs in radius
      const { data: suburbData, error: suburbError } = await supabase.functions.invoke("get-suburbs-in-radius", {
        body: { lat: geocodeData.lat, lng: geocodeData.lng, radius_km: serviceRadiusKm },
      });

      if (suburbError || !suburbData?.suburbs) {
        toast.error("Failed to find suburbs. The postcode database may not be seeded yet.");
        setIsLoadingSuburbs(false);
        return;
      }

      setSuburbs(suburbData.suburbs.map((s: any) => ({ ...s, selected: true })));
      setSuburbsLoaded(true);
      toast.success(`Found ${suburbData.count} suburbs within ${serviceRadiusKm}km`);
    } catch (err) {
      console.error("Service area error:", err);
      toast.error("Something went wrong. Please try again.");
    }
    setIsLoadingSuburbs(false);
  };

  const handleManualSuburbSearch = async (query: string) => {
    setManualSuburbQuery(query);
    if (query.length < 2) {
      setManualSuburbResults([]);
      return;
    }

    setIsSearchingSuburb(true);
    const { data } = await supabase
      .from("australian_postcodes")
      .select("suburb, postcode, state")
      .ilike("suburb", `${query}%`)
      .limit(10);

    if (data) {
      // Deduplicate
      const seen = new Set<string>();
      setManualSuburbResults(
        data.filter((d) => {
          const key = `${d.suburb}-${d.postcode}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );
    }
    setIsSearchingSuburb(false);
  };

  const handleAddManualSuburb = (s: { suburb: string; postcode: string; state: string }) => {
    // Check if already in list
    if (suburbs.find((x) => x.suburb === s.suburb && x.postcode === s.postcode)) {
      toast.info(`${s.suburb} is already in your list`);
      return;
    }
    setSuburbs((prev) => [...prev, { ...s, selected: true }].sort((a, b) => a.suburb.localeCompare(b.suburb)));
    setManualSuburbQuery("");
    setManualSuburbResults([]);
    toast.success(`Added ${s.suburb}`);
  };

  const toggleSuburb = (index: number) => {
    setSuburbs((prev) => prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s)));
  };

  const selectAllSuburbs = () => setSuburbs((prev) => prev.map((s) => ({ ...s, selected: true })));
  const deselectAllSuburbs = () => setSuburbs((prev) => prev.map((s) => ({ ...s, selected: false })));

  const handleSaveServiceArea = async () => {
    const selected = suburbs.filter((s) => s.selected);
    if (selected.length === 0) {
      toast.error("Please select at least one suburb");
      return;
    }

    setIsSavingServiceArea(true);
    try {
      const { error } = await supabase.functions.invoke("update-service-areas", {
        body: {
          suburbs: selected.map((s) => ({ suburb: s.suburb, postcode: s.postcode })),
        },
      });

      if (error) throw error;

      // Update contractor with radius info
      if (contractor) {
        await supabase.from("contractors").update({
          service_radius_km: serviceRadiusKm,
          service_center_lat: serviceAreaLat,
          service_center_lng: serviceAreaLng,
        }).eq("id", contractor.id);
      }

      toast.success(`Saved ${selected.length} service suburbs!`);
      setCurrentStep(4);
    } catch (err) {
      console.error("Save service area error:", err);
      toast.error("Failed to save service areas");
    }
    setIsSavingServiceArea(false);
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
    setCurrentStep(5);
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
  const selectedSuburbCount = suburbs.filter((s) => s.selected).length;

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
                <Input value={profile.business_name} onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} placeholder="John's Lawn Care" />
              </div>
              <div className="space-y-2">
                <Label>ABN <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={profile.abn} onChange={(e) => setProfile({ ...profile, abn: e.target.value })} placeholder="12 345 678 901" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="0400 000 000" />
              </div>
              <div className="space-y-2">
                <Label>Business Address</Label>
                <Input value={profile.business_address} onChange={(e) => setProfile({ ...profile, business_address: e.target.value })} placeholder="123 Main St, Melbourne VIC 3000" />
              </div>
              <div className="space-y-2 pt-2">
                <Label className="text-sm font-semibold">Working Days & Hours</Label>
                <p className="text-xs text-muted-foreground mb-2">Set which days you work and your start/end times</p>
                <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} compact />
              </div>
              <Button onClick={handleSaveProfile} disabled={isSaving} className="w-full" size="lg">
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Save & Continue <ArrowRight className="w-5 h-5 ml-2" />
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
                  Connect Stripe <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              )}
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(0)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSkip} variant="outline" className="flex-1">
                  {contractor?.stripe_onboarding_complete ? "Next" : "Skip for now"} <ArrowRight className="w-4 h-4 ml-2" />
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
                    <a href={`${window.location.origin}/site/${contractor.subdomain}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-sm text-primary hover:underline">
                      <Globe className="w-4 h-4" /> View your website <ExternalLink className="w-3 h-3" />
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
                  {contractor?.website_published ? "Next" : "Skip for now"} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Service Area ── */}
        {currentStep === 3 && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              {/* Part 1: Home Base & Radius */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Home Base Address *</Label>
                  <p className="text-xs text-muted-foreground">Where you'll travel from to reach jobs</p>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={serviceAreaAddress}
                      onChange={(e) => setServiceAreaAddress(e.target.value)}
                      placeholder="123 Main St, Melbourne VIC 3000"
                      className="pl-10"
                    />
                  </div>
                  {serviceAreaLat && (
                    <p className="text-xs text-primary flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Location found
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label>Service Radius</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">5 km</span>
                    <span className="text-2xl font-bold text-primary">{serviceRadiusKm} km</span>
                    <span className="text-sm text-muted-foreground">50 km</span>
                  </div>
                  <Slider
                    value={[serviceRadiusKm]}
                    onValueChange={([v]) => setServiceRadiusKm(v)}
                    min={5}
                    max={50}
                    step={5}
                  />
                </div>

                <Button
                  onClick={handleGeocodeAddress}
                  disabled={isLoadingSuburbs || !serviceAreaAddress.trim()}
                  className="w-full"
                  variant="outline"
                  size="lg"
                >
                  {isLoadingSuburbs ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Search className="w-5 h-5 mr-2" />
                  )}
                  Find Suburbs
                </Button>
              </div>

              {/* Part 2: Suburb Selection */}
              {suburbsLoaded && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <Label>
                      Suburbs in your area
                      <Badge variant="outline" className="ml-2">{selectedSuburbCount} selected</Badge>
                    </Label>
                  </div>

                  {/* Manual Add */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={manualSuburbQuery}
                      onChange={(e) => handleManualSuburbSearch(e.target.value)}
                      placeholder="Manually add a suburb..."
                      className="pl-10"
                    />
                    {manualSuburbResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
                        {manualSuburbResults.map((s, i) => (
                          <button
                            key={`${s.suburb}-${s.postcode}-${i}`}
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between"
                            onClick={() => handleAddManualSuburb(s)}
                          >
                            <span>{s.suburb}</span>
                            <span className="text-muted-foreground text-xs">{s.postcode}, {s.state}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Select/Deselect All */}
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={selectAllSuburbs} disabled={selectedSuburbCount === suburbs.length}>
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAllSuburbs} disabled={selectedSuburbCount === 0}>
                      Deselect All
                    </Button>
                  </div>

                  {/* Suburb Table */}
                  <ScrollArea className="h-64 rounded-lg border border-border">
                    <div className="divide-y divide-border">
                      {suburbs.map((s, i) => (
                        <div
                          key={`${s.suburb}-${s.postcode}`}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleSuburb(i)}
                        >
                          <Checkbox
                            checked={s.selected}
                            onCheckedChange={() => toggleSuburb(i)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className={`text-sm flex-1 ${s.selected ? "text-foreground" : "text-muted-foreground"}`}>
                            {s.suburb}
                          </span>
                          <span className="text-xs text-muted-foreground">{s.postcode}</span>
                          <span className="text-xs text-muted-foreground">{s.state}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  <p className="text-xs text-muted-foreground">
                    Uncheck suburbs you don't want to service. You can update this later in Settings.
                  </p>
                </div>
              )}

              {/* Save & Navigation */}
              {suburbsLoaded && (
                <Button
                  onClick={handleSaveServiceArea}
                  disabled={isSavingServiceArea || selectedSuburbCount === 0}
                  className="w-full"
                  size="lg"
                >
                  {isSavingServiceArea ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Check className="w-5 h-5 mr-2" />}
                  Save {selectedSuburbCount} Suburbs & Continue
                </Button>
              )}

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(2)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSkip} variant="outline" className="flex-1">
                  Skip for now <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 5: First Client ── */}
        {currentStep === 4 && (
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
                  <div className="space-y-2">
                    <Label>Address <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} placeholder="123 Client St, Melbourne VIC" />
                  </div>
                </>
              )}
              {!createdClientId ? (
                <Button onClick={handleCreateClient} disabled={isSaving} className="w-full" size="lg">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                  Add Client & Continue
                </Button>
              ) : (
                <Button onClick={() => setCurrentStep(5)} className="w-full" size="lg">
                  Continue to First Job <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              )}
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(3)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSkip} variant="outline" className="flex-1">
                  Skip for now <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 6: First Job ── */}
        {currentStep === 5 && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              {!createdClientId ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">You need to create a client first.</p>
                  <Button onClick={() => setCurrentStep(4)} variant="outline" size="sm">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Go Back to Add Client
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Job Title</Label>
                    <Input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} placeholder="Lawn Mowing" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Date *</Label>
                      <Input type="date" value={jobForm.scheduled_date} onChange={(e) => setJobForm({ ...jobForm, scheduled_date: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Time</Label>
                      <Input type="time" value={jobForm.scheduled_time} onChange={(e) => setJobForm({ ...jobForm, scheduled_time: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Price <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input type="number" value={jobForm.total_price} onChange={(e) => setJobForm({ ...jobForm, total_price: e.target.value })} placeholder="0.00" className="pl-7" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Textarea value={jobForm.notes} onChange={(e) => setJobForm({ ...jobForm, notes: e.target.value })} placeholder="Any details about this job..." rows={2} />
                  </div>
                  <Button onClick={handleCreateJob} disabled={isSaving} className="w-full" size="lg">
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Check className="w-5 h-5 mr-2" />}
                    Create Job & Finish Setup
                  </Button>
                </>
              )}
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCurrentStep(4)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={() => navigate("/contractor")} variant="outline" className="flex-1">
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
