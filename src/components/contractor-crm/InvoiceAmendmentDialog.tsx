import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  type: "fixed" | "hourly";
}

interface InvoiceAmendmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    id: string;
    title: string;
    total_price: number | null;
    quote_type: string | null;
    quoted_rate: number | null;
    quoted_hours: number | null;
  } | null;
  contractorId: string;
  gstRegistered: boolean;
  onComplete: () => void;
}

const InvoiceAmendmentDialog = ({ open, onOpenChange, job, contractorId, gstRegistered, onComplete }: InvoiceAmendmentDialogProps) => {
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (job && open) {
      // Pre-populate from job quote
      if (job.quote_type === "hourly" && job.quoted_rate) {
        setLineItems([{
          description: job.title,
          quantity: job.quoted_hours || 1,
          unit_price: job.quoted_rate,
          type: "hourly",
        }]);
      } else {
        setLineItems([{
          description: job.title,
          quantity: 1,
          unit_price: job.total_price || 0,
          type: "fixed",
        }]);
      }
    }
  }, [job, open]);

  const addLineItem = () => {
    setLineItems(prev => [...prev, { description: "", quantity: 1, unit_price: 0, type: "fixed" }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, updates: Partial<LineItem>) => {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const subtotal = lineItems.reduce((sum, item) => {
    const itemTotal = item.type === "hourly"
      ? item.quantity * item.unit_price
      : item.quantity * item.unit_price;
    return sum + itemTotal;
  }, 0);

  const gstAmount = gstRegistered ? subtotal * 0.1 : 0;
  const total = subtotal + gstAmount;

  const handleSave = async () => {
    if (!job || lineItems.length === 0) return;
    if (lineItems.some(item => !item.description.trim())) {
      toast.error("All line items need a description");
      return;
    }

    setIsSaving(true);
    try {
      // Update job total price
      await supabase.from("jobs").update({
        total_price: subtotal,
      }).eq("id", job.id);

      // Create/update invoice with amended line items
      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

      // Check for existing invoice
      const { data: existing } = await supabase
        .from("invoices")
        .select("id")
        .eq("job_id", job.id)
        .eq("contractor_id", contractorId)
        .maybeSingle();

      const invoiceData = {
        contractor_id: contractorId,
        job_id: job.id,
        client_id: "", // Will be filled from job
        invoice_number: invoiceNumber,
        line_items: lineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          type: item.type,
        })),
        subtotal,
        gst_amount: gstAmount,
        total,
        status: "unpaid",
      };

      // Get client_id from job
      const { data: jobData } = await supabase.from("jobs").select("client_id").eq("id", job.id).single();
      if (jobData) invoiceData.client_id = jobData.client_id;

      if (existing) {
        await supabase.from("invoices").update({
          line_items: invoiceData.line_items,
          subtotal: invoiceData.subtotal,
          gst_amount: invoiceData.gst_amount,
          total: invoiceData.total,
        }).eq("id", existing.id);
      } else {
        await supabase.from("invoices").insert(invoiceData);
      }

      await supabase.from("jobs").update({ payment_status: "invoiced" }).eq("id", job.id);

      toast.success(`Invoice updated — $${total.toFixed(2)}`);
      onComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save invoice");
    }
    setIsSaving(false);
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Amend Invoice
          </DialogTitle>
          <DialogDescription>
            Adjust line items to reflect the actual work performed for "{job.title}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Line items */}
          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="p-3 rounded-lg border border-border space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, { description: e.target.value })}
                    className="flex-1"
                    maxLength={200}
                  />
                  {lineItems.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" onClick={() => removeLineItem(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 items-end">
                  <div className="w-24">
                    <Label className="text-xs text-muted-foreground">Type</Label>
                    <Select value={item.type} onValueChange={(v) => updateLineItem(index, { type: v as "fixed" | "hourly" })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-20">
                    <Label className="text-xs text-muted-foreground">{item.type === "hourly" ? "Hours" : "Qty"}</Label>
                    <Input
                      type="number"
                      min="0.25"
                      step="0.25"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) || 0 })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs text-muted-foreground">{item.type === "hourly" ? "$/hr" : "Price"}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => updateLineItem(index, { unit_price: Number(e.target.value) || 0 })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="w-20 text-right">
                    <Label className="text-xs text-muted-foreground">Total</Label>
                    <p className="text-sm font-medium text-foreground h-8 flex items-center justify-end">
                      ${(item.quantity * item.unit_price).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addLineItem} className="w-full">
            <Plus className="w-4 h-4 mr-1" /> Add Line Item
          </Button>

          {/* Totals */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">${subtotal.toFixed(2)}</span>
            </div>
            {gstRegistered && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GST (10%)</span>
                <span className="font-medium text-foreground">${gstAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold border-t border-border pt-1 mt-1">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">${total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || lineItems.length === 0}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Save Invoice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceAmendmentDialog;
