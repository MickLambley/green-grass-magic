import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Clock, CheckCircle2, XCircle, DollarSign } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { ContractorBrand } from "./PortalLayout";

interface QuotedJob {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  total_price: number | null;
  quote_status: string;
  quote_type: string | null;
  quoted_rate: number | null;
  quoted_hours: number | null;
  requires_quote: boolean;
  notes: string | null;
  created_at: string;
}

interface PortalQuotesTabProps {
  userId: string;
  contractor: ContractorBrand;
}

const quoteStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Awaiting Quote", variant: "secondary" },
  quoted: { label: "Quote Received", variant: "default" },
  accepted: { label: "Accepted", variant: "outline" },
  declined: { label: "Declined", variant: "destructive" },
};

export const PortalQuotesTab = ({ userId, contractor }: PortalQuotesTabProps) => {
  const [jobs, setJobs] = useState<QuotedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => {
    loadQuotes();
  }, [userId, contractor.id]);

  const loadQuotes = async () => {
    const { data: clientRecords } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .eq("contractor_id", contractor.id);

    if (!clientRecords || clientRecords.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const clientIds = clientRecords.map((c) => c.id);

    const { data: jobsData } = await supabase
      .from("jobs")
      .select("id, title, description, status, scheduled_date, scheduled_time, total_price, quote_status, quote_type, quoted_rate, quoted_hours, requires_quote, notes, created_at")
      .eq("contractor_id", contractor.id)
      .in("client_id", clientIds)
      .eq("requires_quote", true)
      .order("created_at", { ascending: false });

    if (jobsData) {
      setJobs(jobsData as QuotedJob[]);
    }
    setLoading(false);
  };

  const handleResponse = async (jobId: string, action: "accepted" | "declined") => {
    setResponding(jobId);
    try {
      const newStatus = action === "accepted" ? "scheduled" : "cancelled";
      const { error } = await supabase
        .from("jobs")
        .update({
          quote_status: action,
          status: newStatus,
        })
        .eq("id", jobId);

      if (error) throw error;

      // Notify contractor
      const { data: contractorData } = await supabase
        .from("contractors")
        .select("user_id")
        .eq("id", contractor.id)
        .single();

      if (contractorData) {
        await supabase.from("notifications").insert({
          user_id: contractorData.user_id,
          title: `Quote ${action}`,
          message: `A customer has ${action} your quote for the job.`,
          type: action === "accepted" ? "success" : "info",
        });
      }

      toast({
        title: action === "accepted" ? "Quote Accepted" : "Quote Declined",
        description: action === "accepted"
          ? "The job has been scheduled. You'll hear from your contractor soon."
          : "The quote has been declined.",
      });

      loadQuotes();
    } catch (err) {
      toast({ title: "Error", description: "Failed to respond to quote. Please try again.", variant: "destructive" });
    } finally {
      setResponding(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const pendingQuotes = jobs.filter((j) => j.quote_status === "pending");
  const receivedQuotes = jobs.filter((j) => j.quote_status === "quoted");
  const resolvedQuotes = jobs.filter((j) => j.quote_status === "accepted" || j.quote_status === "declined");

  if (jobs.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-8 md:p-12 shadow-sm text-center border border-border">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-display text-lg font-semibold text-foreground mb-2">No quotes yet</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          When you request a service that requires a quote, it will appear here.
        </p>
      </div>
    );
  }

  const renderPriceBreakdown = (job: QuotedJob) => {
    if (job.quote_type === "hourly" && job.quoted_rate && job.quoted_hours) {
      return (
        <div className="text-sm text-muted-foreground">
          ${job.quoted_rate.toFixed(2)}/hr × {job.quoted_hours} hrs
        </div>
      );
    }
    return null;
  };

  const renderJobCard = (job: QuotedJob, showActions: boolean) => {
    const config = quoteStatusConfig[job.quote_status] || quoteStatusConfig.pending;

    return (
      <div key={job.id} className="bg-card rounded-xl p-5 shadow-sm border border-border">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${contractor.primary_color}15` }}>
              <FileText className="w-5 h-5" style={{ color: contractor.primary_color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">{job.title}</p>
              {job.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{job.description}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Requested {new Date(job.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                Preferred date: {new Date(job.scheduled_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              {job.notes && (
                <p className="text-sm text-muted-foreground mt-1 italic">"{job.notes}"</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={config.variant}>{config.label}</Badge>
            {job.total_price != null && job.quote_status !== "pending" && (
              <div className="text-right">
                <span className="text-lg font-bold" style={{ color: contractor.primary_color }}>
                  ${job.total_price.toFixed(2)}
                </span>
                {job.quote_type && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({job.quote_type === "hourly" ? "Hourly" : "Fixed"})
                  </span>
                )}
                {renderPriceBreakdown(job)}
              </div>
            )}
          </div>
        </div>

        {showActions && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
            <Button
              onClick={() => handleResponse(job.id, "accepted")}
              disabled={responding === job.id}
              className="flex-1"
              style={{ backgroundColor: contractor.primary_color }}
            >
              {responding === job.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Accept Quote
            </Button>
            <Button
              variant="outline"
              onClick={() => handleResponse(job.id, "declined")}
              disabled={responding === job.id}
              className="flex-1"
            >
              <XCircle className="w-4 h-4" />
              Decline
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Quotes needing response */}
      {receivedQuotes.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5" style={{ color: contractor.primary_color }} />
            Quotes to Review
          </h2>
          <div className="space-y-3">
            {receivedQuotes.map((job) => renderJobCard(job, true))}
          </div>
        </div>
      )}

      {/* Awaiting quote from contractor */}
      {pendingQuotes.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            Awaiting Quote
          </h2>
          <div className="space-y-3">
            {pendingQuotes.map((job) => renderJobCard(job, false))}
          </div>
        </div>
      )}

      {/* Resolved */}
      {resolvedQuotes.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Past Quotes</h2>
          <div className="space-y-3">
            {resolvedQuotes.map((job) => renderJobCard(job, false))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalQuotesTab;
