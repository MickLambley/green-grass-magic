import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MapPin, User, Calendar as CalendarIcon, Clock, Ruler, Trash2,
  Check, X, Loader2, DollarSign, AlertTriangle, ImageOff,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { getLawnImageSignedUrl } from "@/lib/storage";
import type { Json } from "@/integrations/supabase/types";

interface BookingAddress {
  id: string;
  street_address: string;
  city: string;
  state: string;
  postal_code: string;
  square_meters: number | null;
  slope: string;
  lawn_image_url: string | null;
  status: string;
}

interface CustomerProfile {
  full_name: string | null;
  phone: string | null;
}

interface PlatformBooking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  time_slot: string;
  total_price: number | null;
  grass_length: string;
  clippings_removal: boolean;
  notes: string | null;
  user_id: string;
  address_id: string;
  contractor_id: string | null;
  created_at: string;
}

interface PlatformBookingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  contractorId: string;
  onUpdated: () => void;
}

const timeSlots: Record<string, string> = {
  "7am-10am": "7:00 AM - 10:00 AM",
  "10am-2pm": "10:00 AM - 2:00 PM",
  "2pm-5pm": "2:00 PM - 5:00 PM",
};

const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "secondary", label: "Awaiting Accept" },
  confirmed: { variant: "default", label: "Confirmed" },
  completed: { variant: "outline", label: "Completed" },
  cancelled: { variant: "destructive", label: "Cancelled" },
};

