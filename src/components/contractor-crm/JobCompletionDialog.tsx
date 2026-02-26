import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, Receipt, Link2, Copy, ExternalLink, Camera, X, ImagePlus, CreditCard, FileText } from "lucide-react";
import { toast } from "sonner";

interface JobCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    id: string;
    title: string;
    source: string;
    total_price: number | null;
    client_name: string;
    payment_status: string;
  } | null;
  onCompleted: () => void;
}

type CompletionStep = "photos" | "confirm" | "completing" | "options" | "done";

const RECOMMENDED_PHOTOS = 2; // recommended per type

const JobCompletionDialog = ({ open, onOpenChange, job, onCompleted }: JobCompletionDialogProps) => {
  const [step, setStep] = useState<CompletionStep>("photos");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [photosAcknowledged, setPhotosAcknowledged] = useState(false);

  // Photo upload state
  const [beforePhotos, setBeforePhotos] = useState<File[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<File[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);

  const addPhotos = (files: FileList | null, type: "before" | "after") => {
    if (!files) return;
    const arr = Array.from(files);
    if (type === "before") setBeforePhotos(prev => [...prev, ...arr].slice(0, 5));
    else setAfterPhotos(prev => [...prev, ...arr].slice(0, 5));
  };

  const removePhoto = (type: "before" | "after", index: number) => {
    if (type === "before") setBeforePhotos(prev => prev.filter((_, i) => i !== index));
    else setAfterPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const uploadPhotos = async () => {
    if (!job || (beforePhotos.length === 0 && afterPhotos.length === 0)) return;

    setUploadingPhotos(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: contractor } = await supabase.from("contractors").select("id").eq("user_id", user.id).single();
      if (!contractor) return;

      const uploadBatch = async (photos: File[], photoType: string) => {
        for (const file of photos) {
          const ext = file.name.split(".").pop() || "jpg";
          const path = `${contractor.id}/${job.id}/${photoType}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          
          const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, file);
          if (uploadError) {
            console.error("Upload error:", uploadError);
            continue;
          }

          await supabase.from("job_photos").insert({
            contractor_id: contractor.id,
            job_id: job.id,
            photo_type: photoType,
            photo_url: path,
          });
        }
      };

      await Promise.all([
        uploadBatch(beforePhotos, "before"),
        uploadBatch(afterPhotos, "after"),
      ]);
    } catch (err) {
      console.error("Photo upload error:", err);
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleComplete = async () => {
    if (!job) return;
    setStep("completing");
    setIsProcessing(true);

    try {
      if (beforePhotos.length > 0 || afterPhotos.length > 0) {
        await uploadPhotos();
      }

      const { data, error } = await supabase.functions.invoke("complete-job-v2", {
        body: { jobId: job.id, action: "complete" },
      });

      if (error) throw new Error(error.message || "Failed to complete job");
      if (data?.error) throw new Error(data.error);

      if (data.path === "website_booking") {
        setResult("Payment processed automatically. Invoice and receipt sent.");
        setStep("done");
      } else if (data.path === "manual") {
        setStep("options");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to complete job");
      setStep("confirm");
    }
    setIsProcessing(false);
  };

  const handleGenerateInvoice = async () => {
    if (!job) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-job-v2", {
        body: { jobId: job.id, action: "generate_invoice" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setInvoiceNumber(data.invoice_number);
      setResult(`Invoice ${data.invoice_number} created for $${Number(data.total).toFixed(2)}. You can email it from the Invoices tab.`);
      setStep("done");
    } catch (err: any) {
      toast.error(err.message);
    }
    setIsProcessing(false);
  };

  const handleSendPaymentLink = async () => {
    if (!job) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-job-v2", {
        body: { jobId: job.id, action: "send_payment_link" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setPaymentLinkUrl(data.payment_link_url);
      setResult("Payment link created. Share it with your client.");
      setStep("done");
    } catch (err: any) {
      toast.error(err.message);
    }
    setIsProcessing(false);
  };

  const copyPaymentLink = () => {
    if (paymentLinkUrl) {
      navigator.clipboard.writeText(paymentLinkUrl);
      toast.success("Payment link copied!");
    }
  };

  const handleClose = () => {
    setStep("photos");
    setPaymentLinkUrl(null);
    setInvoiceNumber(null);
    setResult(null);
    setBeforePhotos([]);
    setAfterPhotos([]);
    setPhotosAcknowledged(false);
    onOpenChange(false);
    onCompleted();
  };

  if (!job) return null;

  const isWebsiteBooking = job.source === "website_booking";
  const priceLabel = job.total_price ? `$${Number(job.total_price).toFixed(2)}` : null;

  // Photo progress calculation
  const beforeProgress = Math.min(beforePhotos.length / RECOMMENDED_PHOTOS, 1) * 100;
  const afterProgress = Math.min(afterPhotos.length / RECOMMENDED_PHOTOS, 1) * 100;
  const totalPhotoProgress = (beforeProgress + afterProgress) / 2;
  const hasAnyPhotos = beforePhotos.length > 0 || afterPhotos.length > 0;
  const canProceed = photosAcknowledged || hasAnyPhotos;

  const PhotoSection = ({ type, photos, inputRef, onAdd, onRemove }: {
    type: string;
    photos: File[];
    inputRef: React.RefObject<HTMLInputElement>;
    onAdd: (files: FileList | null) => void;
    onRemove: (i: number) => void;
  }) => {
    const progress = Math.min(photos.length / RECOMMENDED_PHOTOS, 1) * 100;
    const isComplete = photos.length >= RECOMMENDED_PHOTOS;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground capitalize">{type} Photos</p>
            <Badge
              variant={isComplete ? "default" : "outline"}
              className={`text-[10px] px-1.5 py-0 h-4 ${isComplete ? "bg-primary/20 text-primary border-primary/30" : ""}`}
            >
              {photos.length}/{RECOMMENDED_PHOTOS} {isComplete ? "✅" : ""}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="w-3 h-3 mr-1" /> Add
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onAdd(e.target.files)}
          />
        </div>
        <Progress value={progress} className="h-1.5" />
        {photos.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {photos.map((file, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => onRemove(i)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        {/* STEP: Photo Documentation */}
        {step === "photos" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" />
                Document This Job
              </DialogTitle>
              <DialogDescription>
                Add before & after photos to build trust and protect against disputes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {/* Overall progress */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Photo Progress</span>
                  <span className="text-muted-foreground text-xs">
                    {Math.round(totalPhotoProgress)}%
                  </span>
                </div>
                <Progress value={totalPhotoProgress} className="h-2" />
              </div>

              <div className="p-3 rounded-lg border border-border space-y-3">
                <PhotoSection
                  type="before"
                  photos={beforePhotos}
                  inputRef={beforeInputRef as React.RefObject<HTMLInputElement>}
                  onAdd={(files) => addPhotos(files, "before")}
                  onRemove={(i) => removePhoto("before", i)}
                />
                <div className="border-t border-border" />
                <PhotoSection
                  type="after"
                  photos={afterPhotos}
                  inputRef={afterInputRef as React.RefObject<HTMLInputElement>}
                  onAdd={(files) => addPhotos(files, "after")}
                  onRemove={(i) => removePhoto("after", i)}
                />
              </div>

              {!hasAnyPhotos && (
                <label className="flex items-start gap-2 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={photosAcknowledged}
                    onChange={(e) => setPhotosAcknowledged(e.target.checked)}
                    className="mt-0.5 rounded border-border"
                  />
                  <span className="text-xs text-muted-foreground">
                    Skip photos — I understand this reduces dispute protection.
                  </span>
                </label>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button
                  onClick={() => setStep("confirm")}
                  disabled={!canProceed}
                >
                  Continue to Completion
                </Button>
              </div>
            </div>
          </>
        )}

        {/* STEP: Confirm */}
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Complete Job</DialogTitle>
              <DialogDescription>
                Mark "{job.title}" for {job.client_name} as completed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Service</span>
                  <span className="font-medium text-foreground">{job.title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Client</span>
                  <span className="font-medium text-foreground">{job.client_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium text-foreground">
                    {priceLabel || "Not set"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Source</span>
                  <Badge variant="outline" className="text-xs">
                    {isWebsiteBooking ? "🌐 Website Booking" : "Manual"}
                  </Badge>
                </div>
                {hasAnyPhotos && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Photos</span>
                    <span className="text-xs text-primary font-medium">
                      Before: {beforePhotos.length} · After: {afterPhotos.length}
                    </span>
                  </div>
                )}
              </div>

              {isWebsiteBooking && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Auto-charge enabled</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The customer's saved payment method will be charged {priceLabel ? priceLabel : "the quoted amount"} automatically.
                    </p>
                  </div>
                </div>
              )}
              {!isWebsiteBooking && (
                <div className="bg-muted/50 border border-border rounded-lg p-3 flex items-start gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Invoice options next</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      After marking complete, you'll choose how to invoice this job.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setStep("photos")}>Back</Button>
                <Button onClick={handleComplete} className={isWebsiteBooking ? "bg-primary hover:bg-primary/90" : ""}>
                  {isWebsiteBooking ? (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Complete & Charge Customer {priceLabel ? `(${priceLabel})` : ""}
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      Complete & Create Invoice
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* STEP: Processing */}
        {step === "completing" && (
          <div className="py-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-foreground font-medium">Processing completion...</p>
            <p className="text-sm text-muted-foreground mt-1">
              {uploadingPhotos
                ? "Uploading photos..."
                : isWebsiteBooking
                ? "Charging customer and generating invoice..."
                : "Marking job as complete..."}
            </p>
          </div>
        )}

        {/* STEP: Manual Options (Path B) */}
        {step === "options" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Job Complete — Choose Payment Method</DialogTitle>
              <DialogDescription>
                How would you like to collect payment for this job?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              <button
                onClick={handleGenerateInvoice}
                disabled={isProcessing}
                className="w-full flex items-start gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground text-sm">Generate Invoice</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Create an invoice you can email or download. Mark as paid when the client pays you directly.
                  </p>
                </div>
              </button>

              <button
                onClick={handleSendPaymentLink}
                disabled={isProcessing}
                className="w-full flex items-start gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Link2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground text-sm">Send Stripe Payment Link</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Generate a secure payment link to send your client. Payment is tracked automatically.
                  </p>
                </div>
              </button>

              {isProcessing && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
                  <span className="text-sm text-muted-foreground">Processing...</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* STEP: Done */}
        {step === "done" && (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="w-14 h-14 text-primary mx-auto" />
            <div>
              <h3 className="font-display text-lg font-bold text-foreground">Done!</h3>
              <p className="text-sm text-muted-foreground mt-1">{result}</p>
            </div>

            {paymentLinkUrl && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Payment Link</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-background rounded px-2 py-1 flex-1 truncate border">
                    {paymentLinkUrl}
                  </code>
                  <Button variant="outline" size="sm" onClick={copyPaymentLink}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={paymentLinkUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            )}

            <Button onClick={handleClose} className="mt-2">Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default JobCompletionDialog;
