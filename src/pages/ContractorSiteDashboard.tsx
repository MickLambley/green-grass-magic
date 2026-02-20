import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Leaf } from "lucide-react";
import Dashboard from "./Dashboard";

const ContractorSiteDashboard = () => {
  const { slug } = useParams<{ slug: string }>();
  const [contractor, setContractor] = useState<{
    business_name: string | null;
    business_logo_url: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from("contractors")
      .select("business_name, business_logo_url")
      .eq("subdomain", slug)
      .eq("website_published", true)
      .single()
      .then(({ data }) => {
        setContractor(data);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!contractor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Leaf className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Site Not Found</h1>
          <p className="text-muted-foreground">This contractor website doesn't exist or isn't published yet.</p>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      contractorSlug={slug}
      contractorName={contractor.business_name || undefined}
      contractorLogoUrl={contractor.business_logo_url}
    />
  );
};

export default ContractorSiteDashboard;