const PlatformBookingDetailDialog = ({
  open, onOpenChange, bookingId, contractorId, onUpdated,
}: PlatformBookingDetailDialogProps) => {
  const [booking, setBooking] = useState<PlatformBooking | null>(null);
  const [address, setAddress] = useState<BookingAddress | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [lawnImageUrl, setLawnImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editPrice, setEditPrice] = useState("");
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [editTimeSlot, setEditTimeSlot] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  // Schedule change confirmation
  const [scheduleChangeDialog, setScheduleChangeDialog] = useState(false);
  const [pendingScheduleChange, setPendingScheduleChange] = useState<{
    date: string; timeSlot: string;
  } | null>(null);

  useEffect(() => {
    if (open && bookingId) {
      fetchBookingDetails();
    } else {
      setBooking(null);
      setAddress(null);
      setCustomer(null);
      setLawnImageUrl(null);
    }
  }, [open, bookingId]);

  const fetchBookingDetails = async () => {
    if (!bookingId) return;
    setLoading(true);

    const { data: bookingData } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (!bookingData) {
      toast.error("Booking not found");
      setLoading(false);
      return;
    }

    setBooking(bookingData as PlatformBooking);
    setEditPrice(bookingData.total_price?.toString() || "");
    setEditDate(new Date(bookingData.scheduled_date));
    setEditTimeSlot(bookingData.time_slot || "10am-2pm");
    setEditNotes(bookingData.notes || "");

    // Fetch address and customer profile in parallel
    const [addrRes, profileRes] = await Promise.all([
      supabase.from("addresses").select("*").eq("id", bookingData.address_id).single(),
      supabase.from("profiles").select("full_name, phone").eq("user_id", bookingData.user_id).single(),
    ]);

    if (addrRes.data) {
      setAddress(addrRes.data as BookingAddress);
      if (addrRes.data.lawn_image_url) {
        getLawnImageSignedUrl(addrRes.data.lawn_image_url).then(setLawnImageUrl);
      }
    }
    if (profileRes.data) setCustomer(profileRes.data);

    setLoading(false);
  };

  const handleAcceptBooking = async () => {
    if (!booking) return;
    setSaving(true);

    const newPrice = parseFloat(editPrice);
    const originalPrice = booking.total_price || 0;

    const finalPrice = newPrice || originalPrice;

    {
      const { error } = await supabase.from("bookings").update({
        contractor_id: contractorId,
        contractor_accepted_at: new Date().toISOString(),
        total_price: finalPrice,
        status: "confirmed" as any,
        notes: editNotes || booking.notes,
      }).eq("id", booking.id);

      if (error) {
        toast.error("Failed to accept booking");
      } else {
        await supabase.from("notifications").insert({
          user_id: booking.user_id,
          title: "✅ Booking Confirmed",
          message: `Your booking for ${format(new Date(booking.scheduled_date), "dd MMM yyyy")} has been confirmed.`,
          type: "booking_confirmed",
          booking_id: booking.id,
        });
        toast.success("Booking confirmed!");
        onUpdated();
        onOpenChange(false);
      }
    }

    setSaving(false);
  };

  const handleDeclineBooking = async () => {
    if (!booking) return;
    setSaving(true);
    const { error } = await supabase.from("bookings").update({
      status: "cancelled" as any,
    }).eq("id", booking.id);

    if (error) {
      toast.error("Failed to decline");
    } else {
      await supabase.from("notifications").insert({
        user_id: booking.user_id,
        title: "❌ Booking Declined",
        message: `Your booking request for ${format(new Date(booking.scheduled_date), "dd MMM yyyy")} was declined. Please try booking again with a different date or contractor.`,
        type: "booking_cancelled",
        booking_id: booking.id,
      });
      toast.success("Booking declined");
      onUpdated();
      onOpenChange(false);
    }
    setSaving(false);
  };

  const handleScheduleChange = () => {
    if (!booking || !editDate) return;
    const newDate = format(editDate, "yyyy-MM-dd");
    const dateChanged = newDate !== booking.scheduled_date;
    const timeChanged = editTimeSlot !== booking.time_slot;

    if (!dateChanged && !timeChanged) return;

    setPendingScheduleChange({ date: newDate, timeSlot: editTimeSlot });
    setScheduleChangeDialog(true);
  };

  const applyScheduleChange = async (notifyCustomer: boolean) => {
    if (!booking || !pendingScheduleChange) return;
    setScheduleChangeDialog(false);
    setSaving(true);

    const update: Record<string, any> = {
      scheduled_date: pendingScheduleChange.date,
      time_slot: pendingScheduleChange.timeSlot,
    };

    if (notifyCustomer) {
      // Move to pending so customer must re-confirm
      update.status = "pending";
      update.contractor_id = null;
      update.contractor_accepted_at = null;
    }

    const { error } = await supabase.from("bookings").update(update).eq("id", booking.id);

    if (error) {
      toast.error("Failed to update schedule");
    } else {
      const dateLabel = format(new Date(pendingScheduleChange.date), "dd MMM yyyy");
      const timeLabel = timeSlots[pendingScheduleChange.timeSlot] || pendingScheduleChange.timeSlot;
      
      await supabase.from("notifications").insert({
        user_id: booking.user_id,
        title: notifyCustomer ? "📅 Schedule Change — Confirmation Needed" : "📅 Schedule Updated",
        message: notifyCustomer
          ? `Your booking has been rescheduled to ${dateLabel}, ${timeLabel}. Please confirm the new schedule.`
          : `Your booking has been moved to ${dateLabel}, ${timeLabel}.`,
        type: "schedule_change",
        booking_id: booking.id,
      });

      toast.success(notifyCustomer ? "Schedule changed — customer must re-confirm" : "Schedule updated");
      onUpdated();
      onOpenChange(false);
    }
    setSaving(false);
    setPendingScheduleChange(null);
  };

  const handleSaveNotes = async () => {
    if (!booking) return;
    setSaving(true);
    const { error } = await supabase.from("bookings").update({ notes: editNotes }).eq("id", booking.id);
    if (error) toast.error("Failed to save notes");
    else toast.success("Notes saved");
    setSaving(false);
  };

  if (!bookingId) return null;

  const hasScheduleChanges = booking && editDate
    ? format(editDate, "yyyy-MM-dd") !== booking.scheduled_date || editTimeSlot !== booking.time_slot
    : false;

  const isPending = booking?.status === "pending";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="font-display">🌐 Platform Booking</DialogTitle>
              {booking && (
                <Badge variant={statusConfig[booking.status]?.variant || "secondary"}>
                  {statusConfig[booking.status]?.label || booking.status}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : booking ? (
            <div className="space-y-5">
              {/* Customer Info */}
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <User className="w-4 h-4" /> Customer
                </h4>
                <p className="text-sm font-medium">{customer?.full_name || "Customer"}</p>
                {customer?.phone && (
                  <a href={`tel:${customer.phone}`} className="text-sm text-primary hover:underline">
                    {customer.phone}
                  </a>
                )}
              </div>

              {/* Property Details */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Property
                </h4>
                {address ? (
                  <>
                    <p className="text-sm">
                      {address.street_address}<br />
                      {address.city}, {address.state} {address.postal_code}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Area:</span>{" "}
                        <span className="font-medium">{address.square_meters ? `${address.square_meters} m²` : "Not set"}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Slope:</span>{" "}
                        <span className="font-medium capitalize">{address.slope}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Verification:</span>{" "}
                        <Badge variant={address.status === "verified" ? "default" : "secondary"} className="text-[10px]">
                          {address.status}
                        </Badge>
                      </div>
                    </div>
                    {/* Lawn Image */}
                    {lawnImageUrl ? (
                      <div className="rounded-lg overflow-hidden border">
                        <img src={lawnImageUrl} alt="Lawn area" className="w-full h-40 object-cover" />
                      </div>
                    ) : (
                      <div className="rounded-lg border p-4 flex items-center gap-2 text-muted-foreground text-sm">
                        <ImageOff className="w-4 h-4" /> No lawn image available
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Address details unavailable</p>
                )}
              </div>

              {/* Job Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">Grass Length:</span>{" "}
                  <span className="font-medium capitalize">{booking.grass_length}</span>
                </div>
                <div className="text-sm flex items-center gap-1">
                  <span className="text-muted-foreground">Clippings:</span>{" "}
                  {booking.clippings_removal ? (
                    <span className="flex items-center gap-1 font-medium text-primary"><Check className="w-3 h-3" /> Yes</span>
                  ) : (
                    <span className="flex items-center gap-1 font-medium text-muted-foreground"><X className="w-3 h-3" /> No</span>
                  )}
                </div>
              </div>

              {/* Current Price */}
              {booking.total_price && (
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Customer's quoted price</span>
                    <span className="text-lg font-bold text-primary">${Number(booking.total_price).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Editable: Price */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Your Price
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="Enter your price"
                />
                {editPrice && booking.total_price && parseFloat(editPrice) > booking.total_price && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Higher than quoted — customer must re-confirm
                  </p>
                )}
                {editPrice && booking.total_price && parseFloat(editPrice) < booking.total_price && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Lower than quoted — will be auto-confirmed
                  </p>
                )}
              </div>

              {/* Editable: Schedule */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" /> Schedule
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
                    <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editDate ? format(editDate, "dd MMM yyyy") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={editDate}
                          onSelect={(d) => { setEditDate(d); setDatePopoverOpen(false); }}
                          disabled={{ before: new Date() }}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Time Slot</Label>
                    <Select value={editTimeSlot} onValueChange={setEditTimeSlot}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7am-10am">7:00 AM - 10:00 AM</SelectItem>
                        <SelectItem value="10am-2pm">10:00 AM - 2:00 PM</SelectItem>
                        <SelectItem value="2pm-5pm">2:00 PM - 5:00 PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {hasScheduleChanges && (
                  <Button variant="outline" size="sm" onClick={handleScheduleChange}>
                    Apply Schedule Change
                  </Button>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this job..."
                  rows={2}
                />
                {editNotes !== (booking.notes || "") && (
                  <Button variant="outline" size="sm" onClick={handleSaveNotes} disabled={saving}>
                    Save Notes
                  </Button>
                )}
              </div>

              {/* Booked at */}
              <p className="text-xs text-muted-foreground">
                Booked {format(new Date(booking.created_at), "dd MMM yyyy 'at' h:mm a")}
              </p>
            </div>
          ) : null}

          {/* Action Buttons */}
          {booking && isPending && (
            <DialogFooter className="flex gap-2 pt-4 border-t">
              <Button variant="destructive" onClick={handleDeclineBooking} disabled={saving}>
                <X className="w-4 h-4 mr-2" /> Decline
              </Button>
              <Button onClick={handleAcceptBooking} disabled={saving || !editPrice}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                {editPrice && booking.total_price && parseFloat(editPrice) > booking.total_price
                  ? "Submit Price for Approval"
                  : "Accept & Confirm"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule Change Confirmation */}
      <AlertDialog open={scheduleChangeDialog} onOpenChange={setScheduleChangeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule Change</AlertDialogTitle>
            <AlertDialogDescription>
              How would you like to apply this schedule change?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            {pendingScheduleChange && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p><strong>New date:</strong> {format(new Date(pendingScheduleChange.date), "dd MMM yyyy")}</p>
                <p><strong>New time:</strong> {timeSlots[pendingScheduleChange.timeSlot] || pendingScheduleChange.timeSlot}</p>
              </div>
            )}
          </div>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => applyScheduleChange(false)}>
              Change Without Notifying
            </Button>
            <Button onClick={() => applyScheduleChange(true)}>
              Notify & Require Confirmation
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PlatformBookingDetailDialog;
