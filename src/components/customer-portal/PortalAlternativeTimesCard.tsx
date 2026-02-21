import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Check, X, User } from "lucide-react";
import { toast } from "sonner";

interface AlternativeSuggestion {
  id: string;
  job_id: string | null;
  contractor_id: string;
  suggested_date: string;
  suggested_time_slot: string;
  status: string;
  created_at: string;
}

interface PortalAlternativeTimesCardProps {
  suggestions: AlternativeSuggestion[];
  jobId: string;
  contractorName: string;
  onResponse: () => void;
}

const timeSlotLabels: Record<string, string> = {
  "7am-10am": "7:00 AM – 10:00 AM",
  "10am-2pm": "10:00 AM – 2:00 PM",
  "2pm-5pm": "2:00 PM – 5:00 PM",
};

export const PortalAlternativeTimesCard = ({ suggestions, jobId, contractorName, onResponse }: PortalAlternativeTimesCardProps) => {
  const [processing, setProcessing] = useState<string | null>(null);
  const pending = suggestions.filter((s) => s.status === "pending");
  if (pending.length === 0) return null;

  const accept = async (s: AlternativeSuggestion) => {
    setProcessing(s.id);
    try {
      // Accept this suggestion
      await supabase.from("alternative_suggestions").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", s.id);

      // Update job with new schedule and confirm
      await supabase.from("jobs").update({
        scheduled_date: s.suggested_date,
        scheduled_time: s.suggested_time_slot,
        status: "scheduled",
      }).eq("id", jobId);

      // Decline other pending suggestions
      await supabase
        .from("alternative_suggestions")
        .update({ status: "declined", responded_at: new Date().toISOString() })
        .eq("job_id", jobId)
        .eq("status", "pending")
        .neq("id", s.id);

      toast.success("New time accepted! Your job is confirmed.");
      onResponse();
    } catch {
      toast.error("Failed to accept suggestion");
    } finally {
      setProcessing(null);
    }
  };

  const decline = async (s: AlternativeSuggestion) => {
    setProcessing(s.id);
    try {
      await supabase.from("alternative_suggestions").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", s.id);
      toast.success("Suggestion declined");
      onResponse();
    } catch {
      toast.error("Failed to decline suggestion");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="mt-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          {contractorName} has suggested alternative times
        </span>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
        The originally requested time isn't available. Please choose one of the options below:
      </p>
      <div className="space-y-2">
        {pending.map((s) => (
          <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-card rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium">
                  {new Date(s.suggested_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>{timeSlotLabels[s.suggested_time_slot] || s.suggested_time_slot}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => accept(s)} disabled={!!processing}>
                <Check className="w-3 h-3 mr-1" /> Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => decline(s)} disabled={!!processing}>
                <X className="w-3 h-3 mr-1" /> Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PortalAlternativeTimesCard;
