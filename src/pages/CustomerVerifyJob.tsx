import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Leaf,
  Loader2,
  ArrowLeft,
  Clock,
  Star,
  AlertTriangle,
  CheckCircle2,
  Upload,
  X,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import JobPhotosGallery from "@/components/dashboard/JobPhotosGallery";

const CustomerVerifyJob = () => {
  const { id: bookingId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any>(null);
  const [contractorName, setContractorName] = useState("Contractor");
  const [hoursRemaining, setHoursRemaining] = useState<number | null>(null);

  // Approve flow
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [approved, setApproved] = useState(false);

  // Dispute flow
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [suggestedRefundAmount, setSuggestedRefundAmount] = useState("");
  const [disputePhotos, setDisputePhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [disputed, setDisputed] = useState(false);
  const disputeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBooking();
  }, [bookingId]);

  // Countdown timer - update every minute
  useEffect(() => {
    if (!booking?.completed_at) return;

    const updateTimer = () => {
      const completedAt = new Date(booking.completed_at).getTime();
      const deadline = completedAt + 48 * 60 * 60 * 1000;
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((deadline - now) / (1000 * 60 * 60)));
      setHoursRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [booking?.completed_at]);

  const fetchBooking = async () => {
    if (!bookingId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/auth"); return; }

    const { data: bookingData, error } = await supabase
      .from("bookings")
      .select(`*, contractor:contractors(business_name, user_id)`)
      .eq("id", bookingId)
      .eq("user_id", user.id)
      .single();

    if (error || !bookingData) {
      toast.error("Booking not found");
      navigate("/dashboard");
      return;
    }

    const allowedStatuses = ["completed", "disputed", "post_payment_dispute"];
    if (!allowedStatuses.includes(bookingData.status)) {
      toast.error("This booking cannot be reviewed");
      navigate("/dashboard");
      return;
    }

    setBooking(bookingData);

    // Get contractor name - normalize array result from join
    const contractor = Array.isArray(bookingData.contractor) ? bookingData.contractor[0] : bookingData.contractor;
    if (contractor?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", contractor.user_id)
        .single();
      setContractorName(
        contractor.business_name || profile?.full_name || "Contractor"
      );
    }

    setLoading(false);
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke("approve-job", {
        body: { bookingId, rating: rating || undefined, comment: ratingComment || undefined },
      });
      if (error || data?.error) throw new Error(data?.error || "Failed to approve");

      setApproveDialogOpen(false);
      setApproved(true);
      setRatingDialogOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve job");
    } finally {
      setApproving(false);
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      // Skip rating
      setRatingDialogOpen(false);
      toast.success(`Payment released to ${contractorName}!`);
      return;
    }

    setSubmittingRating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Save rating to bookings table
      await supabase
        .from("bookings")
        .update({
          customer_rating: rating,
          rating_comment: ratingComment?.slice(0, 200) || null,
          rating_submitted_at: new Date().toISOString(),
        })
        .eq("id", bookingId!);

      // Rating saved to bookings table only (reviews table removed)
    } catch {
      // non-blocking
    } finally {
      setSubmittingRating(false);
      setRatingDialogOpen(false);
      toast.success("Thank you for your feedback!");
    }
  };

  /**
   * Ultra-low-memory image compression (same strategy as contractor uploads).
   * Strategy 1: createImageBitmap with resizeWidth — browser decodes at reduced resolution.
   * Strategy 2 (fallback): <img> element + canvas.
   */
  const compressImage = (file: File, maxWidth = 600, quality = 0.5): Promise<Blob> => {
    return compressWithBitmapResize(file, maxWidth, quality)
      .catch(() => compressWithImgElement(file, maxWidth, quality));
  };

  const compressWithBitmapResize = async (file: File, maxWidth: number, quality: number): Promise<Blob> => {
    const probeBitmap = await createImageBitmap(file);
    const natW = probeBitmap.width;
    const natH = probeBitmap.height;
    probeBitmap.close();

    const scale = Math.min(1, maxWidth / natW);
    const targetW = Math.round(natW * scale);
    const targetH = Math.round(natH * scale);

    const bitmap = await createImageBitmap(file, {
      resizeWidth: targetW,
      resizeHeight: targetH,
      resizeQuality: "low",
    });

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); throw new Error("Canvas not supported"); }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          blob ? resolve(blob) : reject(new Error("Compression failed"));
        },
        "image/jpeg",
        quality
      );
    });
  };

  const compressWithImgElement = (file: File, maxWidth: number, quality: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxWidth / img.naturalWidth);
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error("Canvas not supported")); return; }
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);
              canvas.width = 0;
              canvas.height = 0;
              blob ? resolve(blob) : reject(new Error("Compression failed"));
            },
            "image/jpeg",
            quality
          );
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
      img.src = objectUrl;
    });
  };

  const handleDisputePhotoSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Copy file references immediately
    const fileArray: File[] = Array.from(files);

    // Clear input to release file handles
    if (disputeInputRef.current) disputeInputRef.current.value = "";

    // Process sequentially with compression (deferred)
    setTimeout(async () => {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        if (i > 0) await new Promise(r => setTimeout(r, 300));

        try {
          const compressed = await compressImage(file);
          const previewUrl = URL.createObjectURL(compressed);
          setDisputePhotos(prev => [...prev, { file: new File([compressed], file.name, { type: "image/jpeg" }), previewUrl }]);
        } catch {
          toast.error(`Failed to process photo ${i + 1}. Skipping.`);
        }
      }
    }, 100);
  };

  const removeDisputePhoto = (idx: number) => {
    setDisputePhotos(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmitDispute = async () => {
    if (!disputeReason) {
      toast.error("Please select a dispute reason");
      return;
    }
    if (disputeDescription.length < 20) {
      toast.error("Please provide a more detailed description (minimum 20 characters)");
      return;
    }

    const maxRefund = Number(booking?.total_price) || 0;
    const refundNum = suggestedRefundAmount ? parseFloat(suggestedRefundAmount) : 0;
    if (refundNum < 0 || refundNum > maxRefund) {
      toast.error(`Suggested refund must be between $0 and $${maxRefund.toFixed(2)}`);
      return;
    }

    setSubmittingDispute(true);
    try {
      // Upload dispute photos
      const photoUrls: string[] = [];
      for (const photo of disputePhotos) {
        const timestamp = Date.now();
        const filePath = `${bookingId}/dispute-${timestamp}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("dispute-photos")
          .upload(filePath, photo.file, { contentType: photo.file.type });
        if (!uploadError) photoUrls.push(filePath);
      }

      const { data, error } = await supabase.functions.invoke("dispute-job", {
        body: {
          bookingId,
          description: disputeDescription,
          photoUrls,
          disputeReason,
          suggestedRefundAmount: refundNum > 0 ? refundNum : undefined,
        },
      });

      if (error || data?.error) throw new Error(data?.error || "Failed to submit dispute");

      setDisputeDialogOpen(false);
      setDisputed(true);
      toast.success("Your dispute has been submitted. We'll review the issue and get back to you within 24-72 hours.");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit dispute");
    } finally {
      setSubmittingDispute(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Booking not found</p>
      </div>
    );
  }

  const completedDate = booking.completed_at
    ? new Date(booking.completed_at).toLocaleDateString("en-AU", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      })
    : "";
  const completedTime = booking.completed_at
    ? new Date(booking.completed_at).toLocaleTimeString("en-AU", {
        hour: "2-digit", minute: "2-digit",
      })
    : "";

  const isVerifiable = false; // Legacy verification removed
  const isCompleted = booking.status === "completed";
  const isPostPaymentDispute = booking.status === "post_payment_dispute";
  const isAlreadyDisputed = booking.status === "disputed" || isPostPaymentDispute;

  // Check if within 7-day dispute window for completed bookings
  const withinDisputeWindow = (() => {
    if (!booking.completed_at) return false;
    const completedAt = new Date(booking.completed_at).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - completedAt < sevenDaysMs;
  })();

  const canDispute = (isVerifiable || (isCompleted && withinDisputeWindow)) && !approved && !disputed;
  const daysRemaining = booking.completed_at
    ? Math.max(0, Math.ceil((new Date(booking.completed_at).getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-display font-bold text-foreground">Review Job</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        {/* Success/Disputed states */}
        {approved && (
          <Card className="border-green-500/30 bg-green-50 dark:bg-green-950/20">
            <CardContent className="pt-6 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <p className="font-medium text-green-800 dark:text-green-200">
                Payment has been released to {contractorName}. Thank you!
              </p>
            </CardContent>
          </Card>
        )}

        {disputed && (
          <Card className="border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="pt-6 flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Your dispute has been submitted. We'll review the issue and get back to you within 24-72 hours.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Completion Info */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Job #{bookingId?.slice(0, 8)}</h2>
              <Badge variant={isVerifiable ? "secondary" : isAlreadyDisputed ? "destructive" : "outline"}>
                {isVerifiable ? "Awaiting Review" : isPostPaymentDispute ? "Post-Payment Dispute" : booking.status === "disputed" ? "Disputed" : "Completed"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Completed by <span className="font-medium text-foreground">{contractorName}</span> on{" "}
              {completedDate} at {completedTime}
            </p>
            <p className="text-lg font-semibold text-primary">
              ${Number(booking.total_price).toFixed(2)}
            </p>
            {isCompleted && withinDisputeWindow && !approved && !disputed && (
              <p className="text-xs text-muted-foreground">
                ⏰ You have {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left to report an issue
              </p>
            )}
          </CardContent>
        </Card>

        {/* Countdown Timer */}
        {isVerifiable && hoursRemaining !== null && !approved && !disputed && (
          <Card className="border-primary/20">
            <CardContent className="pt-6 flex items-start gap-3">
              <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <p className="text-sm">
                You have <span className="font-bold text-primary">{hoursRemaining} hours</span> to
                review this job before payment is automatically released to the contractor.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Before/After Photos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Before & After Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <JobPhotosGallery bookingId={bookingId!} />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        {isVerifiable && !approved && !disputed && (
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setApproveDialogOpen(true)}
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Approve & Release Payment
            </Button>
            <Button
              variant="outline"
              className="w-full border-yellow-500 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-950/30"
              onClick={() => setDisputeDialogOpen(true)}
            >
              <AlertTriangle className="w-5 h-5 mr-2" />
              Report an Issue
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => navigate("/dashboard")}
            >
              I'll Review Later
            </Button>
          </div>
        )}

        {/* Post-payment dispute button for completed bookings within 7-day window */}
        {isCompleted && withinDisputeWindow && !approved && !disputed && (
          <div className="space-y-3">
            <Card className="border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20">
              <CardContent className="pt-6 text-sm text-yellow-800 dark:text-yellow-200">
                <p>Payment has already been released. If you report an issue, our team will review it and may issue a refund from the platform balance.</p>
              </CardContent>
            </Card>
            <Button
              variant="outline"
              className="w-full border-yellow-500 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-950/30"
              onClick={() => setDisputeDialogOpen(true)}
            >
              <AlertTriangle className="w-5 h-5 mr-2" />
              Report an Issue
            </Button>
          </div>
        )}
      </main>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve & Release Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you satisfied with the work? This will release{" "}
              <span className="font-semibold text-foreground">${Number(booking.total_price).toFixed(2)}</span> to{" "}
              {contractorName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={approving}
              className="bg-green-600 hover:bg-green-700"
            >
              {approving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Yes, Release Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rating Dialog */}
      <Dialog open={ratingDialogOpen} onOpenChange={setRatingDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How would you rate this service?</DialogTitle>
            <DialogDescription>Your feedback helps improve our service quality.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= (hoverRating || rating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-muted-foreground/30"
                    } transition-colors`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <>
                <Textarea
                  placeholder="How was your experience? (max 200 chars)"
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value.slice(0, 200))}
                  rows={3}
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground text-right">{ratingComment.length}/200</p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRatingDialogOpen(false); toast.success(`Payment has been released to ${contractorName}!`); }}>
              Skip
            </Button>
            <Button onClick={handleSubmitRating} disabled={submittingRating || rating === 0}>
              {submittingRating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit Rating
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report an Issue</DialogTitle>
            <DialogDescription>
              Tell us what's wrong with the work. Our team will review and respond within 24-72 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="mb-2 block">Dispute Reason *</Label>
              <Select value={disputeReason} onValueChange={setDisputeReason}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="poor_quality">Poor Quality</SelectItem>
                  <SelectItem value="partial_completion">Partial Completion</SelectItem>
                  <SelectItem value="property_damage">Property Damage</SelectItem>
                  <SelectItem value="no_show">No Show</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block">Details *</Label>
              <Textarea
                placeholder="Please describe the issue in detail (minimum 20 characters)..."
                value={disputeDescription}
                onChange={(e) => setDisputeDescription(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {disputeDescription.length}/20 characters minimum
              </p>
            </div>

            <div>
              <Label className="mb-2 block">Suggested Refund Amount (optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min={0}
                  max={Number(booking?.total_price) || 0}
                  step={0.01}
                  placeholder="0.00"
                  value={suggestedRefundAmount}
                  onChange={(e) => setSuggestedRefundAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Max: ${Number(booking?.total_price || 0).toFixed(2)}
              </p>
            </div>

            <div>
              <Label className="mb-2 block">Upload photos (optional)</Label>
              <div className="grid grid-cols-4 gap-2">
                {disputePhotos.map((photo, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border">
                    <img src={photo.previewUrl} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeDisputePhoto(idx)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => disputeInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 transition-colors"
                >
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Add</span>
                </button>
              </div>
              <input
                ref={disputeInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleDisputePhotoSelect(e.target.files)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisputeDialogOpen(false)} disabled={submittingDispute}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitDispute}
              disabled={submittingDispute || !disputeReason || disputeDescription.length < 20}
              variant="destructive"
            >
              {submittingDispute ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerVerifyJob;
