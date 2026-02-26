import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Loader2, Receipt, Trash2, Send, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Tables, Json } from "@/integrations/supabase/types";

type Invoice = Tables<"invoices">;
type Client = Tables<"clients">;

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface InvoicesTabProps {
  contractorId: string;
  gstRegistered: boolean;
}

const statusColors: Record<string, string> = {
  unpaid: "bg-sunshine/20 text-sunshine border-sunshine/30",
  paid: "bg-primary/20 text-primary border-primary/30",
  overdue: "bg-destructive/20 text-destructive border-destructive/30",
};

const InvoicesTab = ({ contractorId, gstRegistered }: InvoicesTabProps) => {
  const [invoices, setInvoices] = useState<(Invoice & { client_name?: string; client_email?: string })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    client_id: "",
    invoice_number: "",
    due_date: "",
    notes: "",
    status: "unpaid",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "Lawn Mowing", quantity: 1, unit_price: 0 }]);

  useEffect(() => {
    fetchData();
  }, [contractorId]);

  const fetchData = async () => {
    setIsLoading(true);
    const [invoicesRes, clientsRes] = await Promise.all([
      supabase.from("invoices").select("*").eq("contractor_id", contractorId).order("created_at", { ascending: false }),
      supabase.from("clients").select("*").eq("contractor_id", contractorId).order("name"),
    ]);

    if (clientsRes.data) setClients(clientsRes.data);
    if (invoicesRes.data && clientsRes.data) {
      const clientMap = new Map(clientsRes.data.map((c) => [c.id, { name: c.name, email: c.email }]));
      setInvoices(invoicesRes.data.map((inv) => ({
        ...inv,
        client_name: clientMap.get(inv.client_id)?.name || "Unknown",
        client_email: clientMap.get(inv.client_id)?.email || undefined,
      })));
    }
    setIsLoading(false);
  };

  const calcSubtotal = () => lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
  const calcGst = () => gstRegistered ? calcSubtotal() * 0.1 : 0;
  const calcTotal = () => calcSubtotal() + calcGst();

  const openCreateDialog = () => {
    setEditingInvoice(null);
    const nextNum = `INV-${String(invoices.length + 1).padStart(4, "0")}`;
    setForm({ client_id: clients[0]?.id || "", invoice_number: nextNum, due_date: "", notes: "", status: "unpaid" });
    setLineItems([{ description: "Lawn Mowing", quantity: 1, unit_price: 0 }]);
    setDialogOpen(true);
  };

  const openEditDialog = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setForm({
      client_id: invoice.client_id,
      invoice_number: invoice.invoice_number || "",
      due_date: invoice.due_date || "",
      notes: invoice.notes || "",
      status: invoice.status,
    });
    const items = Array.isArray(invoice.line_items) ? (invoice.line_items as unknown as LineItem[]) : [];
    setLineItems(items.length > 0 ? items : [{ description: "", quantity: 1, unit_price: 0 }]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.client_id) { toast.error("Select a client"); return; }

    setIsSaving(true);
    const validItems = lineItems.filter((li) => li.description.trim());
    const subtotal = validItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
    const gstAmount = gstRegistered ? subtotal * 0.1 : 0;
    const total = subtotal + gstAmount;

    const payload = {
      contractor_id: contractorId,
      client_id: form.client_id,
      invoice_number: form.invoice_number.trim() || null,
      line_items: validItems as unknown as Json,
      subtotal,
      gst_amount: gstAmount,
      total,
      due_date: form.due_date || null,
      notes: form.notes.trim() || null,
      status: form.status,
      paid_at: form.status === "paid" ? new Date().toISOString() : null,
    };

    if (editingInvoice) {
      const { error } = await supabase.from("invoices").update(payload).eq("id", editingInvoice.id);
      if (error) toast.error("Failed to update invoice");
      else { toast.success("Invoice updated"); setDialogOpen(false); fetchData(); }
    } else {
      const { error } = await supabase.from("invoices").insert(payload);
      if (error) toast.error("Failed to create invoice");
      else { toast.success("Invoice created"); setDialogOpen(false); fetchData(); }
    }
    setIsSaving(false);
  };

  const handleSendInvoice = async (invoiceId: string, clientEmail?: string) => {
    if (!clientEmail) {
      toast.error("Client has no email address. Add an email first.");
      return;
    }

    setSendingId(invoiceId);
    try {
      const { data, error } = await supabase.functions.invoke("send-invoice", {
        body: { invoiceId },
      });

      if (error) throw error;
      toast.success(`Invoice sent to ${clientEmail}`);
    } catch (err) {
      toast.error("Failed to send invoice");
    }
    setSendingId(null);
  };

  const handleMarkInvoicePaid = async (invoiceId: string) => {
    const { error } = await supabase.from("invoices").update({
      status: "paid",
      paid_at: new Date().toISOString(),
    }).eq("id", invoiceId);
    if (error) toast.error("Failed to update invoice");
    else { toast.success("Invoice marked as paid"); fetchData(); }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="font-display font-semibold text-lg text-foreground">
            {gstRegistered ? "Tax Invoices" : "Invoices"}
          </h3>
          {gstRegistered && (
            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
              GST Registered
            </Badge>
          )}
        </div>
        <Button onClick={openCreateDialog} disabled={clients.length === 0}>
          <Plus className="w-4 h-4 mr-2" /> New {gstRegistered ? "Tax Invoice" : "Invoice"}
        </Button>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-display font-semibold text-lg text-foreground mb-1">No invoices yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first invoice for a client.</p>
            {clients.length > 0 && <Button onClick={openCreateDialog} size="sm"><Plus className="w-4 h-4 mr-1" /> New Invoice</Button>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="hidden md:table-cell">Due</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.client_name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {format(new Date(inv.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell>${Number(inv.total).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[inv.status] || ""}>
                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(inv)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {inv.status === "unpaid" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMarkInvoicePaid(inv.id)}
                          title="Mark as Paid"
                        >
                          <DollarSign className="w-4 h-4 text-primary" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSendInvoice(inv.id, inv.client_email)}
                        disabled={sendingId === inv.id}
                        title={inv.client_email ? `Send to ${inv.client_email}` : "No client email"}
                      >
                        {sendingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-primary" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingInvoice ? "Edit" : "New"} {gstRegistered ? "Tax Invoice" : "Invoice"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Client *</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Invoice #</Label>
                <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              {editingInvoice && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Line Items</Label>
              <div className="space-y-2">
                {lineItems.map((li, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={li.description} onChange={(e) => updateLineItem(i, "description", e.target.value)} placeholder="Description" className="flex-1" />
                    <Input type="number" value={li.quantity} onChange={(e) => updateLineItem(i, "quantity", parseInt(e.target.value) || 0)} className="w-16" min={1} />
                    <Input type="number" step="0.01" value={li.unit_price} onChange={(e) => updateLineItem(i, "unit_price", parseFloat(e.target.value) || 0)} className="w-24" placeholder="$0.00" />
                    {lineItems.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => setLineItems(lineItems.filter((_, idx) => idx !== i))}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setLineItems([...lineItems, { description: "", quantity: 1, unit_price: 0 }])}>
                <Plus className="w-3 h-3 mr-1" /> Add Line
              </Button>
              <div className="text-right space-y-1">
                <p className="text-sm text-muted-foreground">Subtotal: ${calcSubtotal().toFixed(2)}</p>
                {gstRegistered && <p className="text-sm text-muted-foreground">GST (10%): ${calcGst().toFixed(2)}</p>}
                <p className="font-semibold text-foreground">Total: ${calcTotal().toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment terms, notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingInvoice ? "Save" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesTab;
