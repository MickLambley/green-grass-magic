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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil, Loader2, FileText, Trash2, ArrowRight, UserPlus, Send, Save, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Tables, Json } from "@/integrations/supabase/types";

type Quote = Tables<"quotes">;
type Client = Tables<"clients">;

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface QuotesTabProps {
  contractorId: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sky/20 text-sky border-sky/30",
  accepted: "bg-primary/20 text-primary border-primary/30",
  declined: "bg-destructive/20 text-destructive border-destructive/30",
};

const QuotesTab = ({ contractorId }: QuotesTabProps) => {
  const [quotes, setQuotes] = useState<(Quote & { client_name?: string })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isConverting, setIsConverting] = useState<string | null>(null);

  // Inline new client form
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ name: "", email: "", phone: "" });
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  const [form, setForm] = useState({
    client_id: "",
    notes: "",
    valid_until: "",
    status: "draft",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "Lawn Mowing", quantity: 1, unit_price: 0 }]);

  useEffect(() => {
    fetchData();
  }, [contractorId]);

  const fetchData = async () => {
    setIsLoading(true);
    const [quotesRes, clientsRes] = await Promise.all([
      supabase.from("quotes").select("*").eq("contractor_id", contractorId).order("created_at", { ascending: false }),
      supabase.from("clients").select("*").eq("contractor_id", contractorId).order("name"),
    ]);

    if (clientsRes.data) setClients(clientsRes.data);
    if (quotesRes.data && clientsRes.data) {
      const clientMap = new Map(clientsRes.data.map((c) => [c.id, c.name]));
      setQuotes(quotesRes.data.map((q) => ({ ...q, client_name: clientMap.get(q.client_id) || "Unknown" })));
    }
    setIsLoading(false);
  };

  const calcTotal = () => lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);

  const openCreateDialog = () => {
    setEditingQuote(null);
    setForm({ client_id: clients[0]?.id || "", notes: "", valid_until: "", status: "draft" });
    setLineItems([{ description: "Lawn Mowing", quantity: 1, unit_price: 0 }]);
    setShowNewClient(false);
    setNewClientForm({ name: "", email: "", phone: "" });
    setDialogOpen(true);
  };

  const openEditDialog = (quote: Quote) => {
    setEditingQuote(quote);
    setForm({
      client_id: quote.client_id,
      notes: quote.notes || "",
      valid_until: quote.valid_until || "",
      status: quote.status,
    });
    const items = Array.isArray(quote.line_items) ? (quote.line_items as unknown as LineItem[]) : [];
    setLineItems(items.length > 0 ? items : [{ description: "", quantity: 1, unit_price: 0 }]);
    setShowNewClient(false);
    setDialogOpen(true);
  };

  const handleCreateInlineClient = async () => {
    if (!newClientForm.name.trim()) { toast.error("Client name is required"); return; }
    setIsCreatingClient(true);

    const { data, error } = await supabase
      .from("clients")
      .insert({
        contractor_id: contractorId,
        name: newClientForm.name.trim(),
        email: newClientForm.email.trim() || null,
        phone: newClientForm.phone.trim() || null,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create client");
    } else if (data) {
      setClients((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({ ...prev, client_id: data.id }));
      setShowNewClient(false);
      setNewClientForm({ name: "", email: "", phone: "" });
      toast.success(`Client "${data.name}" created`);
    }
    setIsCreatingClient(false);
  };

  const saveQuote = async (status: string): Promise<string | null> => {
    if (!form.client_id) { toast.error("Select a client"); return null; }
    if (lineItems.every((li) => !li.description.trim())) { toast.error("Add at least one line item"); return null; }

    const validItems = lineItems.filter((li) => li.description.trim());
    const total = validItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);

    const payload = {
      contractor_id: contractorId,
      client_id: form.client_id,
      line_items: validItems as unknown as Json,
      total,
      notes: form.notes.trim() || null,
      valid_until: form.valid_until || null,
      status,
    };

    if (editingQuote) {
      const { error } = await supabase.from("quotes").update(payload).eq("id", editingQuote.id);
      if (error) { toast.error("Failed to update quote"); return null; }
      return editingQuote.id;
    } else {
      const { data, error } = await supabase.from("quotes").insert(payload).select("id").single();
      if (error || !data) { toast.error("Failed to create quote"); return null; }
      return data.id;
    }
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    const id = await saveQuote("draft");
    if (id) {
      toast.success(editingQuote ? "Quote updated" : "Quote saved as draft");
      setDialogOpen(false);
      fetchData();
    }
    setIsSaving(false);
  };

  const handleSaveAndSend = async () => {
    // Check client has email
    const selectedClient = clients.find((c) => c.id === form.client_id);
    if (!selectedClient?.email) {
      toast.error("This client has no email address. Add an email to their profile first.");
      return;
    }

    setIsSending(true);
    const quoteId = await saveQuote("sent");
    if (quoteId) {
      // Trigger send-quote edge function
      const { error } = await supabase.functions.invoke("send-quote", {
        body: { quoteId },
      });
      if (error) {
        toast.error("Quote saved but email failed to send");
      } else {
        toast.success("Quote sent to " + selectedClient.email);
      }
      setDialogOpen(false);
      fetchData();
    }
    setIsSending(false);
  };

  /** Convert an accepted quote into a new job */
  const convertToJob = async (quote: Quote) => {
    setIsConverting(quote.id);
    try {
      const items = Array.isArray(quote.line_items) ? (quote.line_items as unknown as LineItem[]) : [];
      const description = items.map((li) => `${li.description} (x${li.quantity})`).join(", ");

      const { error } = await supabase.from("jobs").insert({
        contractor_id: contractorId,
        client_id: quote.client_id,
        title: items[0]?.description || "Job from Quote",
        description,
        scheduled_date: new Date().toISOString().split("T")[0],
        total_price: Number(quote.total),
        status: "scheduled",
        source: "manual",
      });

      if (error) throw error;

      toast.success("Job created from quote!");
      fetchData();
    } catch {
      toast.error("Failed to create job from quote");
    }
    setIsConverting(null);
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
        <h3 className="font-display font-semibold text-lg text-foreground">Quotes</h3>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" /> New Quote
        </Button>
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-display font-semibold text-lg text-foreground mb-1">No quotes yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first quote for a client.</p>
            <Button onClick={openCreateDialog} size="sm"><Plus className="w-4 h-4 mr-1" /> New Quote</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-medium">{quote.client_name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {format(new Date(quote.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>${Number(quote.total).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[quote.status] || ""}>
                      {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(quote)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {quote.status === "accepted" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => convertToJob(quote)}
                          disabled={isConverting === quote.id}
                          title="Convert to Job"
                        >
                          {isConverting === quote.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4 text-primary" />}
                        </Button>
                      )}
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
            <DialogTitle className="font-display">{editingQuote ? "Edit Quote" : "New Quote"}</DialogTitle>
            <DialogDescription>
              {editingQuote ? "Update the quote details below." : "Create a quote for your client."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Client Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Client *</Label>
                {!showNewClient ? (
                  <div className="space-y-2">
                    <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.email ? ` (${c.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-primary h-7 px-2 text-xs"
                      onClick={() => setShowNewClient(true)}
                    >
                      <UserPlus className="w-3 h-3 mr-1" /> New Client
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">New Client</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewClient(false)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Client name *"
                      value={newClientForm.name}
                      onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Email (for sending quotes)"
                      type="email"
                      value={newClientForm.email}
                      onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Phone"
                      value={newClientForm.phone}
                      onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={handleCreateInlineClient}
                      disabled={isCreatingClient || !newClientForm.name.trim()}
                    >
                      {isCreatingClient ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                      Add Client
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Valid Until</Label>
                <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
              </div>
            </div>

            {editingQuote && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="declined">Declined</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Line Items with Column Headers */}
            <div className="space-y-2">
              <Label>Line Items</Label>
              <div className="space-y-2">
                {/* Column headers */}
                <div className="flex items-center gap-2 px-1">
                  <span className="flex-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Description</span>
                  <span className="w-16 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Qty</span>
                  <span className="w-24 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Rate</span>
                  <span className="w-20 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Total</span>
                  {lineItems.length > 1 && <span className="w-9" />}
                </div>
                {lineItems.map((li, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={li.description}
                      onChange={(e) => updateLineItem(i, "description", e.target.value)}
                      placeholder="Description"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={li.quantity}
                      onChange={(e) => updateLineItem(i, "quantity", parseInt(e.target.value) || 0)}
                      className="w-16 text-center"
                      min={1}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={li.unit_price}
                      onChange={(e) => updateLineItem(i, "unit_price", parseFloat(e.target.value) || 0)}
                      className="w-24"
                      placeholder="$0.00"
                    />
                    <span className="w-20 text-right text-sm font-medium text-foreground tabular-nums">
                      ${(li.quantity * li.unit_price).toFixed(2)}
                    </span>
                    {lineItems.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setLineItems(lineItems.filter((_, idx) => idx !== i))}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setLineItems([...lineItems, { description: "", quantity: 1, unit_price: 0 }])}>
                  <Plus className="w-3 h-3 mr-1" /> Add Line
                </Button>
                <p className="font-semibold text-foreground">Total: ${calcTotal().toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." rows={2} />
            </div>
          </div>

          {/* Split Save Actions */}
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="sm:mr-auto">
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={handleSaveDraft}
              disabled={isSaving || isSending}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
              Save as Draft
            </Button>
            <Button
              onClick={handleSaveAndSend}
              disabled={isSaving || isSending}
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
              Save & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuotesTab;
