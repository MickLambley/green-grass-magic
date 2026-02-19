import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Eye,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Contractor = Database["public"]["Tables"]["contractors"]["Row"];

interface ContractorWithProfile extends Contractor {
  profileName?: string;
  email?: string;
}

interface QualityEntry {
  type: string;
  reason: string;
  triggered_at: string;
}

const AdminQualityAlertsTab = () => {
  const [contractors, setContractors] = useState<ContractorWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedContractor, setSelectedContractor] = useState<ContractorWithProfile | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchAlertedContractors();
  }, []);

  const fetchAlertedContractors = async () => {
    setLoading(true);

    const { data: contractorData } = await supabase
      .from("contractors")
      .select("*")
      .in("suspension_status", ["warning", "review_required", "suspended"])
      .order("suspended_at", { ascending: false, nullsFirst: false });

    if (contractorData) {
      const userIds = contractorData.map((c) => c.user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map(
        profilesData?.map((p) => [p.user_id, p.full_name]) || []
      );

      // Fetch emails
      try {
        const response = await supabase.functions.invoke("admin-get-user-emails", {
          body: { userIds },
        });
        const emailMap = (response.data?.emails || {}) as Record<string, string>;

        setContractors(
          contractorData.map((c) => ({
            ...c,
            profileName: profileMap.get(c.user_id) || "Unknown",
            email: emailMap[c.user_id] || undefined,
          }))
        );
      } catch {
        setContractors(
          contractorData.map((c) => ({
            ...c,
            profileName: profileMap.get(c.user_id) || "Unknown",
          }))
        );
      }
    }

    setLoading(false);
  };

  const getLatestAlert = (c: ContractorWithProfile): QualityEntry | null => {
    const reviews = Array.isArray(c.quality_reviews) ? (c.quality_reviews as unknown as QualityEntry[]) : [];
    const warnings = Array.isArray(c.quality_warnings) ? (c.quality_warnings as unknown as QualityEntry[]) : [];
    const all = [...reviews, ...warnings].sort(
      (a, b) => new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime()
    );
    return all[0] || null;
  };

  const handleMarkReviewed = async () => {
    if (!selectedContractor) return;
    setProcessing(true);

    const reviews = Array.isArray(selectedContractor.quality_reviews)
      ? [...(selectedContractor.quality_reviews as unknown as QualityEntry[])]
      : [];

    reviews.push({
      type: "admin_review",
      reason: reviewNotes || "Reviewed by admin - no action taken",
      triggered_at: new Date().toISOString(),
    });

    const { error } = await supabase
      .from("contractors")
      .update({
        suspension_status: "active",
        quality_reviews: reviews.slice(-20) as unknown as Database["public"]["Tables"]["contractors"]["Update"]["quality_reviews"],
      })
      .eq("id", selectedContractor.id);

    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success("Contractor marked as reviewed and returned to active");
      // Notify contractor
      await supabase.from("notifications").insert({
        user_id: selectedContractor.user_id,
        title: "✅ Account Review Complete",
        message: "Your account has been reviewed and is now active. Thank you for your patience.",
        type: "success",
      });
    }

    setReviewDialogOpen(false);
    setProcessing(false);
    setReviewNotes("");
    fetchAlertedContractors();
  };

  const handleLiftSuspension = async (contractor: ContractorWithProfile) => {
    const { error } = await supabase
      .from("contractors")
      .update({
        suspension_status: "active",
        is_active: true,
        suspended_at: null,
        suspension_reason: null,
      })
      .eq("id", contractor.id);

    if (error) {
      toast.error("Failed to lift suspension");
      return;
    }

    toast.success(`${contractor.profileName}'s suspension has been lifted`);

    await supabase.from("notifications").insert({
      user_id: contractor.user_id,
      title: "✅ Suspension Lifted",
      message: "Your account suspension has been lifted. You can now accept jobs again.",
      type: "success",
    });

    fetchAlertedContractors();
  };

  const handleConfirmBan = async (contractor: ContractorWithProfile) => {
    const { error } = await supabase
      .from("contractors")
      .update({
        suspension_status: "suspended",
        is_active: false,
        approval_status: "rejected",
      })
      .eq("id", contractor.id);

    if (error) {
      toast.error("Failed to confirm ban");
      return;
    }

    toast.success(`${contractor.profileName} has been permanently banned`);

    await supabase.from("notifications").insert({
      user_id: contractor.user_id,
      title: "🚫 Account Permanently Suspended",
      message: "Your contractor account has been permanently suspended due to quality violations. Contact support for more information.",
      type: "error",
    });

    fetchAlertedContractors();
  };

  const handleDismissWarning = async (contractor: ContractorWithProfile) => {
    const { error } = await supabase
      .from("contractors")
      .update({ suspension_status: "active" })
      .eq("id", contractor.id);

    if (error) {
      toast.error("Failed to dismiss warning");
      return;
    }

    toast.success("Warning dismissed");
    fetchAlertedContractors();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "warning":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Warning
          </Badge>
        );
      case "review_required":
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300">
            <ShieldAlert className="w-3 h-3 mr-1" />
            Review Required
          </Badge>
        );
      case "suspended":
        return (
          <Badge variant="destructive">
            <ShieldX className="w-3 h-3 mr-1" />
            Suspended
          </Badge>
        );
      default:
        return <Badge variant="outline">Active</Badge>;
    }
  };

  const filtered = filterStatus === "all"
    ? contractors
    : contractors.filter((c) => c.suspension_status === filterStatus);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Quality Alerts
            </CardTitle>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Alerts</SelectItem>
                <SelectItem value="warning">Warnings</SelectItem>
                <SelectItem value="review_required">Review Required</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <ShieldCheck className="w-10 h-10 text-green-500 mx-auto" />
              <p className="text-muted-foreground">No quality alerts at this time.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Alert Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Triggered</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((contractor) => {
                  const latest = getLatestAlert(contractor);
                  return (
                    <TableRow key={contractor.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{contractor.profileName}</p>
                          {contractor.business_name && (
                            <p className="text-xs text-muted-foreground">{contractor.business_name}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(contractor.suspension_status || "active")}</TableCell>
                      <TableCell className="max-w-[250px]">
                        <p className="text-sm truncate" title={latest?.reason || contractor.suspension_reason || "-"}>
                          {latest?.reason || contractor.suspension_reason || "-"}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {latest?.triggered_at
                          ? new Date(latest.triggered_at).toLocaleDateString("en-AU")
                          : contractor.suspended_at
                          ? new Date(contractor.suspended_at).toLocaleDateString("en-AU")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {contractor.suspension_status === "warning" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedContractor(contractor);
                                  setReviewDialogOpen(true);
                                }}
                                title="View details"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDismissWarning(contractor)}
                                title="Dismiss warning"
                              >
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </Button>
                            </>
                          )}
                          {contractor.suspension_status === "review_required" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedContractor(contractor);
                                setReviewNotes("");
                                setReviewDialogOpen(true);
                              }}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Review
                            </Button>
                          )}
                          {contractor.suspension_status === "suspended" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleLiftSuspension(contractor)}
                                className="text-green-600"
                              >
                                <ShieldCheck className="w-4 h-4 mr-1" />
                                Lift
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleConfirmBan(contractor)}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Ban
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Contractor Quality</DialogTitle>
          </DialogHeader>

          {selectedContractor && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{selectedContractor.profileName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <div className="mt-1">{getStatusBadge(selectedContractor.suspension_status || "active")}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Rating</Label>
                    <p className="font-medium">
                      {Number(selectedContractor.average_rating || 0) > 0
                        ? `${selectedContractor.average_rating} ⭐`
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Jobs</Label>
                    <p className="font-medium">{selectedContractor.completed_jobs_count || 0} completed</p>
                  </div>
                </div>

                {/* Recent Warnings */}
                {Array.isArray(selectedContractor.quality_warnings) && (selectedContractor.quality_warnings as unknown as QualityEntry[]).length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold">Recent Warnings</Label>
                    <div className="space-y-1 mt-1">
                      {(selectedContractor.quality_warnings as unknown as QualityEntry[]).slice(-5).reverse().map((w, i) => (
                        <div key={i} className="text-xs bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                          <span className="text-muted-foreground">
                            {new Date(w.triggered_at).toLocaleDateString("en-AU")}:
                          </span>{" "}
                          {w.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Reviews */}
                {Array.isArray(selectedContractor.quality_reviews) && (selectedContractor.quality_reviews as unknown as QualityEntry[]).length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold">Review History</Label>
                    <div className="space-y-1 mt-1">
                      {(selectedContractor.quality_reviews as unknown as QualityEntry[]).slice(-5).reverse().map((r, i) => (
                        <div key={i} className="text-xs bg-orange-50 dark:bg-orange-900/20 p-2 rounded">
                          <span className="text-muted-foreground">
                            {new Date(r.triggered_at).toLocaleDateString("en-AU")}:
                          </span>{" "}
                          {r.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedContractor.suspension_status === "review_required" && (
                  <div className="space-y-2">
                    <Label>Review Notes</Label>
                    <Textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Add notes about your review decision..."
                      rows={3}
                    />
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Close
            </Button>
            {selectedContractor?.suspension_status === "review_required" && (
              <Button onClick={handleMarkReviewed} disabled={processing}>
                {processing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                <CheckCircle className="w-4 h-4 mr-1" />
                Mark Reviewed
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminQualityAlertsTab;
