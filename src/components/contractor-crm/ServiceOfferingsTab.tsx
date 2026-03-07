import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save, Leaf, Shovel, Trash, Wrench, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface ServiceOffering {
  id?: string;
  contractor_id: string;
  name: string;
  category: string;
  description: string;
  is_default: boolean;
  default_rate: number | null;
  rate_type: string;
  is_active: boolean;
  requires_quote: boolean;
}

const DEFAULT_SERVICES: Omit<ServiceOffering, "contractor_id">[] = [
  { name: "Lawn Mowing", category: "lawn", description: "Standard lawn mowing service", is_default: true, default_rate: null, rate_type: "fixed", is_active: true, requires_quote: false },
  { name: "Edging & Trimming", category: "lawn", description: "Lawn edging and line trimming", is_default: true, default_rate: null, rate_type: "fixed", is_active: true, requires_quote: false },
  { name: "Hedge Trimming", category: "garden", description: "Trim and shape hedges", is_default: true, default_rate: null, rate_type: "hourly", is_active: false, requires_quote: true },
  { name: "Garden Cleanup", category: "garden", description: "Weeding, pruning, and general garden tidy-up", is_default: true, default_rate: null, rate_type: "hourly", is_active: false, requires_quote: true },
  { name: "Rubbish Removal", category: "removal", description: "Green waste and garden rubbish removal", is_default: true, default_rate: null, rate_type: "hourly", is_active: false, requires_quote: true },
  { name: "Mulching", category: "garden", description: "Spread mulch across garden beds", is_default: true, default_rate: null, rate_type: "hourly", is_active: false, requires_quote: true },
  { name: "Pressure Washing", category: "other", description: "High-pressure cleaning of driveways, paths, and decks", is_default: true, default_rate: null, rate_type: "hourly", is_active: false, requires_quote: true },
  { name: "Tree Pruning", category: "garden", description: "Prune and trim small to medium trees", is_default: true, default_rate: null, rate_type: "hourly", is_active: false, requires_quote: true },
  { name: "Gutter Cleaning", category: "other", description: "Clear gutters of leaves and debris", is_default: true, default_rate: null, rate_type: "fixed", is_active: false, requires_quote: true },
  { name: "Fertilising & Weed Treatment", category: "lawn", description: "Lawn fertilisation and weed spray", is_default: true, default_rate: null, rate_type: "fixed", is_active: false, requires_quote: true },
];

const CATEGORIES: Record<string, { label: string; icon: any }> = {
  lawn: { label: "Lawn Care", icon: Leaf },
  garden: { label: "Garden & Landscaping", icon: Shovel },
  removal: { label: "Removal", icon: Trash },
  other: { label: "Other Services", icon: Wrench },
};

interface ServiceOfferingsTabProps {
  contractorId: string;
}

const ServiceOfferingsTab = ({ contractorId }: ServiceOfferingsTabProps) => {
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceCategory, setNewServiceCategory] = useState("other");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    loadServices();
  }, [contractorId]);

  const loadServices = async () => {
    const { data, error } = await supabase
      .from("service_offerings")
      .select("*")
      .eq("contractor_id", contractorId)
      .order("created_at");

    if (error) {
      toast.error("Failed to load services");
      setIsLoading(false);
      return;
    }

    if (data && data.length > 0) {
      setServices(data.map(d => ({
        ...d,
        default_rate: d.default_rate ? Number(d.default_rate) : null,
      })));
      setInitialized(true);
    } else {
      // Pre-populate with defaults
      setServices(DEFAULT_SERVICES.map(s => ({ ...s, contractor_id: contractorId })));
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Delete existing and re-insert
      await supabase.from("service_offerings").delete().eq("contractor_id", contractorId);

      const toInsert = services.map(({ id, ...rest }) => ({
        ...rest,
        contractor_id: contractorId,
      }));

      const { error } = await supabase.from("service_offerings").insert(toInsert);
      if (error) throw error;

      toast.success("Services saved");
      setInitialized(true);
      loadServices();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
    setIsSaving(false);
  };

  const toggleService = (index: number) => {
    setServices(prev => prev.map((s, i) => i === index ? { ...s, is_active: !s.is_active } : s));
  };

  const updateService = (index: number, updates: Partial<ServiceOffering>) => {
    setServices(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const addCustomService = () => {
    if (!newServiceName.trim()) return;
    setServices(prev => [...prev, {
      contractor_id: contractorId,
      name: newServiceName.trim(),
      category: newServiceCategory,
      description: "",
      is_default: false,
      default_rate: null,
      rate_type: "hourly",
      is_active: true,
      requires_quote: true,
    }]);
    setNewServiceName("");
  };

  const removeService = (index: number) => {
    setServices(prev => prev.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const grouped = Object.keys(CATEGORIES).map(cat => ({
    ...CATEGORIES[cat],
    category: cat,
    services: services.map((s, i) => ({ ...s, _index: i })).filter(s => s.category === cat),
  }));

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Service Offerings
          </CardTitle>
          <CardDescription>
            Toggle the services you offer. Lawn services use your pricing settings; all other services require a per-job quote.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {grouped.map(group => (
            group.services.length > 0 && (
              <div key={group.category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <group.icon className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                </div>
                <div className="space-y-2">
                  {group.services.map((service) => (
                    <div
                      key={service._index}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        service.is_active ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
                      }`}
                    >
                      <Switch
                        checked={service.is_active}
                        onCheckedChange={() => toggleService(service._index)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{service.name}</span>
                          {service.requires_quote && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Quote required</Badge>
                          )}
                          {!service.is_default && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Custom</Badge>
                          )}
                        </div>
                        {service.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
                        )}
                      </div>
                      {service.is_active && service.requires_quote && (
                        <div className="flex items-center gap-2">
                          <Select
                            value={service.rate_type}
                            onValueChange={(v) => updateService(service._index, { rate_type: v })}
                          >
                            <SelectTrigger className="w-24 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hourly">Hourly</SelectItem>
                              <SelectItem value="fixed">Fixed</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="w-24">
                            <Input
                              type="number"
                              placeholder="Rate"
                              className="h-8 text-xs"
                              value={service.default_rate ?? ""}
                              onChange={(e) => updateService(service._index, {
                                default_rate: e.target.value ? Number(e.target.value) : null,
                              })}
                            />
                          </div>
                        </div>
                      )}
                      {!service.is_default && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeService(service._index)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}

          {/* Add custom service */}
          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Add Custom Service</h3>
            <div className="flex gap-2">
              <Input
                placeholder="Service name (e.g., Pool Cleaning)"
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                className="flex-1"
                maxLength={100}
                onKeyDown={(e) => e.key === "Enter" && addCustomService()}
              />
              <Select value={newServiceCategory} onValueChange={setNewServiceCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={addCustomService} disabled={!newServiceName.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Services
      </Button>
    </div>
  );
};

export default ServiceOfferingsTab;
