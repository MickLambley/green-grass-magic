import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Loader2, Leaf } from "lucide-react";
import PortalLayout, { ContractorBrand } from "@/components/customer-portal/PortalLayout";
import PortalOverview from "@/components/customer-portal/PortalOverview";
import PortalJobsList from "@/components/customer-portal/PortalJobsList";
import PortalDisputesList from "@/components/customer-portal/PortalDisputesList";

const ContractorSiteDashboard = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [contractor, setContractor] = useState<ContractorBrand | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!slug) return;

    // Load contractor
    supabase
      .from("contractors")
      .select("id, business_name, business_logo_url, primary_color, secondary_color, accent_color")
      .eq("subdomain", slug)
      .eq("website_published", true)
      .single()
      .then(({ data }) => {
        if (data) {
          setContractor({
            id: data.id,
            business_name: data.business_name || "Lawn Care Pro",
            business_logo_url: data.business_logo_url,
            primary_color: data.primary_color || "#16a34a",
            secondary_color: data.secondary_color || "#15803d",
            accent_color: data.accent_color || "#22c55e",
          });
        }
      });

    // Check auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate(`/site/${slug}/auth?redirect=portal`);
      } else {
        setUser(session.user);
        validateAccess(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session?.user) {
        navigate(`/site/${slug}/auth?redirect=portal`);
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [slug]);

  const validateAccess = async (userId: string) => {
    // Ensure the user has a client relationship with this contractor
    const { data: contractorData } = await supabase
      .from("contractors")
      .select("id")
      .eq("subdomain", slug)
      .single();

    if (!contractorData) return;

    const { data: clientRecord } = await supabase
      .from("clients")
      .select("id")
      .eq("contractor_id", contractorData.id)
      .eq("user_id", userId)
      .maybeSingle();

    // If no client record, they can still view the portal but will see empty state
    // The client record gets created when they book via the public website
  };

  if (loading || !contractor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Leaf className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Please Sign In</h1>
          <p className="text-muted-foreground">You need to be signed in to access this portal.</p>
        </div>
      </div>
    );
  }

  return (
    <PortalLayout contractor={contractor} user={user} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "overview" && (
        <PortalOverview userId={user.id} contractor={contractor} onNavigate={setActiveTab} />
      )}
      {activeTab === "jobs" && (
        <PortalJobsList userId={user.id} contractor={contractor} />
      )}
      {activeTab === "disputes" && (
        <PortalDisputesList userId={user.id} contractor={contractor} />
      )}
    </PortalLayout>
  );
};

export default ContractorSiteDashboard;
