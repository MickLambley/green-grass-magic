import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Clock, ArrowRight, Check, X, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Suggestion {
  id: string;
  job_id: string;
  current_date_val: string;
  current_time_slot: string;
  suggested_date: string;
  suggested_time_slot: string;
  requires_customer_approval: boolean;
  customer_approval_status: string;
  job_title?: string;
  client_name?: string;
}

interface Optimization {
  id: string;
  optimization_date: string;
  level: number;
  time_saved_minutes: number;
  status: string;
  created_at: string;
  suggestions: Suggestion[];
}

interface RouteOptimizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractorId: string;
  onUpdated: () => void;
}

const slotLabel = (slot: string) => slot === "morning" ? "Morning (7am–12pm)" : "Afternoon (12pm–5pm)";

const RouteOptimizationModal = ({ open, onOpenChange, contractorId, onUpdated }: RouteOptimizationModalProps) => {
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (open) fetchOptimizations();
  }, [open, contractorId]);

  const fetchOptimizations = async () => {
    setLoading(true);

    const { data: opts } = await supabase
      .from("route_optimizations")
      .select("*")
      .eq("contractor_id", contractorId)
      .in("status", ["pending_approval", "awaiting_customer"])
      .order("created_at", { ascending: false });

    if (!opts || opts.length === 0) {
      setOptimizations([]);
      setLoading(false);
      return;
    }

    // Fetch suggestions for each optimization
    const optIds = opts.map(o => o.id);
    const { data: suggestions } = await supabase
      .from("route_optimization_suggestions")
      .select("*")
      .in("route_optimization_id", optIds);

    // Fetch job details for suggestions
    const jobIds = [...new Set((suggestions || []).map(s => s.job_id))];
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, client_id")
      .in("id", jobIds);

    const clientIds = [...new Set((jobs || []).map(j => j.client_id))];
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", clientIds);

    const clientMap = new Map((clients || []).map(c => [c.id, c.name]));
    const jobMap = new Map((jobs || []).map(j => [j.id, { title: j.title, client_name: clientMap.get(j.client_id) || "Unknown" }]));

    const enriched: Optimization[] = opts.map(opt => ({
      ...opt,
      suggestions: (suggestions || [])
        .filter(s => s.route_optimization_id === opt.id)
        .map(s => ({
          ...s,
          job_title: jobMap.get(s.job_id)?.title || "Job",
          client_name: jobMap.get(s.job_id)?.client_name || "Unknown",
        })),
    }));

    setOptimizations(enriched);
    setLoading(false);
  };

  const handleAccept = async (opt: Optimization) => {
    setActing(true);
    try {
      // Apply all suggestions
      for (const s of opt.suggestions) {
        await supabase.from("jobs").update({
          scheduled_date: s.suggested_date,
          scheduled_time: s.suggested_time_slot === "morning" ? "08:00" : "13:00",
          original_scheduled_date: s.current_date_val,
          original_time_slot: s.current_time_slot,
        }).eq("id", s.job_id);
      }

      await supabase.from("route_optimizations").update({ status: "applied" }).eq("id", opt.id);
      toast.success(`Route optimized! Saving ${opt.time_saved_minutes} minutes.`);
      onUpdated();
      fetchOptimizations();
    } catch (err) {
      toast.error("Failed to apply optimization");
    }
    setActing(false);
  };

  const handleDecline = async (opt: Optimization) => {
    setActing(true);
    await supabase.from("route_optimizations").update({ status: "declined" }).eq("id", opt.id);
    toast.success("Optimization declined");
    fetchOptimizations();
    setActing(false);
  };

  const handleAskCustomers = async (opt: Optimization) => {
    setActing(true);
    try {
      await supabase.from("route_optimizations").update({ status: "awaiting_customer" }).eq("id", opt.id);

      // Notify customers for each suggestion that requires approval
      for (const s of opt.suggestions.filter(s => s.requires_customer_approval)) {
        // Find the customer user_id through client -> user_id
        const { data: job } = await supabase
          .from("jobs")
          .select("client_id, clients!inner(user_id)")
          .eq("id", s.job_id)
          .single();

        const customerUserId = (job?.clients as any)?.user_id;
        if (customerUserId) {
          await supabase.from("notifications").insert({
            user_id: customerUserId,
            title: "📅 Schedule Change Request",
            message: `Your contractor has requested to move your booking from ${slotLabel(s.current_time_slot)} to ${slotLabel(s.suggested_time_slot)} on ${format(new Date(s.suggested_date), "EEEE, dd MMM")}. Please review in your portal.`,
            type: "route_change_request",
          });
        }
      }

      toast.success("Customers notified — awaiting their responses");
      fetchOptimizations();
    } catch (err) {
      toast.error("Failed to notify customers");
    }
    setActing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Route Optimizations
          </DialogTitle>
          <DialogDescription>Review and manage suggested route changes to save travel time.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : optimizations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No pending optimizations right now.</p>
            <p className="text-xs mt-1">Optimizations run nightly for Pro plans.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {optimizations.map(opt => (
              <Card key={opt.id} className="border-primary/20">
                <CardContent className="p-4 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Level {opt.level} Optimization
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(opt.optimization_date), "EEEE, dd MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                        <Clock className="w-3 h-3 mr-1" />
                        Save {opt.time_saved_minutes} min
                      </Badge>
                      {opt.status === "awaiting_customer" && (
                        <Badge variant="secondary">
                          <Users className="w-3 h-3 mr-1" /> Awaiting
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Suggested changes */}
                  <div className="space-y-2">
                    {opt.suggestions.map(s => (
                      <div key={s.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{s.client_name}</p>
                          <p className="text-xs text-muted-foreground">{s.job_title}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {slotLabel(s.current_time_slot).split(" ")[0]}
                        </Badge>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <Badge variant="default" className="text-[10px] shrink-0">
                          {slotLabel(s.suggested_time_slot).split(" ")[0]}
                        </Badge>
                        {opt.status === "awaiting_customer" && (
                          <Badge
                            variant={s.customer_approval_status === "approved" ? "default" : s.customer_approval_status === "declined" ? "destructive" : "secondary"}
                            className="text-[10px] shrink-0"
                          >
                            {s.customer_approval_status}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  {opt.status === "pending_approval" && (
                    <DialogFooter className="flex-row gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleDecline(opt)} disabled={acting}>
                        <X className="w-4 h-4 mr-1" /> Decline
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => handleAskCustomers(opt)} disabled={acting}>
                        <Users className="w-4 h-4 mr-1" /> Ask Customers
                      </Button>
                      <Button size="sm" onClick={() => handleAccept(opt)} disabled={acting}>
                        <Check className="w-4 h-4 mr-1" /> Accept
                      </Button>
                    </DialogFooter>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RouteOptimizationModal;
