import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Send, Check, X, Clock, MessageSquare, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Dispute {
  id: string;
  job_id: string | null;
  description: string;
  status: string;
  contractor_response: string | null;
  resolution: string | null;
  resolved_at: string | null;
  suggested_refund_amount: number | null;
  refund_percentage: number | null;
  customer_photos: string[];
  created_at: string;
}

interface PortalDisputeSectionProps {
  jobId: string;
  contractorId: string;
  userId: string;
  jobTotal: number | null;
  onDisputeCreated?: () => void;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Awaiting Contractor Response", variant: "secondary" },
  contractor_responded: { label: "Contractor Responded", variant: "default" },
  resolved: { label: "Resolved", variant: "outline" },
  escalated: { label: "Escalated", variant: "destructive" },
};

export const PortalDisputeSection = ({ jobId, contractorId, userId, jobTotal, onDisputeCreated }: PortalDisputeSectionProps) => {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [respondingToOffer, setRespondingToOffer] = useState(false);

  useEffect(() => {
    loadDispute();
  }, [jobId]);

  const loadDispute = async () => {
    const { data } = await supabase
      .from("disputes")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setDispute({
        ...data,
        customer_photos: (data.customer_photos || []) as string[],
      });
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("disputes").insert({
        job_id: jobId,
        contractor_id: contractorId,
        raised_by: "customer",
        description: description.trim(),
        status: "pending",
      });
      if (error) throw error;
      toast.success("Issue reported. The contractor will respond shortly.");
      setShowForm(false);
      setDescription("");
      loadDispute();
      onDisputeCreated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to report issue");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOfferResponse = async (accepted: boolean) => {
    if (!dispute) return;
    setRespondingToOffer(true);
    try {
      const newStatus = accepted ? "resolved" : "pending";
      const resolution = accepted ? `Customer accepted refund of $${dispute.suggested_refund_amount?.toFixed(2)}` : null;
      
      const { error } = await supabase
        .from("disputes")
        .update({
          status: newStatus,
          resolution: accepted ? resolution : dispute.resolution,
          resolved_at: accepted ? new Date().toISOString() : null,
        })
        .eq("id", dispute.id);

      if (error) throw error;

      if (accepted) {
        toast.success("Offer accepted. The dispute has been resolved.");
      } else {
        toast.info("Offer declined. The contractor has been notified.");
      }
      loadDispute();
    } catch {
      toast.error("Failed to respond");
    } finally {
      setRespondingToOffer(false);
    }
  };

  if (loading) return null;

  // No dispute yet — show "Report an Issue" button
  if (!dispute && !showForm) {
    return (
      <Button variant="outline" size="sm" className="border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30" onClick={() => setShowForm(true)}>
        <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
        Report an Issue
      </Button>
    );
  }

  // Report form
  if (!dispute && showForm) {
    return (
      <div className="mt-4 p-4 rounded-xl border border-border bg-card space-y-3">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          Report an Issue
        </h4>
        <p className="text-xs text-muted-foreground">
          Describe the problem and your contractor will respond directly.
        </p>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue you encountered..."
          rows={3}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !description.trim()}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Submit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  // Active dispute display
  if (!dispute) return null;

  const { label, variant } = statusConfig[dispute.status] || statusConfig.pending;

  return (
    <div className="mt-4 p-4 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Issue Report
        </h4>
        <Badge variant={variant}>{label}</Badge>
      </div>

      {/* Customer's original report */}
      <div className="p-3 rounded-lg bg-muted/50">
        <p className="text-xs font-medium text-muted-foreground mb-1">Your report</p>
        <p className="text-sm text-foreground">{dispute.description}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(dispute.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>

      {/* Contractor's response */}
      {dispute.contractor_response && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
          <p className="text-xs font-medium text-primary mb-1">Contractor's Response</p>
          <p className="text-sm text-foreground">{dispute.contractor_response}</p>
          {dispute.suggested_refund_amount != null && dispute.suggested_refund_amount > 0 && (
            <p className="text-sm font-semibold text-primary mt-2">
              Refund offer: ${dispute.suggested_refund_amount.toFixed(2)}
              {dispute.refund_percentage ? ` (${dispute.refund_percentage}%)` : ""}
            </p>
          )}
        </div>
      )}

      {/* Accept / Decline offer */}
      {dispute.status === "contractor_responded" && dispute.suggested_refund_amount != null && dispute.suggested_refund_amount > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => handleOfferResponse(true)} disabled={respondingToOffer}>
            <Check className="w-3.5 h-3.5 mr-1" /> Accept Offer
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleOfferResponse(false)} disabled={respondingToOffer}>
            <X className="w-3.5 h-3.5 mr-1" /> Decline Offer
          </Button>
        </div>
      )}

      {/* Resolved state */}
      {dispute.status === "resolved" && dispute.resolution && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
          <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Resolution</p>
          <p className="text-sm text-foreground">{dispute.resolution}</p>
        </div>
      )}

      {/* Waiting state */}
      {dispute.status === "pending" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Waiting for your contractor to respond...</span>
        </div>
      )}
    </div>
  );
};

export default PortalDisputeSection;
