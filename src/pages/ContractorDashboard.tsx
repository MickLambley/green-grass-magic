import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays } from "date-fns";

import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Leaf,
  LogOut,
  Calendar as CalendarIcon,
  MapPin,
  Clock,
  DollarSign,
  Check,
  X,
  CalendarClock,
  Briefcase,
  AlertCircle,
  Clock as ClockIcon2,
  Star,
  Loader2,
  CreditCard,
  CheckCircle,
  Shield,
  Upload,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import JobDetailsDialog from "@/components/contractor/JobDetailsDialog";
import ContractorTierBadge from "@/components/contractor/ContractorTierBadge";
import ContractorRatingsSection from "@/components/contractor/ContractorRatingsSection";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Address = Database["public"]["Tables"]["addresses"]["Row"];
type Contractor = Database["public"]["Tables"]["contractors"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface BookingWithAddress extends Omit<Booking, 'admin_notes' | 'payment_intent_id' | 'payment_status' | 'payment_method_id' | 'charged_at' | 'payout_status' | 'payout_released_at' | 'completed_at' | 'stripe_payout_id' | 'customer_rating' | 'rating_comment' | 'rating_submitted_at' | 'contractor_rating_response' | 'contractor_issues' | 'contractor_issue_notes' | 'contractor_issue_photos' | 'original_price' | 'price_change_notified_at'> {
  admin_notes?: string | null;
  payment_intent_id?: string | null;
  payment_status?: string;
  payment_method_id?: string | null;
  charged_at?: string | null;
  payout_status?: string;
  payout_released_at?: string | null;
  completed_at?: string | null;
  stripe_payout_id?: string | null;
  customer_rating?: number | null;
  rating_comment?: string | null;
  rating_submitted_at?: string | null;
  contractor_rating_response?: string | null;
  contractor_issues?: any | null;
  contractor_issue_notes?: string | null;
  contractor_issue_photos?: string[] | null;
  original_price?: number | null;
  price_change_notified_at?: string | null;
  address?: Address;
  customerProfile?: Profile;
}

const InsuranceUploadForm = ({ contractorId, userId, onUpload, isUploading, setIsUploading, expiryInput, setExpiryInput, compact }: {
  contractorId: string; userId: string; onUpload: () => void;
  isUploading: boolean; setIsUploading: (v: boolean) => void;
  expiryInput: string; setExpiryInput: (v: string) => void;
  compact?: boolean;
}) => {
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) { toast.error("Please upload a PDF or image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10MB"); return; }
    if (!expiryInput) { toast.error("Please enter the new expiry date first"); return; }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/insurance-certificate.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("contractor-documents").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("contractors").update({
        insurance_certificate_url: fileName,
        insurance_expiry_date: expiryInput,
        insurance_uploaded_at: new Date().toISOString(),
        insurance_verified: false,
      }).eq("id", contractorId);
      if (error) throw error;

      toast.success("Insurance certificate updated! It will be reviewed by our team.");
      setExpiryInput("");
      onUpload();
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload certificate");
    } finally {
      setIsUploading(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input type="date" value={expiryInput} onChange={(e) => setExpiryInput(e.target.value)} min={new Date().toISOString().split("T")[0]} className="text-xs border rounded px-2 py-1 bg-background" />
        <Button variant="outline" size="sm" disabled={isUploading} asChild>
          <label className="cursor-pointer gap-1">
            {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {isUploading ? "Uploading..." : "Update"}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleUpload} disabled={isUploading} />
          </label>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground whitespace-nowrap">New Expiry:</label>
        <input type="date" value={expiryInput} onChange={(e) => setExpiryInput(e.target.value)} min={new Date().toISOString().split("T")[0]} className="text-sm border rounded px-2 py-1 bg-background" />
      </div>
      <Button variant="outline" size="sm" disabled={isUploading} asChild>
        <label className="cursor-pointer gap-2">
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isUploading ? "Uploading..." : "Upload Renewed Certificate"}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleUpload} disabled={isUploading} />
        </label>
      </Button>
    </div>
  );
};

const timeSlots = [
  { value: "7am-10am", label: "7:00 AM - 10:00 AM" },
  { value: "10am-2pm", label: "10:00 AM - 2:00 PM" },
  { value: "2pm-5pm", label: "2:00 PM - 5:00 PM" },
];

const ContractorDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableJobs, setAvailableJobs] = useState<BookingWithAddress[]>([]);
  const [myJobs, setMyJobs] = useState<BookingWithAddress[]>([]);
  const [selectedJob, setSelectedJob] = useState<BookingWithAddress | null>(null);
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
  const [jobDetailsDialogOpen, setJobDetailsDialogOpen] = useState(false);
  const [viewingJob, setViewingJob] = useState<BookingWithAddress | null>(null);
  const [suggestedDate, setSuggestedDate] = useState<Date | undefined>(undefined);
  const [suggestedTimeSlot, setSuggestedTimeSlot] = useState("10am-2pm");
  const [insuranceUploading, setInsuranceUploading] = useState(false);
  const [insuranceExpiryInput, setInsuranceExpiryInput] = useState("");
  const [stripeStatus, setStripeStatus] = useState<{
    onboarding_complete: boolean;
    payouts_enabled: boolean;
    loading: boolean;
  }>({ onboarding_complete: false, payouts_enabled: false, loading: true });
  const [stripeSetupLoading, setStripeSetupLoading] = useState(false);

  useEffect(() => {
    checkContractorAccess();
  }, []);

  const checkContractorAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    setUser(user);

    // Check if user has contractor role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "contractor");

    if (!roles || roles.length === 0) {
      toast.error("You don't have contractor access");
      navigate("/auth");
      return;
    }

    // Check if user has a contractor profile
    const { data: contractorData } = await supabase
      .from("contractors")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!contractorData) {
      toast.error("Contractor profile not found");
      navigate("/contractor-auth");
      return;
    }

    // Check if onboarding is complete
    if (!contractorData.abn) {
      navigate("/contractor-onboarding");
      return;
    }

    setContractor(contractorData);
    setIsLoading(false);
    
    // Only fetch jobs if approved
    if (contractorData.approval_status === "approved") {
      fetchJobs(contractorData);
      fetchStripeStatus();
    }
  };

  const fetchStripeStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "status" },
      });
      if (!error && data) {
        setStripeStatus({
          onboarding_complete: data.onboarding_complete ?? false,
          payouts_enabled: data.payouts_enabled ?? false,
          loading: false,
        });
      } else {
        setStripeStatus(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setStripeStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const handleCompleteStripeSetup = async () => {
    setStripeSetupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "create_account_link" },
      });
      if (error || !data?.url) {
        toast.error("Failed to create setup link");
        return;
      }
      window.open(data.url, "_blank");
    } catch {
      toast.error("Failed to start Stripe setup");
    } finally {
      setStripeSetupLoading(false);
    }
  };

  const fetchJobs = async (contractorData: Contractor) => {
    // Fetch available jobs (pending, paid, not assigned)
    const { data: availableData } = await supabase
      .from("bookings")
      .select("id, address_id, user_id, scheduled_date, scheduled_time, time_slot, status, total_price, notes, created_at, updated_at, clippings_removal, is_weekend, is_public_holiday, grass_length, contractor_id, contractor_accepted_at, preferred_contractor_id, alternative_date, alternative_time_slot, alternative_suggested_at, alternative_suggested_by, quote_breakdown, payment_status, payment_method_id")
      .eq("status", "pending")
      .eq("payment_status", "pending")
      .not("payment_method_id", "is", null)
      .is("contractor_id", null)
      .order("scheduled_date", { ascending: true });

    // Fetch addresses for available jobs
    if (availableData && availableData.length > 0) {
      const addressIds = availableData.map(b => b.address_id);
      const { data: addressData } = await supabase
        .from("addresses")
        .select("*")
        .in("id", addressIds);

      const addressMap = new Map(addressData?.map(a => [a.id, a]) || []);
      
      // Filter by service areas
      const jobsInArea = availableData
        .map(b => ({ ...b, address: addressMap.get(b.address_id) }))
        .filter(b => {
          if (!b.address || contractorData.service_areas.length === 0) return true;
          return contractorData.service_areas.some(
            area => b.address?.city.toLowerCase().includes(area.toLowerCase()) ||
                    b.address?.postal_code.includes(area)
          );
        });

      setAvailableJobs(jobsInArea);
    } else {
      setAvailableJobs([]);
    }

    // Fetch my accepted jobs
    const { data: myJobsData } = await supabase
      .from("bookings")
      .select("id, address_id, user_id, scheduled_date, scheduled_time, time_slot, status, total_price, notes, created_at, updated_at, clippings_removal, is_weekend, is_public_holiday, grass_length, contractor_id, contractor_accepted_at, preferred_contractor_id, alternative_date, alternative_time_slot, alternative_suggested_at, alternative_suggested_by, quote_breakdown")
      .eq("contractor_id", contractorData.id)
      .in("status", ["confirmed", "pending"])
      .order("scheduled_date", { ascending: true });

    if (myJobsData && myJobsData.length > 0) {
      const addressIds = myJobsData.map(b => b.address_id);
      const userIds = myJobsData.map(b => b.user_id);
      
      // Fetch addresses and customer profiles in parallel
      const [addressResult, profileResult] = await Promise.all([
        supabase.from("addresses").select("*").in("id", addressIds),
        supabase.from("profiles").select("*").in("user_id", userIds)
      ]);

      const addressMap = new Map(addressResult.data?.map(a => [a.id, a]) || []);
      const profileMap = new Map(profileResult.data?.map(p => [p.user_id, p]) || []);
      
      setMyJobs(myJobsData.map(b => ({ 
        ...b, 
        address: addressMap.get(b.address_id),
        customerProfile: profileMap.get(b.user_id)
      })));
    } else {
      setMyJobs([]);
    }
  };

  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);

  const isStripeReady = stripeStatus.onboarding_complete && !stripeStatus.loading;

  const handleAcceptJob = async (booking: BookingWithAddress) => {
    if (!contractor) return;

    if (!isStripeReady) {
      toast.error("You must complete your Stripe payment setup before accepting jobs. Use the 'Complete Payment Setup' button above.");
      return;
    }

    // Tier-based restrictions
    const tier = (contractor as any).tier || "probation";
    const activeJobCount = myJobs.filter(j => j.status === "confirmed" || j.status === "pending").length;

    if (tier === "probation") {
      if (activeJobCount >= 3) {
        toast.error("You've reached your maximum of 3 concurrent jobs for your tier. Complete existing jobs to accept new ones.");
        return;
      }
      if (booking.total_price && Number(booking.total_price) > 150) {
        toast.error("As a new contractor, you cannot accept jobs over $150. Complete more jobs to unlock higher-value work.");
        return;
      }
    } else if (tier === "standard") {
      if (activeJobCount >= 10) {
        toast.error("You've reached your maximum of 10 concurrent jobs for your tier. Complete existing jobs to accept new ones.");
        return;
      }
    }
    // Premium: no restrictions

    setAcceptingJobId(booking.id);
    try {
      const { data, error } = await supabase.functions.invoke("charge-customer", {
        body: { bookingId: booking.id },
      });

      if (error) {
        console.error("Charge customer error:", error);
        toast.error("Failed to process payment. Please try again.");
        return;
      }

      if (data?.error) {
        if (data.isCardError) {
          toast.error("Customer's card was declined. The booking has been returned to the pool.");
          // Unassign contractor and reset booking
          await supabase
            .from("bookings")
            .update({
              contractor_id: null,
              contractor_accepted_at: null,
              status: "pending",
            })
            .eq("id", booking.id);

          // Notify customer to update payment method
          await supabase.from("notifications").insert({
            user_id: booking.user_id,
            title: "Payment Failed",
            message: "Your card was declined when a contractor tried to accept your job. Please update your payment method and rebook.",
            type: "error",
            booking_id: booking.id,
          });
        } else {
          toast.error(data.error || "Failed to accept job");
        }
        return;
      }

      toast.success("Job accepted! Payment captured and booking confirmed.");
      fetchJobs(contractor);
    } catch (err) {
      console.error("Accept job error:", err);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setAcceptingJobId(null);
    }
  };

  const handleSuggestAlternative = async () => {
    if (!isStripeReady) {
      toast.error("You must complete your Stripe payment setup before suggesting times. Use the 'Complete Payment Setup' button above.");
      return;
    }

    if (!contractor || !selectedJob || !suggestedDate) return;
    try {
      // Insert into alternative_suggestions table
      const { error: suggestionError } = await supabase
        .from("alternative_suggestions")
        .insert({
          booking_id: selectedJob.id,
          contractor_id: contractor.id,
          suggested_date: suggestedDate.toISOString().split("T")[0],
          suggested_time_slot: suggestedTimeSlot,
          status: "pending",
        });

      if (suggestionError) {
        // Check if it's a duplicate date/time
        if (suggestionError.code === "23505") {
          toast.error("This date and time has already been suggested for this job");
          return;
        }
        throw suggestionError;
      }

      // Notify the customer
      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: selectedJob.user_id,
          title: "Alternative Time Suggested",
          message: `A contractor has suggested an alternative time: ${suggestedDate.toLocaleDateString("en-AU", {
            weekday: "long",
            month: "long",
            day: "numeric"
          })} at ${timeSlots.find(t => t.value === suggestedTimeSlot)?.label || suggestedTimeSlot}. Please review and respond.`,
          type: "info",
          booking_id: selectedJob.id,
        });

      if (notificationError) {
        console.error("Failed to send notification:", notificationError);
      }

      toast.success("Alternative date suggested! The customer will be notified.");
      setSuggestDialogOpen(false);
      setSelectedJob(null);
      setSuggestedDate(undefined);
      fetchJobs(contractor);
    } catch (error) {
      console.error("Error suggesting alternative:", error);
      toast.error("Failed to suggest alternative");
    }
  };

  const handleCompleteJob = async (booking: BookingWithAddress) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", booking.id);

    if (error) {
      toast.error("Failed to mark job as complete");
      return;
    }

    toast.success("Job marked as complete!");
    if (contractor) fetchJobs(contractor);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      confirmed: { variant: "default", label: "Confirmed" },
      completed: { variant: "outline", label: "Completed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const { variant, label } = config[status] || { variant: "secondary", label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl gradient-hero animate-pulse" />
      </div>
    );
  }

  // Check if contractor is pending approval
  const isPendingApproval = contractor?.approval_status === "pending";
  const isRejected = contractor?.approval_status === "rejected";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-foreground">Lawnly</span>
              <Badge variant="outline" className="ml-2">Contractor</Badge>
              {contractor?.tier && (
                <span className="ml-2">
                  <ContractorTierBadge tier={contractor.tier} />
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {contractor?.business_name && (
              <span className="text-sm text-muted-foreground hidden sm:block">
                {contractor.business_name}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Pending Approval Message */}
        {isPendingApproval && (
          <Card className="mb-8 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-800/30">
                  <ClockIcon2 className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                    Application Under Review
                  </h3>
                  <p className="text-amber-700 dark:text-amber-300 text-sm mb-3">
                    Your contractor application is currently being reviewed by our team. 
                    This typically takes 1-2 business days. Once approved, you'll be able 
                    to view and accept jobs in your area.
                  </p>
                  <div className="text-sm text-amber-600 dark:text-amber-400">
                    <p><strong>Business Name:</strong> {contractor?.business_name}</p>
                    <p><strong>ABN:</strong> {contractor?.abn}</p>
                    <p><strong>Service Areas:</strong> {contractor?.service_areas?.length || 0} suburbs</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rejected Message */}
        {isRejected && (
          <Card className="mb-8 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-red-100 dark:bg-red-800/30">
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-800 dark:text-red-200 mb-1">
                    Application Not Approved
                  </h3>
                  <p className="text-red-700 dark:text-red-300 text-sm">
                    Unfortunately, your contractor application was not approved. 
                    Please contact our support team if you have any questions or 
                    would like to reapply.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quality Status Banners */}
        {contractor?.approval_status === "approved" && (contractor as any).suspension_status === "warning" && (
          <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>⚠️ Quality Alert:</strong> Your performance metrics need improvement. Maintain high ratings and avoid cancellations to keep your account in good standing.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        {contractor?.approval_status === "approved" && (contractor as any).suspension_status === "review_required" && (
          <Card className="mb-6 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  <strong>🔍 Account Under Review:</strong> Your account is currently under review due to quality concerns. Our support team will contact you shortly.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        {contractor?.approval_status === "approved" && (contractor as any).suspension_status === "suspended" && (
          <Card className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>🚫 Account Suspended:</strong> Your account has been suspended due to quality violations. Please contact support for assistance.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Only show dashboard content if approved */}
        {!isPendingApproval && !isRejected && (
          <>
            {/* Insurance Expiry Info */}
            {contractor?.insurance_expiry_date && (() => {
              const daysLeft = differenceInDays(new Date(contractor.insurance_expiry_date), new Date());
              if (daysLeft <= 0) {
                return (
                  <Card className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                    <CardContent className="pt-5 pb-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-destructive shrink-0" />
                        <p className="text-sm text-red-800 dark:text-red-200">
                          <strong>⛔ Insurance Expired:</strong> Your insurance expired on {format(new Date(contractor.insurance_expiry_date), "d MMM yyyy")}. Upload a renewed certificate to continue accepting jobs.
                        </p>
                      </div>
                      <InsuranceUploadForm contractorId={contractor.id} userId={user?.id || ""} onUpload={() => checkContractorAccess()} isUploading={insuranceUploading} setIsUploading={setInsuranceUploading} expiryInput={insuranceExpiryInput} setExpiryInput={setInsuranceExpiryInput} />
                    </CardContent>
                  </Card>
                );
              }
              if (daysLeft <= 30) {
                return (
                  <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                    <CardContent className="pt-5 pb-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          <strong>⚠️ Insurance Expiring Soon:</strong> Your insurance expires on {format(new Date(contractor.insurance_expiry_date), "d MMM yyyy")} ({daysLeft} days remaining). Please renew before expiry.
                        </p>
                      </div>
                      <InsuranceUploadForm contractorId={contractor.id} userId={user?.id || ""} onUpload={() => checkContractorAccess()} isUploading={insuranceUploading} setIsUploading={setInsuranceUploading} expiryInput={insuranceExpiryInput} setExpiryInput={setInsuranceExpiryInput} />
                    </CardContent>
                  </Card>
                );
              }
              return null;
            })()}

            {/* Insurance Info Card */}
            {contractor && (
              <Card className="mb-6">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Public Liability Insurance</p>
                        <p className="text-xs text-muted-foreground">
                          {contractor.insurance_expiry_date
                            ? `Expires: ${format(new Date(contractor.insurance_expiry_date), "d MMM yyyy")}`
                            : "No expiry date set"}
                          {contractor.insurance_verified && " • ✓ Verified"}
                        </p>
                      </div>
                    </div>
                    <InsuranceUploadForm contractorId={contractor.id} userId={user?.id || ""} onUpload={() => checkContractorAccess()} isUploading={insuranceUploading} setIsUploading={setInsuranceUploading} expiryInput={insuranceExpiryInput} setExpiryInput={setInsuranceExpiryInput} compact />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stripe Connect Setup */}
            {!stripeStatus.loading && !stripeStatus.onboarding_complete && (
              <Card className="mb-8 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-800/30">
                      <CreditCard className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                        Complete Payment Setup
                      </h3>
                      <p className="text-amber-700 dark:text-amber-300 text-sm mb-3">
                        You need to complete your payment setup to receive payouts. Set up your bank account through our secure payment partner.
                      </p>
                      <Button
                        onClick={handleCompleteStripeSetup}
                        disabled={stripeSetupLoading}
                        size="sm"
                      >
                        {stripeSetupLoading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <CreditCard className="w-4 h-4 mr-2" />
                        )}
                        Complete Setup
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!stripeStatus.loading && stripeStatus.onboarding_complete && (
              <Card className="mb-8 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-green-100 dark:bg-green-800/30">
                      <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-800 dark:text-green-200">
                        Payment Setup Complete ✓
                      </h3>
                      <p className="text-green-700 dark:text-green-300 text-sm">
                        Payouts will be sent to your bank account.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Briefcase className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{availableJobs.length}</p>
                  <p className="text-sm text-muted-foreground">Available Jobs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/20">
                  <CalendarIcon className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{myJobs.length}</p>
                  <p className="text-sm text-muted-foreground">Upcoming Jobs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/20">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    ${myJobs.reduce((sum, job) => sum + (Number(job.total_price) || 0), 0).toFixed(0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Pending Earnings</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Available Jobs */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Available Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {availableJobs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No available jobs in your service areas right now.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableJobs.map((job) => (
                    <TableRow 
                      key={job.id} 
                      className={`cursor-pointer hover:bg-muted/50 ${job.preferred_contractor_id === contractor?.id ? "bg-primary/5" : ""}`}
                      onClick={() => {
                        setViewingJob(job);
                        setJobDetailsDialogOpen(true);
                      }}
                    >
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-muted-foreground" />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{job.address?.street_address}</p>
                              {job.preferred_contractor_id === contractor?.id && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-xs gap-1">
                                        <Star className="w-3 h-3 fill-current" />
                                        Requested
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>This customer specifically requested you!</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {job.address?.city}, {job.address?.state}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <Clock className="w-4 h-4 mt-1 text-muted-foreground" />
                          <div>
                            <p>{new Date(job.scheduled_date).toLocaleDateString("en-AU", {
                              weekday: "short",
                              month: "short",
                              day: "numeric"
                            })}</p>
                            <p className="text-sm text-muted-foreground">
                              {timeSlots.find(t => t.value === job.time_slot)?.label || job.time_slot}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          <p>{job.address?.square_meters}m²</p>
                          <p className="text-muted-foreground">
                            Grass: {job.grass_length} • {job.clippings_removal ? "Remove clippings" : "Leave clippings"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-lg">${Number(job.total_price).toFixed(0)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" disabled={acceptingJobId === job.id || !isStripeReady} onClick={(e) => { e.stopPropagation(); handleAcceptJob(job); }}
                            title={!isStripeReady ? "Complete Stripe payment setup first" : undefined}
                          >
                            {acceptingJobId === job.id ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4 mr-1" />
                            )}
                            {acceptingJobId === job.id ? "Processing..." : "Accept"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!isStripeReady}
                            title={!isStripeReady ? "Complete Stripe payment setup first" : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isStripeReady) {
                                toast.error("You must complete your Stripe payment setup before suggesting times. Use the 'Complete Payment Setup' button above.");
                                return;
                              }
                              setSelectedJob(job);
                              setSuggestDialogOpen(true);
                            }}
                          >
                            <CalendarClock className="w-4 h-4 mr-1" />
                            Suggest Time
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* My Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              My Scheduled Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myJobs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                You haven't accepted any jobs yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myJobs.map((job) => (
                    <TableRow 
                      key={job.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setViewingJob(job);
                        setJobDetailsDialogOpen(true);
                      }}
                    >
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-1 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{job.address?.street_address}</p>
                            <p className="text-sm text-muted-foreground">
                              {job.address?.city}, {job.address?.state}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium">{job.customerProfile?.full_name || "Customer"}</p>
                          {job.customerProfile?.phone && (
                            <a 
                              href={`tel:${job.customerProfile.phone}`} 
                              className="text-primary hover:underline"
                            >
                              {job.customerProfile.phone}
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{new Date(job.scheduled_date).toLocaleDateString("en-AU", {
                            weekday: "short",
                            month: "short",
                            day: "numeric"
                          })}</p>
                          <p className="text-sm text-muted-foreground">
                            {timeSlots.find(t => t.value === job.time_slot)?.label || job.time_slot}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{job.address?.square_meters}m² • {job.grass_length}</p>
                          <p className="font-bold">${Number(job.total_price).toFixed(0)}</p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell>
                        {job.status === "confirmed" && (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/contractor/jobs/${job.id}/complete`); }}>
                            <Check className="w-4 h-4 mr-1" />
                            Complete
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Ratings Section */}
        {contractor && (
          <div className="mt-8">
            <ContractorRatingsSection contractor={contractor} />
          </div>
        )}
          </>
        )}
      </main>

      {/* Suggest Alternative Dialog */}
      <Dialog open={suggestDialogOpen} onOpenChange={setSuggestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suggest Alternative Date/Time</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Date</Label>
              <div className="flex justify-center mt-2">
                <Calendar
                  mode="single"
                  selected={suggestedDate}
                  onSelect={setSuggestedDate}
                  disabled={{ before: new Date() }}
                  className="rounded-md border"
                />
              </div>
            </div>
            <div>
              <Label>Time Slot</Label>
              <RadioGroup value={suggestedTimeSlot} onValueChange={setSuggestedTimeSlot} className="mt-2">
                {timeSlots.map((slot) => (
                  <div key={slot.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={slot.value} id={slot.value} />
                    <Label htmlFor={slot.value}>{slot.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSuggestAlternative} disabled={!suggestedDate}>
              Send Suggestion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Details Dialog */}
      <JobDetailsDialog
        open={jobDetailsDialogOpen}
        onOpenChange={setJobDetailsDialogOpen}
        job={viewingJob}
        showContactInfo={viewingJob?.contractor_id === contractor?.id && viewingJob?.status !== "completed"}
      />
    </div>
  );
};

export default ContractorDashboard;
