import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, MapPin, FileQuestion } from "lucide-react";
import { toast } from "sonner";
import LawnDrawingMap, { type LawnDrawingMapRef } from "@/components/dashboard/LawnDrawingMap";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";

interface PublicBookingFormProps {
  contractorSlug: string;
  contractorName: string;
  onClose: () => void;
}

interface ServiceOption {
  name: string;
  requires_quote: boolean;
  category: string;
}

const FALLBACK_SERVICES: ServiceOption[] = [
  { name: "Lawn Mowing", requires_quote: false, category: "lawn" },
  { name: "Edging & Trimming", requires_quote: false, category: "lawn" },
  { name: "Hedge Trimming", requires_quote: true, category: "garden" },
  { name: "Garden Cleanup", requires_quote: true, category: "garden" },
  { name: "Full Service", requires_quote: false, category: "lawn" },
  { name: "Other", requires_quote: true, category: "other" },
];

const useContractorServices = (contractorSlug: string) => {
  const [services, setServices] = useState<ServiceOption[]>(FALLBACK_SERVICES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-booking`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ contractor_slug: contractorSlug, action: "get_services" }),
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          if (data.services?.length > 0) {
            setServices(data.services);
          }
        }
      } catch {
        // Use fallback
      }
      setLoaded(true);
    };
    load();
  }, [contractorSlug]);

  return { services, loaded };
};

const BookingFormContent = ({ contractorSlug, contractorName, onClose }: PublicBookingFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const lawnMapRef = useRef<LawnDrawingMapRef>(null);
  const { services } = useContractorServices(contractorSlug);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isQuoteRequest, setIsQuoteRequest] = useState(false);
  const [showLawnDrawing, setShowLawnDrawing] = useState(false);
  const [lawnArea, setLawnArea] = useState(0);
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    service_type: "Lawn Mowing",
    address: "",
    preferred_date: "",
    preferred_time: "",
    notes: "",
  });

  // Check if selected service requires quote
  useEffect(() => {
    const selected = services.find(s => s.name === form.service_type);
    setIsQuoteRequest(selected?.requires_quote ?? false);
  }, [form.service_type, services]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name || !form.customer_email || !form.preferred_date) {
      toast.error("Please fill in all required fields");
      return;
    }

    // For quote requests, skip Stripe
    if (isQuoteRequest) {
      setIsSubmitting(true);
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-booking`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              contractor_slug: contractorSlug,
              ...form,
              requires_quote: true,
              lawn_area_sqm: lawnArea > 0 ? lawnArea : undefined,
            }),
          }
        );
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || "Request failed");
        }
        setIsSuccess(true);
      } catch (err: any) {
        toast.error(err.message || "Failed to submit request");
      }
      setIsSubmitting(false);
      return;
    }

    if (!stripe || !elements) {
      toast.error("Payment system not ready. Please wait a moment.");
      return;
    }

    setIsSubmitting(true);
    try {
      const setupResp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-booking`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            contractor_slug: contractorSlug,
            ...form,
            lawn_area_sqm: lawnArea > 0 ? lawnArea : undefined,
          }),
        }
      );

      if (!setupResp.ok) {
        const err = await setupResp.json();
        throw new Error(err.error || "Booking failed");
      }

      const result = await setupResp.json();

      if (result.setupIntentClientSecret) {
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) throw new Error("Card element not found");

        const { error: stripeError } = await stripe.confirmCardSetup(result.setupIntentClientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: form.customer_name,
              email: form.customer_email,
            },
          },
        });

        if (stripeError) throw new Error(stripeError.message);
      }

      setIsSuccess(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit booking");
    }
    setIsSubmitting(false);
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto mb-4" />
            <h3 className="font-display text-xl font-bold text-foreground mb-2">
              {isQuoteRequest ? "Quote Request Submitted!" : "Booking Submitted!"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {isQuoteRequest
                ? `${contractorName} will review your request and send you a quote.`
                : `${contractorName} will review your request and get back to you shortly.`}
            </p>
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">
                {isQuoteRequest ? "Request a Quote" : "Book a Service"}
              </DialogTitle>
              <DialogDescription>
                {isQuoteRequest
                  ? `Describe what you need and ${contractorName} will send you a personalised quote.`
                  : `Fill out the form below and ${contractorName} will confirm your booking.`}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    placeholder="John Smith"
                    required
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={form.customer_email}
                    onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                    placeholder="john@example.com"
                    required
                    maxLength={255}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={form.customer_phone}
                    onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                    placeholder="0400 000 000"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Service *</Label>
                  <Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {services.map(s => (
                        <SelectItem key={s.name} value={s.name}>
                          <span className="flex items-center gap-2">
                            {s.name}
                            {s.requires_quote && <span className="text-[10px] text-muted-foreground">(Quote)</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isQuoteRequest && (
                <div className="bg-accent/50 border border-accent rounded-lg p-3 flex items-start gap-3">
                  <FileQuestion className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Quote Required</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      This service requires a custom quote. {contractorName} will review your request and send you a price. No payment is needed now.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St, Suburb"
                  maxLength={200}
                />
              </div>

              {/* Optional Lawn Drawing - only for lawn services */}
              {form.address && !isQuoteRequest && (
                <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      <Label htmlFor="lawn-toggle" className="text-sm cursor-pointer">Draw lawn area for accurate quote</Label>
                    </div>
                    <Switch id="lawn-toggle" checked={showLawnDrawing} onCheckedChange={setShowLawnDrawing} />
                  </div>
                  {showLawnDrawing && (
                    <LawnDrawingMap
                      ref={lawnMapRef}
                      address={form.address}
                      onAreaCalculated={setLawnArea}
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Preferred Date *</Label>
                  <Input
                    type="date"
                    value={form.preferred_date}
                    onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                    min={minDate}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preferred Time</Label>
                  <Select value={form.preferred_time} onValueChange={(v) => setForm({ ...form, preferred_time: v })}>
                    <SelectTrigger><SelectValue placeholder="Any time" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning (8am–12pm)</SelectItem>
                      <SelectItem value="afternoon">Afternoon (12pm–4pm)</SelectItem>
                      <SelectItem value="anytime">Any time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <input
                  type="checkbox"
                  id="time-flexible"
                  className="h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                  onChange={(e) => setForm({ ...form, notes: e.target.checked ? (form.notes ? form.notes + "\n[TIME_FLEXIBLE]" : "[TIME_FLEXIBLE]") : form.notes.replace(/\n?\[TIME_FLEXIBLE\]/, "") })}
                />
                <Label htmlFor="time-flexible" className="text-sm cursor-pointer">
                  I'm flexible with the exact time of my booking
                </Label>
              </div>
              <div className="space-y-2">
                <Label>{isQuoteRequest ? "Describe what you need *" : "Notes"}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={isQuoteRequest
                    ? "Please describe the work needed, approximate area, access details, etc."
                    : "Any special instructions or details..."}
                  rows={isQuoteRequest ? 4 : 3}
                  maxLength={500}
                  required={isQuoteRequest}
                />
              </div>

              {/* Stripe Card Element - only for non-quote bookings */}
              {!isQuoteRequest && (
                <div className="space-y-2">
                  <Label>Payment Method *</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Your card will be saved securely. You'll only be charged after the job is completed.
                  </p>
                  <div className="p-3 border border-border rounded-lg bg-card">
                    <CardElement
                      options={{
                        style: {
                          base: {
                            fontSize: "14px",
                            color: "hsl(var(--foreground))",
                            "::placeholder": { color: "hsl(var(--muted-foreground))" },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting || (!isQuoteRequest && !stripe)}>
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isQuoteRequest ? "Request Quote" : "Submit Booking Request"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const PublicBookingForm = (props: PublicBookingFormProps) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return <BookingFormFallback {...props} />;
  }

  return (
    <Elements stripe={stripeInstance}>
      <BookingFormContent {...props} />
    </Elements>
  );
};

// Fallback form without Stripe
const BookingFormFallback = ({ contractorSlug, contractorName, onClose }: PublicBookingFormProps) => {
  const lawnMapRef = useRef<LawnDrawingMapRef>(null);
  const { services } = useContractorServices(contractorSlug);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isQuoteRequest, setIsQuoteRequest] = useState(false);
  const [showLawnDrawing, setShowLawnDrawing] = useState(false);
  const [lawnArea, setLawnArea] = useState(0);
  const [form, setForm] = useState({
    customer_name: "", customer_email: "", customer_phone: "",
    service_type: "Lawn Mowing", address: "", preferred_date: "",
    preferred_time: "", notes: "",
  });

  useEffect(() => {
    const selected = services.find(s => s.name === form.service_type);
    setIsQuoteRequest(selected?.requires_quote ?? false);
  }, [form.service_type, services]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name || !form.customer_email || !form.preferred_date) {
      toast.error("Please fill in all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-booking`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            contractor_slug: contractorSlug,
            ...form,
            requires_quote: isQuoteRequest,
            lawn_area_sqm: lawnArea > 0 ? lawnArea : undefined,
          }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Request failed");
      }
      setIsSuccess(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request");
    }
    setIsSubmitting(false);
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto mb-4" />
            <h3 className="font-display text-xl font-bold text-foreground mb-2">
              {isQuoteRequest ? "Quote Request Submitted!" : "Booking Submitted!"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {isQuoteRequest
                ? `${contractorName} will review your request and send you a quote.`
                : `${contractorName} will review your request and get back to you shortly.`}
            </p>
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">
                {isQuoteRequest ? "Request a Quote" : "Book a Service"}
              </DialogTitle>
              <DialogDescription>
                {isQuoteRequest
                  ? `Describe what you need and ${contractorName} will send you a personalised quote.`
                  : `Fill out the form below and ${contractorName} will confirm your booking.`}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="John Smith" required maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} placeholder="john@example.com" required maxLength={255} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} placeholder="0400 000 000" maxLength={20} />
                </div>
                <div className="space-y-2">
                  <Label>Service *</Label>
                  <Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {services.map(s => (
                        <SelectItem key={s.name} value={s.name}>
                          <span className="flex items-center gap-2">
                            {s.name}
                            {s.requires_quote && <span className="text-[10px] text-muted-foreground">(Quote)</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isQuoteRequest && (
                <div className="bg-accent/50 border border-accent rounded-lg p-3 flex items-start gap-3">
                  <FileQuestion className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Quote Required</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      This service requires a custom quote. No payment is needed now.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, Suburb" maxLength={200} />
              </div>
              {form.address && !isQuoteRequest && (
                <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      <Label htmlFor="lawn-toggle-fb" className="text-sm cursor-pointer">Draw lawn area for accurate quote</Label>
                    </div>
                    <Switch id="lawn-toggle-fb" checked={showLawnDrawing} onCheckedChange={setShowLawnDrawing} />
                  </div>
                  {showLawnDrawing && (
                    <LawnDrawingMap ref={lawnMapRef} address={form.address} onAreaCalculated={setLawnArea} />
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Preferred Date *</Label>
                  <Input type="date" value={form.preferred_date} onChange={(e) => setForm({ ...form, preferred_date: e.target.value })} min={minDate} required />
                </div>
                <div className="space-y-2">
                  <Label>Preferred Time</Label>
                  <Select value={form.preferred_time} onValueChange={(v) => setForm({ ...form, preferred_time: v })}>
                    <SelectTrigger><SelectValue placeholder="Any time" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning (8am–12pm)</SelectItem>
                      <SelectItem value="afternoon">Afternoon (12pm–4pm)</SelectItem>
                      <SelectItem value="anytime">Any time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <input
                  type="checkbox"
                  id="time-flexible-fb"
                  className="h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                  onChange={(e) => setForm({ ...form, notes: e.target.checked ? (form.notes ? form.notes + "\n[TIME_FLEXIBLE]" : "[TIME_FLEXIBLE]") : form.notes.replace(/\n?\[TIME_FLEXIBLE\]/, "") })}
                />
                <Label htmlFor="time-flexible-fb" className="text-sm cursor-pointer">
                  I'm flexible with the exact time of my booking
                </Label>
              </div>
              <div className="space-y-2">
                <Label>{isQuoteRequest ? "Describe what you need *" : "Notes"}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={isQuoteRequest
                    ? "Please describe the work needed, approximate area, access details, etc."
                    : "Any special instructions or details..."}
                  rows={isQuoteRequest ? 4 : 3}
                  maxLength={500}
                  required={isQuoteRequest}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isQuoteRequest ? "Request Quote" : "Submit Booking Request"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PublicBookingForm;
