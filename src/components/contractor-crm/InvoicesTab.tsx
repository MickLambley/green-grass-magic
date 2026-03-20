import { useState, useEffect, useMemo } from "react";
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
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Pencil, Loader2, Receipt, Trash2, Send, DollarSign, Download, Mail, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import type { Tables, Json } from "@/integrations/supabase/types";
import ClientEmailEditDialog from "./ClientEmailEditDialog";
import { generateInvoicePdf } from "@/lib/generateInvoicePdf";

type Invoice = Tables<"invoices">;
type Client = Tables<"clients">;
type Contractor = Tables<"contractors">;

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface InvoicesTabProps {
  contractorId: string;
  gstRegistered: boolean;
  contractor: Contractor;
}

interface ContractorInfo {
  business_name: string | null;
  phone: string | null;
  business_logo_url: string | null;
}

type EnrichedInvoice = Invoice & { client_name?: string; client_email?: string; display_status?: string; stripe_payment_url?: string; sent_at?: string | null };

const STATUS_BADGES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  unpaid: "bg-sunshine/20 text-sunshine border-sunshine/30",
  overdue: "bg-destructive/20 text-destructive border-destructive/30 font-bold",
  paid: "bg-primary/20 text-primary border-primary/30",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  unpaid: "Unpaid",
  overdue: "Overdue",
  paid: "Paid",
};

function computeDisplayStatus(invoice: Invoice): string {
  if (invoice.status === "paid") return "paid";
  if (invoice.due_date && isBefore(new Date(invoice.due_date), startOfDay(new Date())) && invoice.status !== "paid") {
    return "overdue";
  }
  // Treat legacy "sent" status as "unpaid"
  if (invoice.status === "sent") return "unpaid";
  return invoice.status || "draft";
}

function getDefaultDueDays(contractor: Contractor): number {
  const responses = (contractor.questionnaire_responses as Record<string, unknown>) || {};
  const terms = responses.default_payment_terms as string | undefined;
  if (!terms) return 7;
  if (terms === "custom") {
    const customDays = responses.default_payment_terms_custom_days as number | undefined;
    return customDays || 14;
  }
  const days = parseInt(terms);
  return isNaN(days) ? 7 : days;
}

function getDefaultInvoiceNotes(contractor: Contractor): string {
  const responses = (contractor.questionnaire_responses as Record<string, unknown>) || {};
  return (responses.default_invoice_notes as string) || "";
}

/** Validate ABN format: 11 digits, optionally with spaces */
function isValidAbnFormat(abn: string): boolean {
  const digits = abn.replace(/\s/g, "");
  return /^\d{11}$/.test(digits);
}

/** Format ABN as XX XXX XXX XXX */
function formatAbn(abn: string): string {
  const digits = abn.replace(/\s/g, "");
  if (digits.length !== 11) return abn;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}

