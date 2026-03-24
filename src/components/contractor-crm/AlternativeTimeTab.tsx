import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar, Clock, Plus, Loader2, CheckCircle2, Send, Route, MapPin } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

interface PendingJob {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string | null;
  client_name: string;
  total_price: number | null;
}

interface Suggestion {
  id: string;
  job_id: string;
  suggested_date: string;
  suggested_time_slot: string;
  status: string;
  responded_at: string | null;
}

interface AlternativeTimeTabProps {
  contractorId: string;
  subscriptionTier?: string;
  onRunOptimization?: () => void;
  isOptimizing?: boolean;
}

const TIME_SLOTS = [
  { value: "7am-10am", label: "7:00 AM – 10:00 AM" },
  { value: "10am-2pm", label: "10:00 AM – 2:00 PM" },
  { value: "2pm-5pm", label: "2:00 PM – 5:00 PM" },
];

const AlternativeTimeTab = ({ contractorId, subscriptionTier, onRunOptimization, isOptimizing }: AlternativeTimeTabProps) => {
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTimeSlot, setNewTimeSlot] = useState("10am-2pm");
  const [submitting, setSubmitting] = useState(false);
  const [lastOptimized, setLastOptimized] = useState<string | null>(null);
  const [optimizeDate, setOptimizeDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    loadData();
    loadLastOptimized();
  }, [contractorId]);

  const loadLastOptimized = async () => {
    const { data } = await supabase
      .from("route_optimizations")
      .select("created_at")
      .eq("contractor_id", contractorId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setLastOptimized(data[0].created_at);
    }
  };

  const loadData = async () => {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, scheduled_date, scheduled_time, total_price, client_id")
      .eq("contractor_id", contractorId)
      .eq("status", "pending_confirmation")
      .order("scheduled_date");

    if (!jobs || jobs.length === 0) {
      setPendingJobs([]);
      setLoading(false);
      return;
    }

    const clientIds = [...new Set(jobs.map(j => j.client_id))];
    const { data: clients } = await supabase.from("clients").select("id, name").in("id", clientIds);
    const clientMap = new Map((clients || []).map(c => [c.id, c.name]));

    setPendingJobs(jobs.map(j => ({
      id: j.id,
      title: j.title,
      scheduled_date: j.scheduled_date,
      scheduled_time: j.scheduled_time,
      total_price: j.total_price,
      client_name: clientMap.get(j.client_id) || "Unknown",
    })));

    const jobIds = jobs.map(j => j.id);
    const { data: suggestionsData } = await supabase
      .from("alternative_suggestions")
      .select("*")
      .in("job_id", jobIds)
      .order("created_at");

    if (suggestionsData) {
      const map: Record<string, Suggestion[]> = {};
      suggestionsData.forEach(s => {
        const key = s.job_id!;
        if (!map[key]) map[key] = [];
        map[key].push({ ...s, job_id: key });
      });
      setSuggestions(map);
    }

    setLoading(false);
  };

  const openSuggestDialog = (jobId: string) => {
    setSelectedJobId(jobId);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setNewDate(tomorrow.toISOString().split("T")[0]);
    setNewTimeSlot("10am-2pm");
    setDialogOpen(true);
  };

  const handleSubmitSuggestion = async () => {
    if (!selectedJobId || !newDate) return;
    setSubmitting(true);

    try {
      const { error } = await supabase.from("alternative_suggestions").insert({
        job_id: selectedJobId,
        contractor_id: contractorId,
        suggested_date: newDate,
        suggested_time_slot: newTimeSlot,
      });
      if (error) throw error;
      toast.success("Alternative time sent to customer");
      setDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to send suggestion");
    } finally {
      setSubmitting(false);
    }
  };

  const canOptimize = subscriptionTier && ["starter", "pro"].includes(subscriptionTier);

  const today = new Date();
  const dateOptions = [0, 1, 2].map(offset => {
    const d = addDays(today, offset);
    return {
      value: format(d, "yyyy-MM-dd"),
      label: offset === 0 ? `Today — ${format(d, "EEE d MMM")}` : offset === 1 ? `Tomorrow — ${format(d, "EEE d MMM")}` : format(d, "EEE d MMM"),
    };
  });

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Schedule Changes section */}
      <div>
        <h2 className="text-lg font-bold font-display text-foreground mb-1">Schedule Changes</h2>
        <p className="text-sm text-muted-foreground">Propose alternative times for jobs that need rescheduling.</p>
      </div>

      {pendingJobs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">All Clear</h3>
            <p className="text-sm text-muted-foreground">No jobs pending confirmation right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pendingJobs.map(job => {
            const jobSuggestions = suggestions[job.id] || [];

            return (
              <Card key={job.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{job.title}</p>
                      <p className="text-sm text-muted-foreground">{job.client_name}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(job.scheduled_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        {job.scheduled_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {job.scheduled_time}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openSuggestDialog(job.id)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Suggest Time
                    </Button>
                  </div>

                  {jobSuggestions.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Proposed alternatives:</p>
                      {jobSuggestions.map(s => (
                        <div key={s.id} className="flex items-center gap-3 text-sm p-2 bg-muted/50 rounded-lg">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          <span>
                            {new Date(s.suggested_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                          </span>
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {TIME_SLOTS.find(t => t.value === s.suggested_time_slot)?.label || s.suggested_time_slot}
                          </span>
                          <Badge variant={s.status === "accepted" ? "default" : s.status === "declined" ? "destructive" : "secondary"} className="ml-auto">
                            {s.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Route Optimisation section */}
      <div className="border-t border-border pt-6">
        <h2 className="text-lg font-bold font-display text-foreground mb-1 flex items-center gap-2">
          <Route className="w-5 h-5 text-primary" />
          Route Optimisation
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Optimise your job order to minimise driving time. Works across today and the next 2 days.
        </p>

        {canOptimize ? (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                <div className="space-y-2 flex-1">
                  <Label className="text-xs font-medium text-muted-foreground">Optimise for</Label>
                  <Select value={optimizeDate} onValueChange={setOptimizeDate}>
                    <SelectTrigger className="w-full sm:w-[240px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dateOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={onRunOptimization} disabled={isOptimizing}>
                  {isOptimizing ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Optimising...</>
                  ) : (
                    <><Route className="w-4 h-4 mr-1" /> Optimise Route</>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Last optimised: {lastOptimized
                    ? format(new Date(lastOptimized), "dd MMM yyyy 'at' h:mm a")
                    : "Never"}
                </span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 text-center">
              <MapPin className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Upgrade to <strong className="text-foreground">Starter</strong> or <strong className="text-foreground">Pro</strong> to unlock route optimisation.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Suggest Time Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Suggest Alternative Time</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Time Slot</Label>
              <Select value={newTimeSlot} onValueChange={setNewTimeSlot}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitSuggestion} disabled={submitting || !newDate}>
              {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AlternativeTimeTab;
