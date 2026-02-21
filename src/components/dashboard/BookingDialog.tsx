import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Calculator, CreditCard, Ruler, Scissors, Clock, CalendarDays, MapPin, User, Plus, AlertTriangle, Info } from "lucide-react";
import PaymentDialog from "./PaymentDialog";
import AddAddressDialog from "./AddAddressDialog";
import type { Database } from "@/integrations/supabase/types";

type Address = Database["public"]["Tables"]["addresses"]["Row"];

interface Contractor {
  id: string;
  business_name: string | null;
  user_id: string;
  profile?: {
    full_name: string | null;
  };
}

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addresses: Address[];
  defaultAddressId?: string;
  onSuccess: () => void;
  onAddressAdded?: () => void;
  editingBooking?: Booking | null;
  contractorId?: string; // For contractor-specific pricing in portal context
}

interface PricingSettings {
  base_price_per_sqm: number;
  fixed_base_price: number;
  grass_length_short: number;
  grass_length_medium: number;
  grass_length_long: number;
  grass_length_very_long: number;
  clipping_removal_cost: number;
  saturday_surcharge: number;
  sunday_surcharge: number;
  public_holiday_surcharge: number;
  slope_mild_multiplier: number;
  slope_steep_multiplier: number;
  tier_multiplier: number;
}

interface QuoteBreakdown {
  basePrice: number;
  areaPrice: number;
  slopeMultiplier: number;
  tierMultiplier: number;
  grassLengthMultiplier: number;
  clippingsCost: number;
  daySurcharge: number;
  subtotal: number;
  total: number;
}

const GST_RATE = 0.10; // 10% GST

const grassLengthOptions = [
  { value: "short", label: "Short", description: "Below ankle - like a credit card thickness", icon: "💳" },
  { value: "medium", label: "Medium", description: "Ankle height - like a smartphone laying flat", icon: "📱" },
  { value: "long", label: "Long", description: "Shin height - like a water bottle", icon: "🍶" },
  { value: "very_long", label: "Very Long", description: "Knee height or above - like a ruler standing up", icon: "📏" },
];

const timeSlots = [
  { value: "7am-10am", label: "7:00 AM - 10:00 AM", description: "Early morning" },
  { value: "10am-2pm", label: "10:00 AM - 2:00 PM", description: "Late morning" },
  { value: "2pm-5pm", label: "2:00 PM - 5:00 PM", description: "Afternoon" },
];

