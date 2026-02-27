import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Clock, DollarSign, CheckCircle2, Image, FileText, XCircle } from "lucide-react";
import PortalDisputeSection from "./PortalDisputeSection";
import CancelBookingFlow from "./CancelBookingFlow";
import type { ContractorBrand } from "./PortalLayout";

interface PortalJob {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  total_price: number | null;
  payment_status: string;
  description: string | null;
  notes: string | null;
  completed_at: string | null;
  source: string;
  client_id: string;
  contractor_id: string;
}

interface JobPhoto {
  id: string;
  photo_url: string;
  photo_type: string;
  uploaded_at: string;
}

interface PortalJobDetailProps {
  job: PortalJob;
  contractor: ContractorBrand;
  userId: string;
  onBack: () => void;
}

const paymentLabels: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  paid: { label: "Paid", icon: CheckCircle2, color: "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" },
  invoiced: { label: "Invoice Sent", icon: FileText, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" },
  unpaid: { label: "Unpaid", icon: DollarSign, color: "text-muted-foreground bg-muted border-border" },
};

export const PortalJobDetail = ({ job, contractor, userId, onBack }: PortalJobDetailProps) => {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [cancelFlowOpen, setCancelFlowOpen] = useState(false);
  const [currentJob, setCurrentJob] = useState(job);

  useEffect(() => {
    loadPhotos();
  }, [currentJob.id]);

  const loadPhotos = async () => {
    const { data } = await supabase
      .from("job_photos")
      .select("id, photo_url, photo_type, uploaded_at")
      .eq("job_id", currentJob.id)
      .order("uploaded_at");

    setPhotos(data || []);
    setPhotosLoading(false);
  };

  const reloadJob = async () => {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", currentJob.id)
      .single();
    if (data) setCurrentJob(data as PortalJob);
  };

  const beforePhotos = photos.filter((p) => p.photo_type === "before");
  const afterPhotos = photos.filter((p) => p.photo_type === "after");
  const paymentInfo = paymentLabels[currentJob.payment_status] || paymentLabels.unpaid;
  const PaymentIcon = paymentInfo.icon;

  const isCompleted = currentJob.status === "completed";
  const isCancelled = currentJob.status === "cancelled";
  const isRecentlyCompleted = isCompleted && currentJob.completed_at && (Date.now() - new Date(currentJob.completed_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
  const canCancel = !isCompleted && !isCancelled;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Back to jobs</span>
      </button>

      {/* Job Header */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">{currentJob.title}</h2>
            {currentJob.description && <p className="text-sm text-muted-foreground mb-3">{currentJob.description}</p>}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  {new Date(currentJob.scheduled_date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>
              {currentJob.scheduled_time && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>{currentJob.scheduled_time}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={currentJob.status === "completed" ? "outline" : currentJob.status === "cancelled" ? "destructive" : "default"}>
              {currentJob.status === "completed" ? "Completed" : currentJob.status === "cancelled" ? "Cancelled" : currentJob.status === "scheduled" ? "Scheduled" : currentJob.status === "in_progress" ? "In Progress" : currentJob.status === "pending_confirmation" ? "Pending Confirmation" : currentJob.status.replace(/_/g, " ")}
            </Badge>
            {currentJob.total_price != null && (
              <span className="text-lg font-bold" style={{ color: contractor.primary_color }}>
                ${currentJob.total_price.toFixed(2)}
              </span>
            )}
            {canCancel && (
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setCancelFlowOpen(true)}>
                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel Booking
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Payment Status Card (for completed jobs) */}
      {isCompleted && (
        <div className={`rounded-xl p-4 border ${paymentInfo.color}`}>
          <div className="flex items-center gap-3">
            <PaymentIcon className="w-5 h-5" />
            <div>
              <p className="font-semibold text-sm">{paymentInfo.label}</p>
              {job.payment_status === "paid" && job.source === "website_booking" && (
                <p className="text-xs opacity-75">Payment was captured automatically upon job completion.</p>
              )}
              {job.payment_status === "invoiced" && (
                <p className="text-xs opacity-75">An invoice has been sent. Check your email for payment details.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {job.notes && (
        <div className="bg-card rounded-xl p-5 shadow-sm border border-border">
          <h3 className="font-semibold text-foreground text-sm mb-2">Notes</h3>
          <p className="text-sm text-muted-foreground">{job.notes}</p>
        </div>
      )}

      {/* Photos */}
      {isCompleted && (
        <div className="bg-card rounded-xl p-5 shadow-sm border border-border">
          <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
            <Image className="w-4 h-4" />
            Job Photos
          </h3>
          {photosLoading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Loading photos...</div>
          ) : photos.length === 0 ? (
            <div className="text-center py-6">
              <Image className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No photos were provided for this job.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {beforePhotos.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Before</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {beforePhotos.map((p) => (
                      <img key={p.id} src={p.photo_url} alt="Before" className="rounded-lg object-cover aspect-square w-full" />
                    ))}
                  </div>
                </div>
              )}
              {afterPhotos.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">After</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {afterPhotos.map((p) => (
                      <img key={p.id} src={p.photo_url} alt="After" className="rounded-lg object-cover aspect-square w-full" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dispute Section — only for recently completed jobs */}
      {isRecentlyCompleted && (
        <div className="bg-card rounded-xl p-5 shadow-sm border border-border">
          <h3 className="font-semibold text-foreground text-sm mb-3">Have an issue?</h3>
          <PortalDisputeSection
            jobId={job.id}
            contractorId={job.contractor_id}
            userId={userId}
            jobTotal={job.total_price}
          />
        </div>
      )}
    </div>
  );
};

export default PortalJobDetail;
