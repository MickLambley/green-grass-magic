import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Eye, HardHat, Star, Activity, MapPin, Phone, Mail,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Contractor = Database["public"]["Tables"]["contractors"]["Row"];

interface ContractorWithProfile extends Contractor {
  profileName?: string;
  profilePhone?: string;
  email?: string;
}

const ContractorApplicationsTab = () => {
  const [contractors, setContractors] = useState<ContractorWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContractor, setSelectedContractor] = useState<ContractorWithProfile | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchContractors();
  }, []);

  const fetchContractors = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contractors")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load contractors");
      setLoading(false);
      return;
    }

    // Fetch profiles for names
    const userIds = (data || []).map((c) => c.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

    setContractors(
      (data || []).map((c) => ({
        ...c,
        profileName: profileMap.get(c.user_id)?.full_name || c.business_name || "Unknown",
        profilePhone: profileMap.get(c.user_id)?.phone || c.phone || undefined,
      }))
    );
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!searchQuery) return contractors;
    const q = searchQuery.toLowerCase();
    return contractors.filter(
      (c) =>
        c.profileName?.toLowerCase().includes(q) ||
        c.business_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  }, [contractors, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contractors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="outline">{contractors.length} total</Badge>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contractor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Jobs</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{c.business_name || c.profileName}</p>
                    <p className="text-xs text-muted-foreground">{c.profileName}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={c.is_active ? "default" : "secondary"}>
                    {c.is_active ? "Active" : "Inactive"}
                  </Badge>
                  {c.suspension_status === "suspended" && (
                    <Badge variant="destructive" className="ml-1">Suspended</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">{c.completed_jobs_count}</TableCell>
                <TableCell className="text-sm">
                  {(c.average_rating || 0) > 0 ? `${c.average_rating} ★` : "-"}
                </TableCell>
                <TableCell className="text-sm">${Number(c.total_revenue || 0).toFixed(0)}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedContractor(c);
                      setReviewDialogOpen(true);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No contractors found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Contractor Detail Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedContractor?.business_name || selectedContractor?.profileName}</DialogTitle>
          </DialogHeader>
          {selectedContractor && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-muted-foreground" />
                    <span>Jobs: {selectedContractor.completed_jobs_count}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-muted-foreground" />
                    <span>
                      Rating: {(selectedContractor.average_rating || 0) > 0
                        ? `${selectedContractor.average_rating} (${selectedContractor.total_ratings_count})`
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span>Revenue: ${Number(selectedContractor.total_revenue || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedContractor.service_areas?.join(", ") || "Not set"}</span>
                  </div>
                  {selectedContractor.profilePhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedContractor.profilePhone}</span>
                    </div>
                  )}
                  {selectedContractor.abn && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      ABN: {selectedContractor.abn}
                    </div>
                  )}
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                  <p><span className="text-muted-foreground">Subscription:</span> {selectedContractor.subscription_tier}</p>
                  <p><span className="text-muted-foreground">Stripe Connected:</span> {selectedContractor.stripe_onboarding_complete ? "Yes" : "No"}</p>
                  <p><span className="text-muted-foreground">Insurance:</span> {selectedContractor.insurance_verified ? "Verified" : "Not verified"}</p>
                  <p><span className="text-muted-foreground">Website:</span> {selectedContractor.website_published ? "Published" : "Not published"}</p>
                  <p><span className="text-muted-foreground">Member since:</span> {new Date(selectedContractor.created_at).toLocaleDateString("en-AU")}</p>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContractorApplicationsTab;
