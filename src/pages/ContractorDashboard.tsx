import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  Leaf, LogOut, Users, Calendar, FileText, Receipt,
  LayoutDashboard, Settings, Globe, Loader2, Menu, X,
  Bell, DollarSign, AlertTriangle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

import DashboardOverview from "@/components/contractor-crm/DashboardOverview";
import ClientsTab from "@/components/contractor-crm/ClientsTab";
import JobsTab from "@/components/contractor-crm/JobsTab";
import QuotesTab from "@/components/contractor-crm/QuotesTab";
import InvoicesTab from "@/components/contractor-crm/InvoicesTab";
import ProfileSettingsTab from "@/components/contractor-crm/ProfileSettingsTab";
import WebsiteBuilderTab from "@/components/contractor-crm/WebsiteBuilderTab";
import ContractorPricingTab from "@/components/contractor-crm/ContractorPricingTab";
import DisputeManagementTab from "@/components/contractor-crm/DisputeManagementTab";
import AlternativeTimeTab from "@/components/contractor-crm/AlternativeTimeTab";
import RouteOptimizationBanner from "@/components/contractor-crm/RouteOptimizationBanner";
import RouteOptimizationModal from "@/components/contractor-crm/RouteOptimizationModal";
import StripeConnectBanner from "@/components/contractor-crm/StripeConnectBanner";
type Contractor = Tables<"contractors">;

const NAV_ITEMS = [
  { key: "overview", label: "Home", icon: LayoutDashboard },
  { key: "jobs", label: "Jobs", icon: Calendar },
  { key: "clients", label: "Clients", icon: Users },
  { key: "quotes", label: "Quotes", icon: FileText },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "pricing", label: "Pricing", icon: DollarSign },
  { key: "scheduling", label: "Scheduling", icon: Clock },
  { key: "disputes", label: "Issues", icon: AlertTriangle },
  { key: "website", label: "Website", icon: Globe },
  { key: "settings", label: "Settings", icon: Settings },
] as const;

// Bottom nav shows max 5 items on mobile
const MOBILE_NAV = ["overview", "jobs", "clients", "disputes", "settings"] as const;

const ContractorDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [user, setUser] = useState<User | null>(null);
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [routeOptOpen, setRouteOptOpen] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [optimizationPreview, setOptimizationPreview] = useState<{
    timeSaved: number;
    proposedChanges: { jobId: string; title: string; clientName: string; date: string; currentTime: string | null; newTime: string }[];
  } | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const handleRunOptimization = async () => {
    if (!contractor) return;
    setIsOptimizing(true);
    try {
      // Step 1: Preview (dry run)
      const { data, error } = await supabase.functions.invoke("route-optimization", {
        body: { contractor_id: contractor.id, preview: true },
      });
      if (error) throw error;
      if (data?.result && data.result.timeSaved > 0) {
        setOptimizationPreview({
          timeSaved: data.result.timeSaved,
          proposedChanges: data.result.proposedChanges || [],
        });
        setPreviewOpen(true);
      } else {
        toast.info("No optimization opportunities found. Ensure jobs have client addresses and are not locked.");
      }
    } catch (err) {
      console.error("Optimization error:", err);
      toast.error("Failed to preview optimization");
    }
    setIsOptimizing(false);
  };

  const handleConfirmOptimization = async () => {
    if (!contractor) return;
    setIsApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("route-optimization", {
        body: { contractor_id: contractor.id },
      });
      if (error) throw error;
      if (data?.result) {
        toast.success(`Routes optimized! Saved ${data.result.timeSaved} minutes.`);
      }
      setPreviewOpen(false);
      setOptimizationPreview(null);
    } catch (err) {
      console.error("Optimization error:", err);
      toast.error("Failed to apply optimization");
    }
    setIsApplying(false);
  };

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    if (activeTab !== "overview") {
      setSearchParams({ tab: activeTab }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [activeTab]);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/contractor-auth"); return; }
    setUser(user);

    const { data: roles } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "contractor");
    if (!roles || roles.length === 0) { toast.error("No contractor access"); navigate("/contractor-auth"); return; }

    const { data: contractorData } = await supabase
      .from("contractors").select("*")
      .eq("user_id", user.id).single();
    if (!contractorData) { toast.error("Profile not found"); navigate("/contractor-auth"); return; }

    if (!contractorData.onboarding_completed) {
      navigate("/contractor-onboarding");
      return;
    }

    setContractor(contractorData);

    const { count } = await supabase
      .from("notifications").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("is_read", false);
    setUnreadNotifs(count || 0);

    setIsLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const switchTab = (key: string) => {
    setActiveTab(key);
    setSidebarOpen(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl gradient-hero flex items-center justify-center animate-pulse">
            <Leaf className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!contractor) return null;

  if (!contractor.is_active && !contractor.abn) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card sticky top-0 z-50">
          <div className="px-4 sm:px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl gradient-hero flex items-center justify-center">
                <Leaf className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-foreground">Yardly</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </header>
        <div className="flex items-center justify-center px-4 py-20">
          <div className="max-w-sm text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-sunshine/20 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-sunshine animate-spin" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground mb-3">Complete Your Profile</h1>
            <p className="text-muted-foreground text-sm">
              Please complete your contractor onboarding to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentNav = NAV_ITEMS.find((n) => n.key === activeTab) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex md:flex-col md:w-64 border-r border-border bg-card fixed inset-y-0 left-0 z-40">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border">
          <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center shadow-soft">
            <Leaf className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-display font-bold text-foreground text-sm leading-tight">Yardly</span>
            {contractor.business_name && (
              <span className="text-[11px] text-muted-foreground truncate leading-tight">{contractor.business_name}</span>
            )}
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => switchTab(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display font-bold text-xs">
              {(user?.email?.[0] || "U").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r border-border shadow-large flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between px-4 h-14 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl gradient-hero flex items-center justify-center">
                  <Leaf className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-foreground text-sm">Yardly</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => switchTab(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-border p-4">
              <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleLogout}>
                <LogOut className="w-4 h-4" /> Sign Out
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen pb-20 md:pb-0">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border">
          <div className="flex items-center justify-between px-4 sm:px-6 h-14">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="md:hidden h-9 w-9" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
              </Button>
              <h1 className="font-display font-bold text-lg text-foreground">{currentNav.label}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={() => switchTab("overview")}>
                <Bell className="w-5 h-5 text-muted-foreground" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifs > 9 ? "9+" : unreadNotifs}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-5">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <RouteOptimizationBanner
                contractorId={contractor.id}
                subscriptionTier={contractor.subscription_tier}
                onOpenOptimizations={() => setRouteOptOpen(true)}
                onRunOptimization={handleRunOptimization}
                isOptimizing={isOptimizing}
              />
              <DashboardOverview contractorId={contractor.id} />
            </div>
          )}
          {activeTab === "clients" && <ClientsTab contractorId={contractor.id} />}
          {activeTab === "jobs" && (
            <div className="space-y-4">
              <RouteOptimizationBanner
                contractorId={contractor.id}
                subscriptionTier={contractor.subscription_tier}
                onOpenOptimizations={() => setRouteOptOpen(true)}
                onRunOptimization={handleRunOptimization}
                isOptimizing={isOptimizing}
              />
              <JobsTab contractorId={contractor.id} subscriptionTier={contractor.subscription_tier} workingHours={contractor.working_hours as any} onOpenRouteOptimization={() => setRouteOptOpen(true)} />
            </div>
          )}
          {activeTab === "quotes" && <QuotesTab contractorId={contractor.id} />}
          {activeTab === "invoices" && <InvoicesTab contractorId={contractor.id} gstRegistered={contractor.gst_registered} />}
          {activeTab === "pricing" && <ContractorPricingTab contractor={contractor} onUpdate={setContractor} />}
          {activeTab === "scheduling" && <AlternativeTimeTab contractorId={contractor.id} />}
          {activeTab === "disputes" && <DisputeManagementTab contractorId={contractor.id} />}
          {activeTab === "website" && <WebsiteBuilderTab contractor={contractor} onUpdate={setContractor} />}
          {activeTab === "settings" && <ProfileSettingsTab contractor={contractor} onUpdate={setContractor} />}
        </main>

        <RouteOptimizationModal
          open={routeOptOpen}
          onOpenChange={setRouteOptOpen}
          contractorId={contractor.id}
          onUpdated={() => {}}
        />
        <OptimizationPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          preview={optimizationPreview}
          onConfirm={handleConfirmOptimization}
          isApplying={isApplying}
        />
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-card border-t border-border">
        <div className="flex items-center justify-around h-16 px-1">
          {MOBILE_NAV.map((key) => {
            const item = NAV_ITEMS.find((n) => n.key === key)!;
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition-colors min-w-0 ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                <span className={`text-[10px] font-medium truncate ${isActive ? "text-primary" : ""}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="h-safe-area-inset-bottom bg-card" />
      </nav>
    </div>
  );
};

export default ContractorDashboard;
