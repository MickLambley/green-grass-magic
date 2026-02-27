import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Clock, Loader2, X, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { format, addHours, startOfDay, isBefore } from "date-fns";
import { cn } from "@/lib/utils";

const CANCELLATION_REASONS = [
  { value: "timing", label: "The scheduled day/time doesn't work for me" },
  { value: "no_longer_needed", label: "I no longer need the service" },
  { value: "found_alternative", label: "I found another provider" },
  { value: "cost", label: "The price is too high" },
  { value: "other", label: "Other reason" },
];

const TIME_SLOTS = [
  { value: "7am-10am", label: "Morning (7:00 AM – 10:00 AM)", startHour: 7 },
  { value: "10am-2pm", label: "Midday (10:00 AM – 2:00 PM)", startHour: 10 },
  { value: "2pm-5pm", label: "Afternoon (2:00 PM – 5:00 PM)", startHour: 14 },
];

interface CancelBookingFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle: string;
  contractorId: string;
  /** "job" for CRM jobs, "booking" for platform bookings */
  source: "job" | "booking";
  onCancelled: () => void;
  onRescheduled: () => void;
}

const CancelBookingFlow = ({
  open, onOpenChange, jobId, jobTitle, contractorId, source, onCancelled, onRescheduled,
}: CancelBookingFlowProps) => {
  const [step, setStep] = useState<"reason" | "reschedule">("reason");
  const [reason, setReason] = useState<string>("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Reschedule state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("");
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const min24HoursFromNow = addHours(new Date(), 24);

  const resetState = () => {
    setStep("reason");
    setReason("");
    setSelectedDate(undefined);
    setSelectedTimeSlot("");
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) resetState();
    onOpenChange(o);
  };

  const handleReasonSelected = () => {
    if (!reason) return;
    if (reason === "timing") {
      setStep("reschedule");
    } else {
      handleCancel();
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      if (source === "booking") {
        const { error } = await supabase
          .from("bookings")
          .update({ status: "cancelled" as any })
          .eq("id", jobId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("jobs")
          .update({ status: "cancelled" })
          .eq("id", jobId);
        if (error) throw error;
      }

      // Notify contractor
      const { data: contractor } = await supabase
        .from("contractors")
        .select("user_id")
        .eq("id", contractorId)
        .single();

      if (contractor) {
        const reasonLabel = CANCELLATION_REASONS.find(r => r.value === reason)?.label || reason;
        await supabase.from("notifications").insert({
          user_id: contractor.user_id,
          title: "❌ Booking Cancelled",
          message: `A customer cancelled "${jobTitle}". Reason: ${reasonLabel}`,
          type: "booking_cancelled",
        });
      }

      toast.success("Booking cancelled");
      handleOpenChange(false);
      onCancelled();
    } catch {
      toast.error("Failed to cancel booking");
    } finally {
      setIsCancelling(false);
    }
  };

  const isDateDisabled = (date: Date) => {
    // Disable dates less than 24 hours from now
    return isBefore(date, startOfDay(min24HoursFromNow));
  };

  const getAvailableTimeSlots = () => {
    if (!selectedDate) return TIME_SLOTS;
    const now = new Date();
    const minTime = addHours(now, 24);

    return TIME_SLOTS.filter(slot => {
      // Build a Date for this slot's start on the selected date
      const slotStart = new Date(selectedDate);
      slotStart.setHours(slot.startHour, 0, 0, 0);
      return !isBefore(slotStart, minTime);
    });
  };

  const handleReschedule = async () => {
    if (!selectedDate || !selectedTimeSlot) return;
    setIsRescheduling(true);

    const newDate = format(selectedDate, "yyyy-MM-dd");
    try {
      if (source === "booking") {
        const { error } = await supabase
          .from("bookings")
          .update({
            scheduled_date: newDate,
            time_slot: selectedTimeSlot,
            status: "pending" as any,
          })
          .eq("id", jobId);
        if (error) throw error;
      } else {
        // Map time slot to scheduled_time
        const slotToTime: Record<string, string> = {
          "7am-10am": "07:00",
          "10am-2pm": "10:00",
          "2pm-5pm": "14:00",
        };
        const { error } = await supabase
          .from("jobs")
          .update({
            scheduled_date: newDate,
            scheduled_time: slotToTime[selectedTimeSlot] || null,
            status: "pending_confirmation",
          })
          .eq("id", jobId);
        if (error) throw error;
      }

      // Notify contractor about reschedule request
      const { data: contractor } = await supabase
        .from("contractors")
        .select("user_id")
        .eq("id", contractorId)
        .single();

      if (contractor) {
        const slotLabel = TIME_SLOTS.find(s => s.value === selectedTimeSlot)?.label || selectedTimeSlot;
        await supabase.from("notifications").insert({
          user_id: contractor.user_id,
          title: "📅 Reschedule Request",
          message: `A customer requested to reschedule "${jobTitle}" to ${format(selectedDate, "EEEE, d MMM yyyy")}, ${slotLabel}. Please review.`,
          type: "schedule_change",
        });
      }

      toast.success("Reschedule request sent! Your contractor will review the change.");
      handleOpenChange(false);
      onRescheduled();
    } catch {
      toast.error("Failed to reschedule");
    } finally {
      setIsRescheduling(false);
    }
  };

  const availableSlots = getAvailableTimeSlots();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "reason" ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Cancel Booking</DialogTitle>
              <DialogDescription>
                Please let us know why you'd like to cancel "{jobTitle}".
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {CANCELLATION_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {reason === "timing" && (
                <div className="p-3 rounded-lg bg-sky/10 border border-sky/20 text-sm text-sky">
                  <CalendarClock className="w-4 h-4 inline mr-1.5" />
                  You'll be able to request a new time instead of cancelling.
                </div>
              )}
            </div>

            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Back
              </Button>
              <Button
                variant={reason === "timing" ? "default" : "destructive"}
                onClick={handleReasonSelected}
                disabled={!reason || isCancelling}
              >
                {isCancelling && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {reason === "timing" ? "Request New Time" : "Cancel Booking"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-primary" />
                Request a New Time
              </DialogTitle>
              <DialogDescription>
                Choose a new date and time for your booking. Only slots at least 24 hours from now are available.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Date Picker */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Date</label>
                <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {selectedDate ? format(selectedDate, "EEEE, d MMMM yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setSelectedTimeSlot("");
                        setDatePopoverOpen(false);
                      }}
                      disabled={isDateDisabled}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Time Slot Picker */}
              {selectedDate && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Time Slot</label>
                  {availableSlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                      No time slots available for this date (must be 24+ hours from now). Please choose a later date.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {availableSlots.map(slot => (
                        <button
                          key={slot.value}
                          onClick={() => setSelectedTimeSlot(slot.value)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border text-left transition-all text-sm",
                            selectedTimeSlot === slot.value
                              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                              : "border-border hover:border-primary/30 hover:bg-muted/50"
                          )}
                        >
                          <Clock className={cn(
                            "w-4 h-4 shrink-0",
                            selectedTimeSlot === slot.value ? "text-primary" : "text-muted-foreground"
                          )} />
                          <span className={cn(
                            "font-medium",
                            selectedTimeSlot === slot.value ? "text-primary" : "text-foreground"
                          )}>
                            {slot.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("reason")} className="text-muted-foreground">
                <X className="w-4 h-4 mr-1" /> Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isCancelling}
                >
                  {isCancelling && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Just Cancel
                </Button>
                <Button
                  onClick={handleReschedule}
                  disabled={!selectedDate || !selectedTimeSlot || isRescheduling}
                >
                  {isRescheduling && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Request New Time
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CancelBookingFlow;
