import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Pencil, Trash2, Loader2, Users, MapPin, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

declare const google: any;
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

type Client = Tables<"clients">;

type FormState = {
  name: string; email: string; phone: string; property_notes: string;
  street: string; city: string; state: string; postcode: string;
  business_client: boolean; client_abn: string;
};

const ClientAddressAutocomplete = ({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !inputRef.current) return;

    const init = () => {
      if (autocompleteRef.current) return;
      const ac = new google.maps.places.Autocomplete(inputRef.current!, {
        componentRestrictions: { country: "au" },
        types: ["address"],
        fields: ["address_components", "formatted_address"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place?.address_components) return;
        let street_number = "", route = "", city = "", state = "", postcode = "";
        for (const c of place.address_components) {
          const t = c.types[0];
          if (t === "street_number") street_number = c.long_name;
          else if (t === "route") route = c.long_name;
          else if (t === "locality" || t === "sublocality_level_1") city = c.long_name;
          else if (t === "administrative_area_level_1") state = c.short_name;
          else if (t === "postal_code") postcode = c.long_name;
        }
        setForm({
          ...formRef.current,
          street: `${street_number} ${route}`.trim(),
          city, state, postcode,
        });
      });
      autocompleteRef.current = ac;
    };

    if ((window as any).google?.maps?.places) { init(); return; }
    if (document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
      const iv = setInterval(() => { if ((window as any).google?.maps?.places) { clearInterval(iv); init(); } }, 100);
      return () => clearInterval(iv);
    }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);

    return () => { if (autocompleteRef.current) { google.maps.event.clearInstanceListeners(autocompleteRef.current); autocompleteRef.current = null; } };
  }, []);

  return (
    <div className="space-y-2">
      <Label>Address</Label>
      <div className="relative">
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={form.street}
          onChange={(e) => setForm({ ...form, street: e.target.value })}
          placeholder="Start typing an address..."
          className="pl-8 mb-2"
          autoComplete="off"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" />
        <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State" />
        <Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} placeholder="Postcode" />
      </div>
    </div>
  );
};

interface ClientsTabProps {
  contractorId: string;
}

const ClientsTab = ({ contractorId }: ClientsTabProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    property_notes: "",
    street: "",
    city: "",
    state: "",
    postcode: "",
    business_client: false,
    client_abn: "",
  });

  useEffect(() => {
    fetchClients();
  }, [contractorId]);

  const fetchClients = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("contractor_id", contractorId)
      .order("name");

    if (error) {
      toast.error("Failed to load clients");
    } else {
      setClients(data || []);
    }
    setIsLoading(false);
  };

  const openCreateDialog = () => {
    setEditingClient(null);
    setForm({ name: "", email: "", phone: "", property_notes: "", street: "", city: "", state: "", postcode: "", business_client: false, client_abn: "" });
    setDialogOpen(true);
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    const addr = client.address as any;
    setForm({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      property_notes: client.property_notes || "",
      street: addr?.street || "",
      city: addr?.city || "",
      state: addr?.state || "",
      postcode: addr?.postcode || "",
      business_client: (client as any).business_client || false,
      client_abn: (client as any).client_abn || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Client name is required");
      return;
    }

    setIsSaving(true);
    const address = form.street || form.city || form.state || form.postcode
      ? { street: form.street, city: form.city, state: form.state, postcode: form.postcode }
      : null;

    const payload: any = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      property_notes: form.property_notes.trim() || null,
      address,
      business_client: form.business_client,
      client_abn: form.client_abn.trim() || null,
    };

    if (editingClient) {
      const { error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", editingClient.id);

      if (error) {
        toast.error("Failed to update client");
      } else {
        toast.success("Client updated");
        setDialogOpen(false);
        fetchClients();
      }
    } else {
      const { error } = await supabase
        .from("clients")
        .insert({
          contractor_id: contractorId,
          ...payload,
        });

      if (error) {
        toast.error("Failed to create client");
      } else {
        toast.success("Client added");
        setDialogOpen(false);
        fetchClients();
      }
    }
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete client. They may have associated jobs.");
    } else {
      toast.success("Client deleted");
      setDeleteConfirmId(null);
      fetchClients();
    }
  };

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.phone && c.phone.includes(searchQuery))
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedClients = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" /> Add Client
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-display font-semibold text-lg text-foreground mb-1">
              {clients.length === 0 ? "No clients yet" : "No matches"}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {clients.length === 0
                ? "Add your first client to get started."
                : "Try a different search term."}
            </p>
            {clients.length === 0 && (
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Add Client
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedClients.map((client) => {
                const addr = client.address as any;
                return (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      {client.name}
                      {client.user_id && (
                        <Badge variant="outline" className="ml-2 text-[10px] bg-primary/10 text-primary border-primary/30">
                          <CheckCircle2 className="w-3 h-3 mr-0.5" /> Verified
                        </Badge>
                      )}
                      {(client as any).business_client && (
                        <Badge variant="outline" className="ml-1 text-[10px] bg-muted text-muted-foreground border-border">
                          Business
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {client.email || "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {client.phone || "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {addr?.city && addr?.state ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {addr.street ? `${addr.street}, ` : ""}{addr.city}, {addr.state} {addr.postcode || ""}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(client)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(client.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Edit Client" : "Add Client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Smith" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@email.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0412 345 678" />
              </div>
            </div>

            {/* Business client toggle + ABN */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="business_client"
                  checked={form.business_client}
                  onCheckedChange={(v) => setForm({ ...form, business_client: !!v })}
                />
                <Label htmlFor="business_client" className="cursor-pointer text-sm">Business client</Label>
              </div>
              {form.business_client && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="client_abn">ABN</Label>
                  <Input
                    id="client_abn"
                    value={form.client_abn}
                    onChange={(e) => setForm({ ...form, client_abn: e.target.value })}
                    placeholder="12 345 678 901"
                  />
                </div>
              )}
            </div>

            <ClientAddressAutocomplete form={form} setForm={setForm} />
            <div className="space-y-2">
              <Label htmlFor="notes">Property Notes</Label>
              <Textarea id="notes" value={form.property_notes} onChange={(e) => setForm({ ...form, property_notes: e.target.value })} placeholder="Gate code, dog in backyard, etc." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingClient ? "Save Changes" : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Client?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this client and cannot be undone. Any associated jobs will remain.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientsTab;
