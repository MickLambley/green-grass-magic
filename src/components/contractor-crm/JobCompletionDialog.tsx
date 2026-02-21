import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Receipt, Link2, Copy, ExternalLink, DollarSign } from "lucide-react";
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

type CompletionStep = "confirm" | "completing" | "options" | "done";

const JobCompletionDialog = ({ open, onOpenChange, job, onCompleted }: JobCompletionDialogProps) => {
  const [step, setStep] = useState<CompletionStep>("confirm");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleComplete = async () => {
    if (!job) return;
    setStep("completing");
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke("complete-job-v2", {
        body: { jobId: job.id, action: "complete" },
      });

      if (error) throw new Error(error.message || "Failed to complete job");
      if (data?.error) throw new Error(data.error);

      if (data.path === "website_booking") {
        // Auto-charged — show success
        setResult("Payment processed automatically. Invoice and receipt sent.");
        setStep("done");
      } else if (data.path === "manual") {
        // Show invoice options
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
    setStep("confirm");
    setPaymentLinkUrl(null);
    setInvoiceNumber(null);
    setResult(null);
    onOpenChange(false);
    onCompleted();
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
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
                    {job.total_price ? `$${Number(job.total_price).toFixed(2)}` : "Not set"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Source</span>
                  <Badge variant="outline" className="text-xs">
                    {job.source === "website_booking" ? "🌐 Website Booking" : "Manual"}
                  </Badge>
                </div>
              </div>

              {job.source === "website_booking" && (
                <p className="text-sm text-muted-foreground">
                  The customer's saved payment method will be charged automatically upon completion.
                </p>
              )}
              {job.source === "manual" && (
                <p className="text-sm text-muted-foreground">
                  After marking complete, you'll choose how to invoice this job.
                </p>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleComplete}>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Complete Job
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
              {job.source === "website_booking" ? "Charging customer and generating invoice..." : "Marking job as complete..."}
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
                    Create a professional invoice you can email or download. Mark as paid when the client pays you directly.
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
