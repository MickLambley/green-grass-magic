import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf, LogOut, Users, Calendar, FileText, Receipt, LayoutDashboard, Settings, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

import DashboardOverview from "@/components/contractor-crm/DashboardOverview";
import ClientsTab from "@/components/contractor-crm/ClientsTab";
import JobsTab from "@/components/contractor-crm/JobsTab";
import QuotesTab from "@/components/contractor-crm/QuotesTab";
import InvoicesTab from "@/components/contractor-crm/InvoicesTab";
import ProfileSettingsTab from "@/components/contractor-crm/ProfileSettingsTab";
import WebsiteBuilderTab from "@/components/contractor-crm/WebsiteBuilderTab";

type Contractor = Tables<"contractors">;

const ContractorDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      navigate("/contractor-auth");
      return;
    }

    setUser(user);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "contractor");

    if (!roles || roles.length === 0) {
      toast.error("You don't have contractor access");
      navigate("/contractor-auth");
      return;
    }

    const { data: contractorData } = await supabase
      .from("contractors")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!contractorData) {
      toast.error("Contractor profile not found");
      navigate("/contractor-auth");
      return;
    }

    if (!contractorData.abn) {
      navigate("/contractor-onboarding");
      return;
    }

    setContractor(contractorData);
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!contractor) return null;

  // Pending approval state
  if (contractor.approval_status !== "approved") {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-background/80 backdrop-blur-lg sticky top-0 z-50">
          <div className="container mx-auto px-4 flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <Leaf className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-foreground">Yardly</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </header>
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-sunshine/20 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-sunshine" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground mb-3">Application Under Review</h1>
            <p className="text-muted-foreground">
              Your contractor application is being reviewed. We'll notify you once it's been approved.
              This usually takes 1-2 business days.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
              <Leaf className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <span className="font-display font-bold text-foreground">Yardly</span>
              {contractor.business_name && (
                <span className="text-sm text-muted-foreground ml-2 hidden sm:inline">
                  — {contractor.business_name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden md:block">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Clients</span>
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Jobs</span>
            </TabsTrigger>
            <TabsTrigger value="quotes" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Quotes</span>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="w-4 h-4" />
              <span className="hidden sm:inline">Invoices</span>
            </TabsTrigger>
            <TabsTrigger value="website" className="gap-2">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Website</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <DashboardOverview contractorId={contractor.id} />
          </TabsContent>
          <TabsContent value="clients">
            <ClientsTab contractorId={contractor.id} />
          </TabsContent>
          <TabsContent value="jobs">
            <JobsTab contractorId={contractor.id} />
          </TabsContent>
          <TabsContent value="quotes">
            <QuotesTab contractorId={contractor.id} />
          </TabsContent>
          <TabsContent value="invoices">
            <InvoicesTab contractorId={contractor.id} gstRegistered={contractor.gst_registered} />
          </TabsContent>
          <TabsContent value="website">
            <WebsiteBuilderTab contractor={contractor} onUpdate={setContractor} />
          </TabsContent>
          <TabsContent value="settings">
            <ProfileSettingsTab contractor={contractor} onUpdate={setContractor} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ContractorDashboard;