const InvoicesTab = ({ contractorId, gstRegistered, contractor }: InvoicesTabProps) => {
  const [invoices, setInvoices] = useState<EnrichedInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [stripePaymentUrls, setStripePaymentUrls] = useState<Record<string, string>>({});
  const [nextJob, setNextJob] = useState<{ title: string; date: string; client_id: string; client_name: string; total_price: number | null } | null>(null);
  const [contractorInfo, setContractorInfo] = useState<ContractorInfo>({ business_name: contractor.business_name, phone: contractor.phone, business_logo_url: contractor.business_logo_url });

  // Payment method checks
  const responses = (contractor.questionnaire_responses as Record<string, unknown>) || {};
  const hasStripe = !!(contractor.stripe_account_id && contractor.stripe_onboarding_complete);
  const hasBankTransfer = !!(contractor.bank_bsb && contractor.bank_account_number);
  const hasAnyPaymentMethod = hasStripe || hasBankTransfer;
  const bankAccountName = (responses.bank_account_name as string) || contractor.business_name || "";

  // ABN checks
  const contractorAbn = contractor.abn || "";
  const hasAbn = !!contractorAbn.trim();
  const abnFormatValid = hasAbn && isValidAbnFormat(contractorAbn);

  // Email edit dialog state
  const [emailEditOpen, setEmailEditOpen] = useState(false);
  const [emailEditClientId, setEmailEditClientId] = useState("");
  const [emailEditClientName, setEmailEditClientName] = useState("");
  const [emailEditCurrentEmail, setEmailEditCurrentEmail] = useState("");

  const [form, setForm] = useState({
    client_id: "",
    invoice_number: "",
    due_date: "",
    notes: "",
    status: "draft",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "Lawn Mowing", quantity: 1, unit_price: 0 }]);

  useEffect(() => {
    fetchData();
  }, [contractorId]);

  const fetchData = async () => {
    setIsLoading(true);
    const [invoicesRes, clientsRes, nextJobRes] = await Promise.all([
      supabase.from("invoices").select("*").eq("contractor_id", contractorId).order("created_at", { ascending: false }),
      supabase.from("clients").select("*").eq("contractor_id", contractorId).order("name"),
      supabase.from("jobs").select("id, title, scheduled_date, client_id, total_price").eq("contractor_id", contractorId).eq("status", "scheduled").order("scheduled_date").limit(1),
    ]);

    if (clientsRes.data) setClients(clientsRes.data);
    if (invoicesRes.data && clientsRes.data) {
      const clientMap = new Map(clientsRes.data.map((c) => [c.id, { name: c.name, email: c.email }]));
      const enriched = invoicesRes.data.map((inv) => ({
        ...inv,
        client_name: clientMap.get(inv.client_id)?.name || "Unknown",
        client_email: clientMap.get(inv.client_id)?.email || undefined,
        display_status: computeDisplayStatus(inv),
      }));
      const statusOrder: Record<string, number> = { overdue: 0, unpaid: 1, draft: 2, paid: 3 };
      enriched.sort((a, b) => (statusOrder[a.display_status || "draft"] ?? 2) - (statusOrder[b.display_status || "draft"] ?? 2));
      setInvoices(enriched);

      if (nextJobRes.data && nextJobRes.data.length > 0) {
        const j = nextJobRes.data[0];
        const clientName = clientMap.get(j.client_id)?.name || "Unknown";
        setNextJob({ title: j.title, date: j.scheduled_date, client_id: j.client_id, client_name: clientName, total_price: j.total_price });
      }
    }
    setIsLoading(false);
  };

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const selectedClient = form.client_id ? clientMap.get(form.client_id) : null;

  // GST-inclusive calculation: prices entered are GST-inclusive
  // GST = subtotal / 11 (Australian method)
  const calcSubtotal = () => lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
  const calcGst = () => gstRegistered ? Math.round(calcSubtotal() / 11 * 100) / 100 : 0;
  const calcTotal = () => calcSubtotal(); // Total = subtotal (GST-inclusive), GST is a component
  const calcSubtotalExGst = () => gstRegistered ? calcSubtotal() - calcGst() : calcSubtotal();

  const getDefaultDueDate = (): string => {
    const days = getDefaultDueDays(contractor);
    if (days === null) return "";
    return format(addDays(new Date(), days), "yyyy-MM-dd");
  };

  const openCreateDialog = (prefillClientId?: string, prefillPrice?: number | null) => {
    setEditingInvoice(null);
    const nextNum = `INV-${String(invoices.length + 1).padStart(4, "0")}`;
    const defaultNotes = getDefaultInvoiceNotes(contractor);
    setForm({
      client_id: prefillClientId || clients[0]?.id || "",
      invoice_number: nextNum,
      due_date: getDefaultDueDate(),
      notes: defaultNotes,
      status: "draft",
    });
    const price = prefillPrice ? Number(prefillPrice) : 0;
    setLineItems([{ description: "Lawn Mowing", quantity: 1, unit_price: price }]);
    setDialogOpen(true);
  };

  const openEditDialog = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setForm({
      client_id: invoice.client_id,
      invoice_number: invoice.invoice_number || "",
      due_date: invoice.due_date || (!invoice.due_date ? getDefaultDueDate() : ""),
      notes: invoice.notes || "",
      status: invoice.status,
    });
    const items = Array.isArray(invoice.line_items) ? (invoice.line_items as unknown as LineItem[]) : [];
    setLineItems(items.length > 0 ? items : [{ description: "", quantity: 1, unit_price: 0 }]);
    setDialogOpen(true);
  };

  const generatePaymentLink = async (invoiceId: string) => {
    if (!hasStripe) return;
    try {
      const { data } = await supabase.functions.invoke("generate-invoice-payment-link", { body: { invoiceId } });
      if (data?.stripePaymentUrl) {
        setStripePaymentUrls(prev => ({ ...prev, [invoiceId]: data.stripePaymentUrl }));
      }
    } catch {
      console.warn("Failed to generate payment link");
    }
  };

  const handleSave = async (andSend = false) => {
    if (!form.client_id) { toast.error("Select a client"); return; }

    const client = clientMap.get(form.client_id);
    if (andSend && !client?.email) {
      toast.error(`No email address for ${client?.name || "this client"}. Add an email first.`);
      return;
    }

    setIsSaving(true);
    const validItems = lineItems.filter((li) => li.description.trim());
    const subtotal = validItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
    const gstAmount = gstRegistered ? Math.round(subtotal / 11 * 100) / 100 : 0;
    const total = subtotal;

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

    let savedId: string | null = null;

    if (editingInvoice) {
      const totalChanged = Number(editingInvoice.total) !== total;
      if (totalChanged) {
        (payload as any).stripe_payment_url = null;
      }
      const { error } = await supabase.from("invoices").update(payload).eq("id", editingInvoice.id);
      if (error) { toast.error("Failed to update invoice"); setIsSaving(false); return; }
      toast.success("Invoice updated");
      savedId = editingInvoice.id;
      if (totalChanged) generatePaymentLink(editingInvoice.id);
    } else {
      const { data: inserted, error } = await supabase.from("invoices").insert(payload).select("id").single();
      if (error) { toast.error("Failed to create invoice"); setIsSaving(false); return; }
      toast.success("Invoice created");
      savedId = inserted?.id || null;
      if (savedId) generatePaymentLink(savedId);
    }

    setDialogOpen(false);
    await fetchData();

    if (andSend && savedId && client?.email) {
      await handleSendInvoice(savedId, client.email, client.name);
    }

    setIsSaving(false);
  };

  const handleSendInvoice = async (invoiceId: string, clientEmail?: string, clientName?: string) => {
    if (!clientEmail) {
      toast.error(`No email address for ${clientName || "this client"}. Tap 'Add Email' to fix this.`);
      return;
    }
    setSendingId(invoiceId);
    try {
      const { data, error } = await supabase.functions.invoke("send-invoice", { body: { invoiceId } });
      if (error) throw error;
      // Store stripe payment URL if returned
      if (data?.stripePaymentUrl) {
        setStripePaymentUrls(prev => ({ ...prev, [invoiceId]: data.stripePaymentUrl }));
      }
      // Mark as sent and transition draft → unpaid
      await supabase.from("invoices").update({ 
        sent_at: new Date().toISOString(),
        status: 'unpaid',
      }).eq("id", invoiceId).in("status", ["draft", "sent", "unpaid"]);
      toast.success(`Invoice sent to ${clientEmail}`);
      fetchData();
    } catch {
      toast.error("Failed to send invoice");
    }
    setSendingId(null);
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
    if (error) toast.error("Failed to delete invoice");
    else { toast.success("Invoice deleted"); fetchData(); }
  };

  const handleMarkInvoicePaid = async (invoiceId: string) => {
    const { error } = await supabase.from("invoices").update({
      status: "paid",
      paid_at: new Date().toISOString(),
    }).eq("id", invoiceId);
    if (error) toast.error("Failed to update invoice");
    else { toast.success("Invoice marked as paid"); fetchData(); }
  };

  const getPaymentDetails = (invoiceId?: string) => ({
    hasBankTransfer,
    bankBsb: contractor.bank_bsb,
    bankAccountNumber: contractor.bank_account_number,
    bankAccountName,
    hasStripe,
    stripePaymentUrl: invoiceId ? (stripePaymentUrls[invoiceId] || invoices.find(i => i.id === invoiceId)?.stripe_payment_url || null) : null,
    businessName: contractor.business_name,
    phone: contractor.phone,
  });

  const handleDownloadPdf = async (inv: EnrichedInvoice) => {
    const items = Array.isArray(inv.line_items) ? (inv.line_items as unknown as LineItem[]) : [];
    const client = clientMap.get(inv.client_id);
    const subtotal = Number(inv.subtotal);
    const gstAmount = Number(inv.gst_amount);
    const total = Number(inv.total);

    await generateInvoicePdf({
      invoiceNumber: inv.invoice_number || "Invoice",
      createdAt: format(new Date(inv.created_at), "dd MMM yyyy"),
      dueDate: inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : null,
      clientName: inv.client_name || "Client",
      clientAbn: (client as any)?.client_abn || null,
      clientIsBusinessClient: (client as any)?.business_client || false,
      contractorBusinessName: contractorInfo.business_name || "Business",
      contractorAbn: contractorAbn || null,
      contractorPhone: contractorInfo.phone,
      contractorLogoUrl: contractorInfo.business_logo_url,
      lineItems: items,
      subtotal,
      gstAmount,
      total,
      gstRegistered,
      notes: inv.notes,
      paymentDetails: getPaymentDetails(inv.id),
    });

    // Transition draft → unpaid on download
    if (inv.status === "draft") {
      await supabase.from("invoices").update({ status: "unpaid" }).eq("id", inv.id);
      fetchData();
    }
  };

  const handleDownloadCurrentDialog = async () => {
    const client = selectedClient;
    const validItems = lineItems.filter((li) => li.description.trim());
    const subtotal = validItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
    const gstAmount = gstRegistered ? Math.round(subtotal / 11 * 100) / 100 : 0;
    const total = subtotal;

    await generateInvoicePdf({
      invoiceNumber: form.invoice_number || "Invoice",
      createdAt: editingInvoice ? format(new Date(editingInvoice.created_at), "dd MMM yyyy") : format(new Date(), "dd MMM yyyy"),
      dueDate: form.due_date ? format(new Date(form.due_date), "dd MMM yyyy") : null,
      clientName: client?.name || "Client",
      clientAbn: (client as any)?.client_abn || null,
      clientIsBusinessClient: (client as any)?.business_client || false,
      contractorBusinessName: contractorInfo.business_name || "Business",
      contractorAbn: contractorAbn || null,
      contractorPhone: contractorInfo.phone,
      contractorLogoUrl: contractorInfo.business_logo_url,
      lineItems: validItems,
      subtotal,
      gstAmount,
      total,
      gstRegistered,
      notes: form.notes.trim() || null,
      paymentDetails: getPaymentDetails(editingInvoice?.id),
    });
  };

  const openEmailEdit = (clientId: string, clientName: string, currentEmail: string) => {
    setEmailEditClientId(clientId);
    setEmailEditClientName(clientName);
    setEmailEditCurrentEmail(currentEmail);
    setEmailEditOpen(true);
  };

  const handleEmailSaved = (newEmail: string) => {
    setClients((prev) => prev.map((c) => c.id === emailEditClientId ? { ...c, email: newEmail } : c));
    setInvoices((prev) => prev.map((inv) => inv.client_id === emailEditClientId ? { ...inv, client_email: newEmail } : inv));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const defaultDueDays = getDefaultDueDays(contractor);

  // Check for client ABN warning on $1000+ invoices for business clients
  const currentTotal = calcTotal();
  const needsClientAbn = gstRegistered && currentTotal >= 1000 && selectedClient && (selectedClient as any).business_client && !(selectedClient as any).client_abn;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Payment methods warning banner */}
      {!hasAnyPaymentMethod && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            No payment methods configured — your clients cannot pay invoices online.{" "}
            Add bank details or connect Stripe in{" "}
            <button type="button" className="underline font-medium" onClick={() => { /* navigate handled by parent */ }}>
              Settings →
            </button>
          </span>
        </div>
      )}

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
        <Button onClick={() => openCreateDialog()} disabled={clients.length === 0}>
          <Plus className="w-4 h-4 mr-2" /> New {gstRegistered ? "Tax Invoice" : "Invoice"}
        </Button>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="w-12 h-12 text-muted-foreground/50 mb-4" />
            {nextJob ? (
              <>
                <h3 className="font-display font-semibold text-lg text-foreground mb-1">No invoices yet</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Your next job is <strong>{nextJob.title}</strong> on <strong>{format(new Date(nextJob.date), "dd MMM yyyy")}</strong>. Send the invoice now?
                </p>
                <Button onClick={() => openCreateDialog(nextJob.client_id, nextJob.total_price)} size="sm">
                  <Plus className="w-4 h-4 mr-1" /> New Invoice
                </Button>
              </>
            ) : (
              <>
                <h3 className="font-display font-semibold text-lg text-foreground mb-1">No invoices yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Create your first invoice for a client.</p>
                {clients.length > 0 && <Button onClick={() => openCreateDialog()} size="sm"><Plus className="w-4 h-4 mr-1" /> New Invoice</Button>}
              </>
            )}
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
                <TableHead className="w-[160px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const hasEmail = !!inv.client_email;
                const displayStatus = inv.display_status || "draft";
                const isOverdue = displayStatus === "overdue";
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.client_name}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {format(new Date(inv.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className={`hidden md:table-cell ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span>${Number(inv.total).toFixed(2)}</span>
                        {gstRegistered && (
                          <span className="block text-[10px] text-muted-foreground">inc. GST</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={STATUS_BADGES[displayStatus] || ""}>
                          {STATUS_LABELS[displayStatus] || displayStatus}
                        </Badge>
                        <Badge variant="outline" className={
                          (inv as any).sent_at
                            ? "bg-sky-100 text-sky-700 border-sky-200 text-[10px]"
                            : "bg-muted text-muted-foreground border-border text-[10px]"
                        }>
                          {(inv as any).sent_at ? "Sent" : "Not Sent"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TooltipProvider delayDuration={300}>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(inv)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>

                          {displayStatus !== "paid" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleMarkInvoicePaid(inv.id)} title="Mark as Paid">
                                  <DollarSign className="w-4 h-4 text-primary" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark as Paid</TooltipContent>
                            </Tooltip>
                          )}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleDownloadPdf(inv)}>
                                <Download className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download PDF</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this invoice?")) handleDeleteInvoice(inv.id); }}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>

                          {hasEmail ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleSendInvoice(inv.id, inv.client_email, inv.client_name)}
                                  disabled={sendingId === inv.id}
                                >
                                  {sendingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-primary" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Send to {inv.client_email}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-amber-500 hover:text-amber-600"
                                  onClick={() => openEmailEdit(inv.client_id, inv.client_name || "Client", "")}
                                >
                                  <Mail className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Client has no email — tap to add</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                );
              })}
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
            {/* ABN warning */}
            {!hasAbn && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Your ABN is missing — it is required on all Australian invoices.{" "}
                  <span className="font-medium">Add your ABN in Settings →</span>
                </span>
              </div>
            )}
            {hasAbn && !abnFormatValid && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Your ABN format looks incorrect — please check it in Settings.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Client *</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedClient && (
                  selectedClient.email ? (
                    <div className="flex items-center gap-1.5 text-xs text-primary">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{selectedClient.email}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {selectedClient.name} has no email address — invoice cannot be sent by email.{" "}
                        <button
                          type="button"
                          className="underline font-medium hover:text-amber-700"
                          onClick={() => openEmailEdit(selectedClient.id, selectedClient.name, "")}
                        >
                          Add email →
                        </button>
                      </span>
                    </div>
                  )
                )}
              </div>
              <div className="space-y-2">
                <Label>Invoice #</Label>
                <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Default: {defaultDueDays} days</p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Line Items {gstRegistered && <span className="text-xs text-muted-foreground font-normal">(prices inc. GST)</span>}</Label>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-1">
                <span className="flex-1">Description</span>
                <span className="w-16 text-center">Qty</span>
                <span className="w-24 text-right">Rate ($)</span>
                {lineItems.length > 1 && <span className="w-9" />}
              </div>
              <div className="space-y-2">
                {lineItems.map((li, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={li.description} onChange={(e) => updateLineItem(i, "description", e.target.value)} placeholder="Description" className="flex-1" />
                    <Input type="number" value={li.quantity} onChange={(e) => updateLineItem(i, "quantity", parseInt(e.target.value) || 0)} className="w-16 text-center" min={1} />
                    <div className="relative w-24">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input type="number" step="0.01" value={li.unit_price} onChange={(e) => updateLineItem(i, "unit_price", parseFloat(e.target.value) || 0)} className="pl-6" placeholder="0.00" />
                    </div>
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
                {gstRegistered ? (
                  <>
                    <p className="text-sm text-muted-foreground">Subtotal (ex. GST): ${calcSubtotalExGst().toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">GST (10%): ${calcGst().toFixed(2)}</p>
                    <p className="font-semibold text-foreground">Total (inc. GST): ${calcTotal().toFixed(2)}</p>
                  </>
                ) : (
                  <p className="font-semibold text-foreground">Total: ${calcTotal().toFixed(2)}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment terms, notes..." rows={2} />
            </div>

            {/* Client ABN warning for $1000+ business invoices */}
            {needsClientAbn && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  This invoice is $1,000 or more — client ABN is required for a compliant Tax Invoice.{" "}
                  <button
                    type="button"
                    className="underline font-medium hover:text-amber-700"
                    onClick={() => {
                      if (selectedClient) {
                        setDialogOpen(false);
                        // The parent will need to handle navigation to edit client
                      }
                    }}
                  >
                    Add ABN →
                  </button>
                </span>
              </div>
            )}

            {/* Payment method warning in dialog */}
            {!hasAnyPaymentMethod && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  You have no payment methods set up — clients won't know how to pay this invoice.{" "}
                  Set up bank transfer details or connect Stripe in Settings →
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {editingInvoice && (
              <Button variant="outline" size="sm" onClick={handleDownloadCurrentDialog} className="mr-auto">
                <Download className="w-4 h-4 mr-1" /> Download PDF
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" /> Save & Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Edit Dialog */}
      <ClientEmailEditDialog
        open={emailEditOpen}
        onOpenChange={setEmailEditOpen}
        clientId={emailEditClientId}
        clientName={emailEditClientName}
        currentEmail={emailEditCurrentEmail}
        onSaved={handleEmailSaved}
      />
    </div>
  );
};

export default InvoicesTab;
