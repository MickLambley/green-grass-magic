import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, MessageSquare, Loader2, Send, Clock, CheckCircle2, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface Dispute {
  id: string;
  job_id: string | null;
  booking_id: string | null;
  description: string;
  status: string;
  contractor_response: string | null;
  resolution: string | null;
  resolved_at: string | null;
  suggested_refund_amount: number | null;
  refund_percentage: number | null;
  customer_photos: string[] | null;
  created_at: string;
  raised_by: string;
  // joined
  client_name?: string;
  job_title?: string;
  job_total?: number | null;
}

interface DisputeManagementTabProps {
  contractorId: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Awaiting Your Response", variant: "destructive" },
  contractor_responded: { label: "Awaiting Customer", variant: "secondary" },
  resolved: { label: "Resolved", variant: "outline" },
};

const DisputeManagementTab = ({ contractorId }: DisputeManagementTabProps) => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondDialogOpen, setRespondDialogOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [response, setResponse] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadDisputes();
  }, [contractorId]);

  const loadDisputes = async () => {
    const { data } = await supabase
      .from("disputes")
      .select("*")
      .eq("contractor_id", contractorId)
      .order("created_at", { ascending: false });

    if (data) {
      // Enrich with job data
      const jobIds = data.filter(d => d.job_id).map(d => d.job_id!);
      let jobMap = new Map<string, { title: string; total_price: number | null; client_name: string }>();
      
      if (jobIds.length > 0) {
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id, title, total_price, client_id")
          .in("id", jobIds);
        
        if (jobs) {
          const clientIds = [...new Set(jobs.map(j => j.client_id))];
          const { data: clients } = await supabase.from("clients").select("id, name").in("id", clientIds);
          const clientMap = new Map((clients || []).map(c => [c.id, c.name]));
          
          jobs.forEach(j => {
            jobMap.set(j.id, {
              title: j.title,
              total_price: j.total_price,
              client_name: clientMap.get(j.client_id) || "Unknown",
            });
          });
        }
      }

      setDisputes(data.map(d => {
        const jobInfo = d.job_id ? jobMap.get(d.job_id) : null;
        return {
          ...d,
          customer_photos: (d.customer_photos || []) as string[],
          client_name: jobInfo?.client_name || "Unknown",
          job_title: jobInfo?.title || "Unknown Job",
          job_total: jobInfo?.total_price,
        };
      }));
    }
    setLoading(false);
  };

  const openRespond = (dispute: Dispute) => {
    setSelectedDispute(dispute);
    setResponse(dispute.contractor_response || "");
    setRefundAmount(dispute.suggested_refund_amount?.toString() || "");
    setRespondDialogOpen(true);
  };

  const handleSubmitResponse = async () => {
    if (!selectedDispute || !response.trim()) return;
    setSubmitting(true);

    try {
      const refund = refundAmount ? parseFloat(refundAmount) : null;
      const refundPct = refund && selectedDispute.job_total ? Math.round((refund / selectedDispute.job_total) * 100) : null;

      const { error } = await supabase
        .from("disputes")
        .update({
          contractor_response: response.trim(),
          suggested_refund_amount: refund,
          refund_percentage: refundPct,
          status: "contractor_responded",
        })
        .eq("id", selectedDispute.id);

      if (error) throw error;
      toast.success("Response sent to customer");
      setRespondDialogOpen(false);
      loadDisputes();
    } catch {
      toast.error("Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const pendingDisputes = disputes.filter(d => d.status === "pending");
  const otherDisputes = disputes.filter(d => d.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-display text-foreground mb-1">Customer Issues</h2>
        <p className="text-sm text-muted-foreground">Manage and respond to customer disputes directly.</p>
      </div>

      {disputes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No Issues</h3>
            <p className="text-sm text-muted-foreground">Great work! No customer issues to resolve.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Pending — need your response */}
          {pendingDisputes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Needs Your Response ({pendingDisputes.length})
              </h3>
              <div className="space-y-3">
                {pendingDisputes.map(d => (
                  <DisputeCard key={d.id} dispute={d} onRespond={() => openRespond(d)} />
                ))}
              </div>
            </div>
          )}

          {/* Others */}
          {otherDisputes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">History</h3>
              <div className="space-y-3">
                {otherDisputes.map(d => (
                  <DisputeCard key={d.id} dispute={d} onRespond={() => openRespond(d)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Respond Dialog */}
      <Dialog open={respondDialogOpen} onOpenChange={setRespondDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Respond to Issue</DialogTitle>
          </DialogHeader>
          {selectedDispute && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs font-medium text-muted-foreground mb-1">Customer's Report</p>
                <p className="text-sm text-foreground">{selectedDispute.description}</p>
              </div>
              {selectedDispute.customer_photos && selectedDispute.customer_photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {selectedDispute.customer_photos.map((url, i) => (
                    <img key={i} src={url} alt={`Customer photo ${i + 1}`} className="rounded-lg object-cover aspect-square w-full" />
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <Label>Your Response *</Label>
                <Textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Explain your resolution or offer..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Refund Offer ($) — optional</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                />
                {selectedDispute.job_total && refundAmount && (
                  <p className="text-xs text-muted-foreground">
                    {Math.round((parseFloat(refundAmount) / selectedDispute.job_total) * 100)}% of job total (${selectedDispute.job_total.toFixed(2)})
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespondDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitResponse} disabled={submitting || !response.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              Send Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const DisputeCard = ({ dispute, onRespond }: { dispute: Dispute; onRespond: () => void }) => {
  const cfg = statusConfig[dispute.status] || statusConfig.pending;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground text-sm">{dispute.client_name}</p>
              <span className="text-xs text-muted-foreground">•</span>
              <p className="text-xs text-muted-foreground">{dispute.job_title}</p>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{dispute.description}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(dispute.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            </p>
            {dispute.resolution && (
              <p className="text-xs text-green-600 font-medium mt-1">✓ {dispute.resolution}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
            {dispute.status === "pending" && (
              <Button size="sm" onClick={onRespond}>
                <MessageSquare className="w-3.5 h-3.5 mr-1" /> Respond
              </Button>
            )}
            {dispute.status === "contractor_responded" && (
              <Button size="sm" variant="outline" onClick={onRespond}>Edit Response</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DisputeManagementTab;
