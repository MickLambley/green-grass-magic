import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Clock, CheckCircle2, Loader2 } from "lucide-react";
import PortalDisputeSection from "./PortalDisputeSection";
import type { ContractorBrand } from "./PortalLayout";

interface Dispute {
  id: string;
  job_id: string | null;
  description: string;
  status: string;
  contractor_response: string | null;
  suggested_refund_amount: number | null;
  created_at: string;
  job_title?: string;
}

interface PortalDisputesListProps {
  userId: string;
  contractor: ContractorBrand;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Awaiting Response", variant: "secondary" },
  contractor_responded: { label: "Response Available", variant: "default" },
  resolved: { label: "Resolved", variant: "outline" },
};

export const PortalDisputesList = ({ userId, contractor }: PortalDisputesListProps) => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadDisputes();
  }, [userId, contractor.id]);

  const loadDisputes = async () => {
    // Get client records
    const { data: clientRecords } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .eq("contractor_id", contractor.id);

    if (!clientRecords || clientRecords.length === 0) {
      setLoading(false);
      return;
    }

    const clientIds = clientRecords.map((c) => c.id);

    // Get jobs for this client
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title")
      .eq("contractor_id", contractor.id)
      .in("client_id", clientIds);

    if (!jobs || jobs.length === 0) {
      setLoading(false);
      return;
    }

    const jobIds = jobs.map((j) => j.id);
    const jobMap = new Map(jobs.map((j) => [j.id, j.title]));

    const { data: disputesData } = await supabase
      .from("disputes")
      .select("*")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false });

    if (disputesData) {
      setDisputes(
        disputesData.map((d) => ({
          ...d,
          job_title: d.job_id ? jobMap.get(d.job_id) || "Job" : "Job",
        }))
      );
    }

    setLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (disputes.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-8 shadow-sm border border-border text-center">
        <MessageSquare className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold text-foreground mb-2">No Issues</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          You haven't reported any issues. If you have a problem with a completed job, you can report it from the job details.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-foreground">Issue Reports</h2>
      {disputes.map((d) => {
        const { label, variant } = statusLabels[d.status] || statusLabels.pending;
        const isExpanded = expandedId === d.id;

        return (
          <div key={d.id} className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : d.id)}
              className="w-full p-5 text-left flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                {d.status === "resolved" ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
                )}
                <div>
                  <p className="font-medium text-foreground text-sm">{d.job_title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{d.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={variant}>{label}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(d.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </span>
              </div>
            </button>
            {isExpanded && d.job_id && (
              <div className="px-5 pb-5 border-t border-border pt-4">
                <PortalDisputeSection
                  jobId={d.job_id}
                  contractorId={contractor.id}
                  userId={userId}
                  jobTotal={null}
                  onDisputeCreated={loadDisputes}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PortalDisputesList;
