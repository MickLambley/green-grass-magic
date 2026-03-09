import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Send, DollarSign, Clock } from "lucide-react";
import { toast } from "sonner";

interface QuoteResponseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    id: string;
    title: string;
    client_name: string;
    description: string | null;
    customer_email?: string | null;
  } | null;
  contractorId: string;
  onQuoteSent: () => void;
}

const QuoteResponseDialog = ({ open, onOpenChange, job, contractorId, onQuoteSent }: QuoteResponseDialogProps) => {
  const [quoteType, setQuoteType] = useState<"fixed" | "hourly">("fixed");
  const [fixedPrice, setFixedPrice] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [notes, setNotes] = useState("");
  const [isSending, setIsSending] = useState(false);

  const calculatedTotal = quoteType === "fixed"
    ? parseFloat(fixedPrice) || 0
    : (parseFloat(hourlyRate) || 0) * (parseFloat(estimatedHours) || 0);

  const canSend = calculatedTotal > 0;

  const handleSend = async () => {
    if (!job || !canSend) return;
    setIsSending(true);

    try {
      // Update job with quote details
      const { error: updateErr } = await supabase.from("jobs").update({
        quote_type: quoteType,
        quoted_rate: quoteType === "hourly" ? parseFloat(hourlyRate) : null,
        quoted_hours: quoteType === "hourly" ? parseFloat(estimatedHours) : null,
        total_price: calculatedTotal,
        quote_status: "quoted",
        notes: notes.trim() || null,
      }).eq("id", job.id);

      if (updateErr) throw new Error("Failed to save quote");

      // Send quote email to customer via edge function
      const { error: emailErr } = await supabase.functions.invoke("send-job-quote", {
        body: { jobId: job.id },
      });

      if (emailErr) {
        toast.warning("Quote saved but email failed to send");
      } else {
        toast.success(`Quote of $${calculatedTotal.toFixed(2)} sent to ${job.client_name}`);
      }

      onOpenChange(false);
      onQuoteSent();
    } catch (err: any) {
      toast.error(err.message || "Failed to send quote");
    }
    setIsSending(false);
  };

  const handleClose = () => {
    setQuoteType("fixed");
    setFixedPrice("");
    setHourlyRate("");
    setEstimatedHours("");
    setNotes("");
    onOpenChange(false);
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Send Quote
          </DialogTitle>
          <DialogDescription>
            Quote for "{job.title}" — {job.client_name}
          </DialogDescription>
        </DialogHeader>

        {job.description && (
          <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground text-xs mb-1">Service requested:</p>
            {job.description}
          </div>
        )}

        <div className="space-y-4">
          {/* Quote Type */}
          <div className="space-y-3">
            <Label>Pricing Type</Label>
            <RadioGroup value={quoteType} onValueChange={(v) => setQuoteType(v as "fixed" | "hourly")} className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  quoteType === "fixed" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value="fixed" />
                <div>
                  <div className="flex items-center gap-1.5 font-medium text-sm text-foreground">
                    <DollarSign className="w-4 h-4" /> Fixed Price
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">One set price for the job</p>
                </div>
              </label>
              <label
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  quoteType === "hourly" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value="hourly" />
                <div>
                  <div className="flex items-center gap-1.5 font-medium text-sm text-foreground">
                    <Clock className="w-4 h-4" /> Hourly Rate
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Rate × estimated hours</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Pricing Inputs */}
          {quoteType === "fixed" ? (
            <div className="space-y-2">
              <Label>Fixed Price ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={fixedPrice}
                onChange={(e) => setFixedPrice(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Hourly Rate ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Estimated Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="1"
                />
              </div>
            </div>
          )}

          {/* Total Preview */}
          {calculatedTotal > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex justify-between items-center">
              <span className="text-sm font-medium text-foreground">Quoted Total</span>
              <span className="text-lg font-bold text-primary">${calculatedTotal.toFixed(2)}</span>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details about the quote..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={!canSend || isSending}>
            {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
            Send Quote {calculatedTotal > 0 ? `($${calculatedTotal.toFixed(2)})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuoteResponseDialog;
