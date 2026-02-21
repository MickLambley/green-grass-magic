import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, Plus, Trash2, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";

interface SuggestTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    id: string;
    title: string;
    client_name: string;
    scheduled_date: string;
    source: "crm" | "platform";
  } | null;
  contractorId: string;
  onSuggested: () => void;
}

const TIME_SLOTS = [
  { value: "7am-10am", label: "7:00 AM – 10:00 AM" },
  { value: "10am-2pm", label: "10:00 AM – 2:00 PM" },
  { value: "2pm-5pm", label: "2:00 PM – 5:00 PM" },
];

interface Slot {
  date: string;
  timeSlot: string;
}

const SuggestTimeDialog = ({ open, onOpenChange, job, contractorId, onSuggested }: SuggestTimeDialogProps) => {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const resetState = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDate = tomorrow.toISOString().split("T")[0];
    setSlots([
      { date: defaultDate, timeSlot: "10am-2pm" },
      { date: defaultDate, timeSlot: "2pm-5pm" },
    ]);
  };

  // Reset when dialog opens
  const handleOpenChange = (o: boolean) => {
    if (o) resetState();
    onOpenChange(o);
  };

  const addSlot = () => {
    if (slots.length >= 3) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    setSlots([...slots, { date: tomorrow.toISOString().split("T")[0], timeSlot: "10am-2pm" }]);
  };

  const removeSlot = (i: number) => {
    if (slots.length <= 1) return;
    setSlots(slots.filter((_, idx) => idx !== i));
  };

  const updateSlot = (i: number, field: keyof Slot, value: string) => {
    const updated = [...slots];
    updated[i] = { ...updated[i], [field]: value };
    setSlots(updated);
  };

  const handleSubmit = async () => {
    if (!job || slots.length === 0) return;
    setSubmitting(true);

    try {
      const suggestions = slots.map(s => ({
        contractor_id: contractorId,
        suggested_date: s.date,
        suggested_time_slot: s.timeSlot,
        ...(job.source === "platform" ? { booking_id: job.id } : { job_id: job.id }),
      }));

      const { error } = await supabase.from("alternative_suggestions").insert(suggestions);
      if (error) throw error;

      // Update job status to indicate waiting for customer
      if (job.source === "platform") {
        // For platform bookings, keep pending but notify customer
        const { data: booking } = await supabase.from("bookings").select("user_id").eq("id", job.id).single();
        if (booking) {
          await supabase.from("notifications").insert({
            user_id: booking.user_id,
            title: "📅 New Time Options Available",
            message: `Your contractor has proposed ${slots.length} alternative time slot${slots.length > 1 ? "s" : ""} for your booking. Please review and choose one.`,
            type: "schedule_change",
            booking_id: job.id,
          });
        }
      } else {
        // For CRM jobs, update status
        await supabase.from("jobs").update({ status: "pending_confirmation" }).eq("id", job.id);
        // Notify customer if linked
        const { data: jobData } = await supabase.from("jobs").select("client_id").eq("id", job.id).single();
        if (jobData) {
          const { data: client } = await supabase.from("clients").select("user_id").eq("id", jobData.client_id).single();
          if (client?.user_id) {
            await supabase.from("notifications").insert({
              user_id: client.user_id,
              title: "📅 New Time Options Available",
              message: `Your contractor has proposed ${slots.length} alternative time slot${slots.length > 1 ? "s" : ""} for your job. Please review and choose one.`,
              type: "schedule_change",
            });
          }
        }
      }

      toast.success(`${slots.length} alternative time${slots.length > 1 ? "s" : ""} sent to customer`);
      onOpenChange(false);
      onSuggested();
    } catch {
      toast.error("Failed to send suggestions");
    } finally {
      setSubmitting(false);
    }
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Suggest Alternative Times</DialogTitle>
          <DialogDescription>
            Propose 2–3 time slots for "{job.title}" ({job.client_name}). The customer will choose one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Original time */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <span className="text-muted-foreground">Originally requested: </span>
            <span className="font-medium text-foreground">
              {new Date(job.scheduled_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
            </span>
          </div>

          {/* Slots */}
          {slots.map((slot, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Option {i + 1}
                </Label>
                <Input type="date" value={slot.date} onChange={(e) => updateSlot(i, "date", e.target.value)} />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Time
                </Label>
                <Select value={slot.timeSlot} onValueChange={(v) => updateSlot(i, "timeSlot", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {slots.length > 1 && (
                <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" onClick={() => removeSlot(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}

          {slots.length < 3 && (
            <Button variant="outline" size="sm" onClick={addSlot}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Time Slot
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || slots.length === 0 || slots.some(s => !s.date)}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Send {slots.length} Option{slots.length > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SuggestTimeDialog;