const BookingDialog = ({ open, onOpenChange, addresses, defaultAddressId, onSuccess, onAddressAdded, editingBooking, contractorId: portalContractorId }: BookingDialogProps) => {
  const [step, setStep] = useState<"form" | "quote">("form");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [addAddressDialogOpen, setAddAddressDialogOpen] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isPreliminaryQuote, setIsPreliminaryQuote] = useState(false);
  
  // Form state
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [grassLength, setGrassLength] = useState("medium");
  const [clippingsRemoval, setClippingsRemoval] = useState(false);
  const [timeSlot, setTimeSlot] = useState("10am-2pm");
  const [selectSpecificContractor, setSelectSpecificContractor] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState<string>("");
  
  // Quote state
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);

  // Allow both verified and pending addresses for booking
  const bookableAddresses = addresses.filter(a => a.status === "verified" || a.status === "pending");
  const selectedAddress = bookableAddresses.find(a => a.id === selectedAddressId);
  const isUnverifiedAddress = selectedAddress?.status === "pending";

  const isEditMode = !!editingBooking;

  useEffect(() => {
    if (open) {
      fetchPricingSettings();
      setStep("form");
      setAgreedToTerms(false);
      setQuote(null);
      setIsPreliminaryQuote(false);
      
      if (editingBooking) {
        setSelectedAddressId(editingBooking.address_id);
        setSelectedDate(new Date(editingBooking.scheduled_date));
        setGrassLength(editingBooking.grass_length || "medium");
        setClippingsRemoval(editingBooking.clippings_removal || false);
        setTimeSlot(editingBooking.time_slot || "10am-2pm");
        setSelectSpecificContractor(!!editingBooking.preferred_contractor_id);
        setSelectedContractorId(editingBooking.preferred_contractor_id || "");
      } else {
        setSelectedDate(undefined);
        setGrassLength("medium");
        setClippingsRemoval(false);
        setTimeSlot("10am-2pm");
        setSelectSpecificContractor(false);
        setSelectedContractorId("");
        
        if (defaultAddressId && bookableAddresses.some(a => a.id === defaultAddressId)) {
          setSelectedAddressId(defaultAddressId);
        } else if (bookableAddresses.length === 1) {
          setSelectedAddressId(bookableAddresses[0].id);
        } else {
          setSelectedAddressId("");
        }
      }
    }
  }, [open, defaultAddressId, addresses, editingBooking]);

  useEffect(() => {
    if (selectedAddress && selectSpecificContractor) {
      fetchContractorsForAddress();
    }
  }, [selectedAddress, selectSpecificContractor]);

  const fetchPricingSettings = async () => {
    setPricingSettings({
      base_price_per_sqm: 0,
      fixed_base_price: 0,
      grass_length_short: 1,
      grass_length_medium: 1,
      grass_length_long: 1,
      grass_length_very_long: 1,
      clipping_removal_cost: 0,
      saturday_surcharge: 1,
      sunday_surcharge: 1,
      public_holiday_surcharge: 1,
      slope_mild_multiplier: 1,
      slope_steep_multiplier: 1,
      tier_multiplier: 0,
    });
  };

  const fetchContractorsForAddress = async () => {
    if (!selectedAddress) return;
    
    const { data: contractorsData } = await supabase
      .from("contractors")
      .select("id, business_name, user_id, service_areas")
      .eq("is_active", true)
      .eq("approval_status", "approved");

    if (contractorsData) {
      const filteredContractors = contractorsData.filter(c => 
        c.service_areas.length === 0 ||
        c.service_areas.some((area: string) => 
          area.toLowerCase().includes(selectedAddress.city.toLowerCase()) ||
          area.toLowerCase().includes(selectedAddress.state.toLowerCase()) ||
          selectedAddress.city.toLowerCase().includes(area.toLowerCase()) ||
          selectedAddress.state.toLowerCase().includes(area.toLowerCase()) ||
          area.toLowerCase() === "all"
        )
      );

      const userIds = filteredContractors.map(c => c.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      setContractors(filteredContractors.map(c => ({
        ...c,
        profile: profileMap.get(c.user_id)
      })));
    }
  };

  const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const handleGetQuote = async () => {
    if (!selectedAddressId) {
      toast.error("Please select an address");
      return;
    }
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("calculate-quote", {
        body: {
          addressId: selectedAddressId,
          selectedDate: selectedDate.toISOString(),
          grassLength,
          clippingsRemoval,
          contractorId: portalContractorId || (selectSpecificContractor && selectedContractorId ? selectedContractorId : undefined),
        },
      });

      if (error || !data?.quote) {
        throw new Error(error?.message || "Failed to calculate quote");
      }

      setQuote(data.quote);
      setIsPreliminaryQuote(data.isPreliminary === true);
      setStep("quote");
    } catch (error) {
      console.error("Quote error:", error);
      toast.error("Failed to calculate quote. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const sendBookingEmail = async (bookingId: string, emailType: "created" | "confirmed" | "updated" | "cancelled") => {
    try {
      const { error } = await supabase.functions.invoke("send-booking-email", {
        body: { bookingId, emailType },
      });
      if (error) {
        console.error("Failed to send email:", error);
      }
    } catch (err) {
      console.error("Email notification error:", err);
    }
  };

  const handleBookNow = async () => {
    if (!selectedDate || !quote || !selectedAddress) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (isEditMode && editingBooking) {
        const { error } = await supabase
          .from("bookings")
          .update({
            address_id: selectedAddress.id,
            scheduled_date: selectedDate.toISOString().split("T")[0],
            scheduled_time: timeSlot,
            grass_length: grassLength,
            clippings_removal: clippingsRemoval,
            time_slot: timeSlot,
            is_weekend: isWeekend(selectedDate),
            total_price: totalWithGst,
            quote_breakdown: JSON.parse(JSON.stringify(quote)),
            preferred_contractor_id: portalContractorId || (selectSpecificContractor && selectedContractorId ? selectedContractorId : null),
          })
          .eq("id", editingBooking.id);

        if (error) throw error;

        sendBookingEmail(editingBooking.id, "updated");
        toast.success("Booking updated successfully!");
        onSuccess();
        onOpenChange(false);
      } else if (isUnverifiedAddress) {
        // For unverified addresses: create booking with pending_address_verification status, NO payment yet
        const { data, error } = await supabase.from("bookings").insert([{
          user_id: user.id,
          address_id: selectedAddress.id,
          scheduled_date: selectedDate.toISOString().split("T")[0],
          scheduled_time: timeSlot,
          grass_length: grassLength,
          clippings_removal: clippingsRemoval,
          time_slot: timeSlot,
          is_weekend: isWeekend(selectedDate),
          is_public_holiday: false,
          total_price: totalWithGst,
          quote_breakdown: JSON.parse(JSON.stringify(quote)),
          status: "pending_address_verification" as any,
          payment_status: "unpaid",
          preferred_contractor_id: portalContractorId || (selectSpecificContractor && selectedContractorId ? selectedContractorId : null),
        }]).select().single();

        if (error) throw error;

        // Send booking created email
        sendBookingEmail(data.id, "created");

        toast.success("Booking request submitted!", {
          description: "Your address is being verified. We'll notify you once confirmed.",
        });
        onSuccess();
        onOpenChange(false);
      } else {
        // Verified address: existing payment flow
        const { data, error } = await supabase.from("bookings").insert([{
          user_id: user.id,
          address_id: selectedAddress.id,
          scheduled_date: selectedDate.toISOString().split("T")[0],
          scheduled_time: timeSlot,
          grass_length: grassLength,
          clippings_removal: clippingsRemoval,
          time_slot: timeSlot,
          is_weekend: isWeekend(selectedDate),
          is_public_holiday: false,
          total_price: totalWithGst,
          quote_breakdown: JSON.parse(JSON.stringify(quote)),
          status: "pending" as const,
          payment_status: "pending",
          preferred_contractor_id: portalContractorId || (selectSpecificContractor && selectedContractorId ? selectedContractorId : null),
        }]).select().single();

        if (error) throw error;

        setCreatedBookingId(data.id);
        
        const { data: paymentData, error: paymentError } = await supabase.functions.invoke(
          "save-payment-method",
          {
            body: { bookingId: data.id },
          }
        );

        if (paymentError || !paymentData?.clientSecret) {
          throw new Error(paymentError?.message || "Failed to set up payment");
        }

        setClientSecret(paymentData.clientSecret);
        onOpenChange(false);
        setPaymentDialogOpen(true);
      }
    } catch (error) {
      console.error("Booking error:", error);
      toast.error(isEditMode ? "Failed to update booking" : "Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentMethodId: string) => {
    if (!createdBookingId) return;

    await supabase
      .from("bookings")
      .update({ 
        payment_method_id: paymentMethodId,
        payment_status: "pending",
      })
      .eq("id", createdBookingId);

    sendBookingEmail(createdBookingId, "created");

    setPaymentDialogOpen(false);
    toast.success("Booking submitted! You'll be charged when a contractor accepts your job.");
    onSuccess();
    onOpenChange(false);
  };

  const handlePaymentDialogClose = async (open: boolean) => {
    if (!open && createdBookingId) {
      try {
        const { data: booking } = await supabase
          .from("bookings")
          .select("payment_status, payment_method_id")
          .eq("id", createdBookingId)
          .single();

        if (booking && !booking.payment_method_id) {
          await supabase
            .from("bookings")
            .delete()
            .eq("id", createdBookingId);
          
          toast.info("Booking cancelled - payment method was not saved");
        }
      } catch (error) {
        console.error("Error cleaning up booking:", error);
      }
      
      setCreatedBookingId(null);
      setClientSecret(null);
    }
    setPaymentDialogOpen(open);
  };

  const handleAddAddressSuccess = () => {
    setAddAddressDialogOpen(false);
    onAddressAdded?.();
  };

  const getContractorName = (contractor: Contractor) => {
    return contractor.business_name || contractor.profile?.full_name || "Contractor";
  };

  const disabledDays = { before: new Date() };

  // Calculate GST
  const gstAmount = quote ? quote.total * GST_RATE : 0;
  const totalWithGst = quote ? quote.total + gstAmount : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {step === "form" && (isEditMode ? "Edit Booking" : "Book Lawn Service")}
              {step === "quote" && (isEditMode ? "Updated Quote" : "Your Quote")}
            </DialogTitle>
          </DialogHeader>

          {step === "form" && (
            <div className="space-y-6">
              {/* Address Selection */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Select Address
                </Label>
                {bookableAddresses.length === 0 ? (
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-3">No addresses available</p>
                    <Button size="sm" variant="outline" onClick={() => setAddAddressDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Address
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Select value={selectedAddressId} onValueChange={setSelectedAddressId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an address" />
                      </SelectTrigger>
                      <SelectContent>
                        {bookableAddresses.map((addr) => (
                          <SelectItem key={addr.id} value={addr.id}>
                            {addr.street_address}, {addr.city} • {addr.square_meters ? `${addr.square_meters}m²` : "Area pending"}
                            {addr.status === "pending" && " (Unverified)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setAddAddressDialogOpen(true)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add new address
                    </Button>
                  </div>
                )}

                {/* Unverified address notice */}
                {isUnverifiedAddress && (
                  <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
                    <div className="flex gap-2">
                      <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-amber-800 dark:text-amber-300">
                        <p className="font-medium mb-1">Address Pending Verification</p>
                        <p>Your address will be verified by our team within 24 hours. Pricing may be adjusted based on the verified lawn size. You will be notified if any changes are required.</p>
                        <p className="mt-1 font-medium">No payment will be taken until verification is complete.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {selectedAddress && (
                <>
                  {/* Date Selection */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4" />
                      Select Date
                    </Label>
                    <div className="flex justify-center">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={disabledDays}
                        className="rounded-md border"
                      />
                    </div>
                    {selectedDate && isWeekend(selectedDate) && (
                      <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                        ⚠️ Weekend bookings attract a surcharge
                      </p>
                    )}
                  </div>

                  {/* Time Slot */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Preferred Time Slot
                    </Label>
                    <RadioGroup value={timeSlot} onValueChange={setTimeSlot} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {timeSlots.map((slot) => (
                        <label
                          key={slot.value}
                          className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            timeSlot === slot.value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <RadioGroupItem value={slot.value} className="sr-only" />
                          <span className="font-medium text-sm">{slot.label}</span>
                          <span className="text-xs text-muted-foreground">{slot.description}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Grass Length */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Ruler className="w-4 h-4" />
                      Current Grass Length
                    </Label>
                    <RadioGroup value={grassLength} onValueChange={setGrassLength} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {grassLengthOptions.map((option) => (
                        <label
                          key={option.value}
                          className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            grassLength === option.value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <RadioGroupItem value={option.value} className="sr-only" />
                          <span className="text-2xl">{option.icon}</span>
                          <div>
                            <span className="font-medium block">{option.label}</span>
                            <span className="text-xs text-muted-foreground">{option.description}</span>
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Clippings Removal */}
                  <div className="flex items-center justify-between p-4 rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <Scissors className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <Label className="font-medium">Remove Grass Clippings</Label>
                        <p className="text-xs text-muted-foreground">
                          Clippings will be bagged and removed from your property
                        </p>
                      </div>
                    </div>
                    <Switch checked={clippingsRemoval} onCheckedChange={setClippingsRemoval} />
                  </div>

                  {/* Specific Contractor Selection - only for verified addresses */}
                  {!isUnverifiedAddress && (
                    <div className="space-y-3 p-4 rounded-xl border border-border">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="specific-contractor"
                          checked={selectSpecificContractor}
                          onCheckedChange={(checked) => {
                            setSelectSpecificContractor(checked === true);
                            if (!checked) setSelectedContractorId("");
                          }}
                        />
                        <label
                          htmlFor="specific-contractor"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Request a specific contractor
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        By default, any available contractor in your area can accept this job.
                      </p>
                      
                      {selectSpecificContractor && (
                        <div className="pt-2">
                          {contractors.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No contractors available in your area</p>
                          ) : (
                            <Select value={selectedContractorId} onValueChange={setSelectedContractorId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a contractor" />
                              </SelectTrigger>
                              <SelectContent>
                                {contractors.map((contractor) => (
                                  <SelectItem key={contractor.id} value={contractor.id}>
                                    <div className="flex items-center gap-2">
                                      <User className="w-4 h-4" />
                                      {getContractorName(contractor)}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <Button 
                className="w-full" 
                size="lg" 
                onClick={handleGetQuote}
                disabled={!selectedAddressId || !selectedDate || loading || (selectedAddress && !selectedAddress.square_meters)}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Calculator className="w-4 h-4 mr-2" />
                )}
                {isUnverifiedAddress ? "Get Preliminary Quote" : "Get Instant Quote"}
              </Button>
            </div>
          )}

          {step === "quote" && quote && selectedAddress && (
            <div className="space-y-6">
              {/* Preliminary quote notice */}
              {isPreliminaryQuote && (
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
                  <div className="flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800 dark:text-amber-300">
                      <p className="font-medium">Preliminary Quote</p>
                      <p>This quote is based on your self-reported lawn size. The final price may change after our team verifies your address. You'll be notified of any price changes before being charged.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Simple Quote Summary */}
              <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                <p><strong>Date:</strong> {selectedDate?.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                <p><strong>Time:</strong> {timeSlots.find(s => s.value === timeSlot)?.label}</p>
                <p><strong>Address:</strong> {selectedAddress.street_address}, {selectedAddress.city}</p>
                {selectSpecificContractor && selectedContractorId && (
                  <p><strong>Requested Contractor:</strong> {getContractorName(contractors.find(c => c.id === selectedContractorId)!)}</p>
                )}
              </div>

              {/* Quote with GST */}
              <div className="space-y-3 border rounded-xl p-4">
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Subtotal (ex GST)</span>
                  <span>${quote.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">GST (10%)</span>
                  <span>${gstAmount.toFixed(2)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-bold text-lg">
                  <span>Total (inc GST){isPreliminaryQuote ? " *" : ""}</span>
                  <span className="text-primary">${totalWithGst.toFixed(2)}</span>
                </div>
                {isPreliminaryQuote && (
                  <p className="text-xs text-muted-foreground">* Subject to change after address verification</p>
                )}
              </div>

              {/* Terms & Conditions Agreement */}
              {!isEditMode && (
                <div className="flex items-start space-x-3 p-4 rounded-lg border border-border">
                  <Checkbox
                    id="agree-terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="agree-terms" className="text-sm leading-relaxed cursor-pointer">
                    I have read and agree to the{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                      Terms &amp; Conditions
                    </a>{" "}
                    and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                      Privacy Policy
                    </a>
                  </label>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>
                  Modify Details
                </Button>
                <Button className="flex-1" size="lg" onClick={handleBookNow} disabled={loading || (!isEditMode && !agreedToTerms)}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : isUnverifiedAddress ? (
                    <CalendarDays className="w-4 h-4 mr-2" />
                  ) : (
                    <CreditCard className="w-4 h-4 mr-2" />
                  )}
                  {isEditMode ? "Update Booking" : isUnverifiedAddress ? "Submit Booking Request" : "Book Now"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>

      </Dialog>

      {/* Payment Dialog - rendered outside BookingDialog to avoid nested dialog focus trap issues */}
      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={handlePaymentDialogClose}
        amount={totalWithGst}
        onPaymentSuccess={handlePaymentSuccess}
        clientSecret={clientSecret}
        bookingDetails={{
          date: selectedDate?.toLocaleDateString("en-AU", { weekday: "long", month: "long", day: "numeric" }) || "",
          timeSlot: timeSlots.find(s => s.value === timeSlot)?.label || timeSlot,
          address: selectedAddress ? `${selectedAddress.street_address}, ${selectedAddress.city}` : "",
        }}
      />

      {/* Add Address Dialog */}
      <AddAddressDialog
        open={addAddressDialogOpen}
        onOpenChange={setAddAddressDialogOpen}
        onSuccess={handleAddAddressSuccess}
      />
    </>
  );
};

export default BookingDialog;
