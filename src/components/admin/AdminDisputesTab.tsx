import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Eye,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Star,
  Clock,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import JobPhotosGallery from "@/components/dashboard/JobPhotosGallery";

interface Dispute {
  id: string;
  booking_id: string;
  raised_by: string;
  description: string;
  customer_photos: string[] | null;
  contractor_response: string | null;
  contractor_response_photos: string[] | null;
  status: string;
  resolution: string | null;
  refund_percentage: number | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  dispute_reason: string | null;
  suggested_refund_amount: number | null;
}

interface DisputeWithDetails extends Dispute {
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  contractorName: string;
  contractorEmail: string;
  contractorPhone: string | null;
  contractorId: string;
  bookingDate: string;
  bookingPrice: number;
  bookingStatus: string;
  bookingPayoutStatus: string;
  bookingPaymentIntentId: string | null;
  bookingCompletedAt: string | null;
  bookingCreatedAt: string;
  bookingContractorAcceptedAt: string | null;
  addressDetails: string;
  isPostPayment: boolean;
}

const REASON_LABELS: Record<string, string> = {
  poor_quality: "Poor Quality",
  partial_completion: "Partial Completion",
  property_damage: "Property Damage",
  no_show: "No Show",
  other: "Other",
};

interface ContractorStats {
  totalJobs: number;
  avgRating: number;
  disputeRate: number;
  previousDisputes: { id: string; resolution: string | null; created_at: string; status: string }[];
}

const AdminDisputesTab = () => {
  const [disputes, setDisputes] = useState<DisputeWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "under_review" | "resolved">("pending");
  const [selectedDispute, setSelectedDispute] = useState<DisputeWithDetails | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [contractorStats, setContractorStats] = useState<ContractorStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Resolution state
  const [confirmAction, setConfirmAction] = useState<"full_refund" | "partial_refund" | "no_refund" | null>(null);
  const [partialPercent, setPartialPercent] = useState(50);
  const [resolving, setResolving] = useState(false);

  // Photo viewer
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [viewingPhotos, setViewingPhotos] = useState<string[]>([]);
  const [viewingPhotoIdx, setViewingPhotoIdx] = useState(0);
  const [photoSignedUrls, setPhotoSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchDisputes();
  }, [filter]);

  const fetchDisputes = async () => {
    setLoading(true);

    const { data: disputeData, error } = await supabase
      .from("disputes")
      .select("*")
      .eq("status", filter)
      .order("created_at", { ascending: false });

    if (error || !disputeData) {
      setDisputes([]);
      setLoading(false);
      return;
    }

    // Gather booking IDs
    const bookingIds = disputeData.map(d => d.booking_id);
    const { data: bookingsData } = await supabase
      .from("bookings")
      .select("id, user_id, contractor_id, scheduled_date, total_price, status, payout_status, payment_intent_id, completed_at, created_at, contractor_accepted_at, address_id")
      .in("id", bookingIds);

    if (!bookingsData) {
      setDisputes([]);
      setLoading(false);
      return;
    }

    // Get user IDs for profiles
    const userIds = new Set<string>();
    const contractorIds = new Set<string>();
    bookingsData.forEach(b => {
      userIds.add(b.user_id);
      if (b.contractor_id) contractorIds.add(b.contractor_id);
    });

    const [profilesResult, contractorsResult, addressesResult] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, phone"),
      supabase.from("contractors").select("id, user_id, phone").in("id", Array.from(contractorIds)),
      supabase.from("addresses").select("id, street_address, city").in("id", bookingsData.map(b => b.address_id)),
    ]);

    const profileMap = new Map(profilesResult.data?.map(p => [p.user_id, p]) || []);
    const contractorMap = new Map(contractorsResult.data?.map(c => [c.id, c]) || []);
    const addressMap = new Map(addressesResult.data?.map(a => [a.id, a]) || []);

    // Get emails via edge function
    const allUserIds = Array.from(userIds);
    contractorsResult.data?.forEach(c => allUserIds.push(c.user_id));
    
    const { data: emailData } = await supabase.functions.invoke("admin-get-user-emails", {
      body: { userIds: [...new Set(allUserIds)] },
    });
    const emailMap = new Map<string, string>(
      emailData?.emails
        ? Object.entries(emailData.emails as Record<string, string>)
        : []
    );

    const enriched: DisputeWithDetails[] = disputeData.map(d => {
      const booking = bookingsData.find(b => b.id === d.booking_id);
      const contractor = booking?.contractor_id ? contractorMap.get(booking.contractor_id) : null;
      const customerProfile = booking ? profileMap.get(booking.user_id) : null;
      const contractorProfile = contractor ? profileMap.get(contractor.user_id) : null;
      const address = booking ? addressMap.get(booking.address_id) : null;

      return {
        ...d,
        customerName: customerProfile?.full_name || "Unknown",
        customerEmail: booking ? emailMap.get(booking.user_id) || "" : "",
        customerPhone: customerProfile?.phone || null,
        contractorName: contractorProfile?.full_name || "Unknown",
        contractorEmail: contractor ? emailMap.get(contractor.user_id) || "" : "",
        contractorPhone: contractor?.phone || null,
        contractorId: contractor?.id || "",
        bookingDate: booking?.scheduled_date || "",
        bookingPrice: Number(booking?.total_price) || 0,
        bookingStatus: booking?.status || "",
        bookingPayoutStatus: booking?.payout_status || "",
        bookingPaymentIntentId: booking?.payment_intent_id || null,
        bookingCompletedAt: booking?.completed_at || null,
        bookingCreatedAt: booking?.created_at || "",
        bookingContractorAcceptedAt: booking?.contractor_accepted_at || null,
        addressDetails: address ? `${address.street_address}, ${address.city}` : "Unknown",
        isPostPayment: booking?.status === "post_payment_dispute",
      };
    });

    setDisputes(enriched);
    setLoading(false);
  };

  const fetchContractorStats = async (contractorId: string) => {
    setLoadingStats(true);

    const [jobsResult, reviewsResult, disputesResult] = await Promise.all([
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).in("status", ["completed", "completed_pending_verification"]),
      supabase.from("reviews").select("rating").eq("contractor_id", contractorId),
      supabase.from("disputes").select("id, resolution, created_at, status").in("booking_id",
        (await supabase.from("bookings").select("id").eq("contractor_id", contractorId)).data?.map(b => b.id) || []
      ),
    ]);

    const totalJobs = jobsResult.count || 0;
    const ratings = reviewsResult.data || [];
    const avgRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 0;
    const allDisputes = disputesResult.data || [];
    const disputeRate = totalJobs > 0 ? (allDisputes.length / totalJobs) * 100 : 0;

    setContractorStats({
      totalJobs,
      avgRating,
      disputeRate,
      previousDisputes: allDisputes,
    });
    setLoadingStats(false);
  };

  const openDetail = (dispute: DisputeWithDetails) => {
    setSelectedDispute(dispute);
    setDetailOpen(true);
    setContractorStats(null);
    if (dispute.contractorId) fetchContractorStats(dispute.contractorId);
  };

  const handleResolve = async () => {
    if (!selectedDispute || !confirmAction) return;
    setResolving(true);

    try {
      const { data, error } = await supabase.functions.invoke("resolve-dispute", {
        body: {
          disputeId: selectedDispute.id,
          resolution: confirmAction,
          refundPercentage: confirmAction === "partial_refund" ? partialPercent : undefined,
        },
      });

      if (error || data?.error) throw new Error(data?.error || "Failed to resolve dispute");

      toast.success("Dispute resolved successfully");
      setConfirmAction(null);
      setDetailOpen(false);
      fetchDisputes();
    } catch (err: any) {
      toast.error(err.message || "Failed to resolve dispute");
    } finally {
      setResolving(false);
    }
  };

  const getDisputePhotoUrl = async (path: string, bucket: string) => {
    if (photoSignedUrls[path]) return photoSignedUrls[path];
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      setPhotoSignedUrls(prev => ({ ...prev, [path]: data.signedUrl }));
      return data.signedUrl;
    }
    return "";
  };

  const openPhotos = async (paths: string[], bucket: string) => {
    const urls: string[] = [];
    for (const p of paths) {
      const url = await getDisputePhotoUrl(p, bucket);
      if (url) urls.push(url);
    }
    setViewingPhotos(urls);
    setViewingPhotoIdx(0);
    setPhotoViewerOpen(true);
  };

  const daysSince = (dateStr: string) => {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  };

  const filters: { value: "pending" | "under_review" | "resolved"; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "under_review", label: "Under Review" },
    { value: "resolved", label: "Resolved" },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        {filters.map(f => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : disputes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No {filter} disputes found.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Contractor</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Suggested Refund</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disputes.map(d => {
                const reasonLabels: Record<string, string> = {
                  poor_quality: "Poor Quality",
                  partial_completion: "Partial Completion",
                  property_damage: "Property Damage",
                  no_show: "No Show",
                  other: "Other",
                };
                return (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">
                    #{d.booking_id.slice(0, 8)}
                    {d.isPostPayment && (
                      <Badge variant="destructive" className="ml-1 text-[10px] px-1">POST-PAY</Badge>
                    )}
                  </TableCell>
                  <TableCell>{d.customerName}</TableCell>
                  <TableCell>{d.contractorName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {d.dispute_reason ? reasonLabels[d.dispute_reason] || d.dispute_reason : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>${d.bookingPrice.toFixed(2)}</TableCell>
                  <TableCell>
                    {d.suggested_refund_amount != null && d.suggested_refund_amount > 0
                      ? <span className="font-medium text-destructive">${Number(d.suggested_refund_amount).toFixed(2)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.status === "resolved" ? "default" : "secondary"}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{daysSince(d.created_at)}d</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => openDetail(d)}>
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedDispute && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Dispute - Job #{selectedDispute.booking_id.slice(0, 8)}
                  {selectedDispute.isPostPayment && (
                    <Badge variant="destructive" className="text-xs">
                      ⚠️ Payment Already Released
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Main content */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Post-payment warning */}
                  {selectedDispute.isPostPayment && (
                    <Card className="border-destructive/50 bg-destructive/5">
                      <CardContent className="pt-4 flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                        <p className="text-sm text-destructive">
                          Payment has already been released to the contractor. Any refund will come from the platform balance.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Job Info */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Job Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <p><span className="text-muted-foreground">Date:</span> {new Date(selectedDispute.bookingDate).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                      <p><span className="text-muted-foreground">Address:</span> {selectedDispute.addressDetails}</p>
                      <p><span className="text-muted-foreground">Price:</span> <span className="font-semibold">${selectedDispute.bookingPrice.toFixed(2)}</span></p>
                      <p><span className="text-muted-foreground">Payout Status:</span> <Badge variant="outline" className="text-xs">{selectedDispute.bookingPayoutStatus}</Badge></p>
                    </CardContent>
                  </Card>

                  {/* Customer & Contractor Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <p className="font-medium">{selectedDispute.customerName}</p>
                        <p className="text-muted-foreground">{selectedDispute.customerEmail}</p>
                        {selectedDispute.customerPhone && <p className="text-muted-foreground">{selectedDispute.customerPhone}</p>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Contractor</CardTitle></CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <p className="font-medium">{selectedDispute.contractorName}</p>
                        <p className="text-muted-foreground">{selectedDispute.contractorEmail}</p>
                        {selectedDispute.contractorPhone && <p className="text-muted-foreground">{selectedDispute.contractorPhone}</p>}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Before/After Photos */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Job Photos (Before & After)</CardTitle></CardHeader>
                    <CardContent>
                      <JobPhotosGallery bookingId={selectedDispute.booking_id} />
                    </CardContent>
                  </Card>

                  {/* Customer Complaint */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Customer's Complaint</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {selectedDispute.dispute_reason && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Reason:</span>
                          <Badge variant="outline">{REASON_LABELS[selectedDispute.dispute_reason] || selectedDispute.dispute_reason}</Badge>
                        </div>
                      )}
                      {selectedDispute.suggested_refund_amount != null && selectedDispute.suggested_refund_amount > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Suggested Refund:</span>
                          <span className="font-semibold text-destructive">${Number(selectedDispute.suggested_refund_amount).toFixed(2)}</span>
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{selectedDispute.description}</p>
                      {selectedDispute.customer_photos && selectedDispute.customer_photos.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">
                            <Camera className="w-3 h-3 inline mr-1" />
                            {selectedDispute.customer_photos.length} photo(s) attached
                          </p>
                          <Button size="sm" variant="outline" onClick={() => openPhotos(selectedDispute.customer_photos!, "dispute-photos")}>
                            View Photos
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Contractor Response */}
                  {selectedDispute.contractor_response && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Contractor's Response</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm whitespace-pre-wrap">{selectedDispute.contractor_response}</p>
                        {selectedDispute.contractor_response_photos && selectedDispute.contractor_response_photos.length > 0 && (
                          <Button size="sm" variant="outline" onClick={() => openPhotos(selectedDispute.contractor_response_photos!, "dispute-photos")}>
                            View Response Photos ({selectedDispute.contractor_response_photos.length})
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Timeline */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {[
                          { label: "Booking Created", date: selectedDispute.bookingCreatedAt },
                          { label: "Job Accepted", date: selectedDispute.bookingContractorAcceptedAt },
                          { label: "Job Completed", date: selectedDispute.bookingCompletedAt },
                          { label: "Dispute Raised", date: selectedDispute.created_at },
                          ...(selectedDispute.resolved_at ? [{ label: "Dispute Resolved", date: selectedDispute.resolved_at }] : []),
                        ]
                          .filter(e => e.date)
                          .map((event, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                              <span className="text-muted-foreground w-36 shrink-0">{event.label}</span>
                              <span>{new Date(event.date!).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Decision Buttons */}
                  {selectedDispute.status !== "resolved" && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Resolution</CardTitle></CardHeader>
                      <CardContent className="flex flex-col sm:flex-row gap-3">
                        <Button
                          variant="destructive"
                          onClick={() => setConfirmAction("full_refund")}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Full Refund
                        </Button>
                        <Button
                          className="bg-yellow-600 hover:bg-yellow-700 text-white"
                          onClick={() => { setPartialPercent(50); setConfirmAction("partial_refund"); }}
                        >
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Partial Refund
                        </Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => setConfirmAction("no_refund")}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Reject Dispute
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {selectedDispute.status === "resolved" && (
                    <Card className="border-green-500/30">
                      <CardContent className="pt-4 text-sm space-y-1">
                        <p className="font-medium text-green-700 dark:text-green-400">✅ Resolved</p>
                        <p><span className="text-muted-foreground">Resolution:</span> {selectedDispute.resolution?.replace("_", " ")}</p>
                        {selectedDispute.refund_percentage !== null && <p><span className="text-muted-foreground">Refund:</span> {selectedDispute.refund_percentage}%</p>}
                        <p><span className="text-muted-foreground">Resolved by:</span> {selectedDispute.resolved_by}</p>
                        <p><span className="text-muted-foreground">Resolved at:</span> {selectedDispute.resolved_at && new Date(selectedDispute.resolved_at).toLocaleString("en-AU")}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Contractor History Sidebar */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Contractor History</CardTitle></CardHeader>
                    <CardContent>
                      {loadingStats ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      ) : contractorStats ? (
                        <div className="space-y-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Total Jobs</span>
                            <span className="font-semibold">{contractorStats.totalJobs}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Avg Rating</span>
                            <span className="font-semibold flex items-center gap-1">
                              {contractorStats.avgRating > 0 ? (
                                <>
                                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                  {contractorStats.avgRating.toFixed(1)}
                                </>
                              ) : "N/A"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Dispute Rate</span>
                            <span className={`font-semibold ${contractorStats.disputeRate > 10 ? "text-destructive" : contractorStats.disputeRate > 5 ? "text-yellow-600" : "text-green-600"}`}>
                              {contractorStats.disputeRate.toFixed(1)}%
                            </span>
                          </div>

                          {contractorStats.previousDisputes.length > 0 && (
                            <div className="pt-2 border-t border-border">
                              <p className="text-xs text-muted-foreground mb-2">Previous Disputes ({contractorStats.previousDisputes.length})</p>
                              <div className="space-y-2">
                                {contractorStats.previousDisputes.slice(0, 5).map(pd => (
                                  <div key={pd.id} className="text-xs flex items-center justify-between">
                                    <span className="text-muted-foreground">
                                      {new Date(pd.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                                    </span>
                                    <Badge variant={pd.status === "resolved" ? "default" : "secondary"} className="text-[10px]">
                                      {pd.resolution?.replace("_", " ") || pd.status}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No data</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialogs */}
      <AlertDialog open={confirmAction === "full_refund"} onOpenChange={() => !resolving && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Full Refund</AlertDialogTitle>
            <AlertDialogDescription>
              Issue 100% refund (<span className="font-semibold">${selectedDispute?.bookingPrice.toFixed(2)}</span>) to customer? Contractor will receive $0.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolve} disabled={resolving} className="bg-destructive hover:bg-destructive/90">
              {resolving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm Full Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === "partial_refund"} onOpenChange={() => !resolving && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Partial Refund</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>Choose the refund percentage:</p>
                <Slider
                  value={[partialPercent]}
                  onValueChange={([val]) => setPartialPercent(val)}
                  max={100}
                  min={5}
                  step={5}
                />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-muted-foreground">Customer receives</p>
                    <p className="text-lg font-semibold">${((selectedDispute?.bookingPrice || 0) * partialPercent / 100).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{partialPercent}% refund</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-muted-foreground">Contractor receives</p>
                    <p className="text-lg font-semibold">${((selectedDispute?.bookingPrice || 0) * (100 - partialPercent) / 100).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{100 - partialPercent}%</p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolve} disabled={resolving} className="bg-yellow-600 hover:bg-yellow-700">
              {resolving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm {partialPercent}% Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === "no_refund"} onOpenChange={() => !resolving && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Dispute</AlertDialogTitle>
            <AlertDialogDescription>
              Reject this dispute and release full payment (<span className="font-semibold">${selectedDispute?.bookingPrice.toFixed(2)}</span>) to the contractor?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolve} disabled={resolving} className="bg-green-600 hover:bg-green-700">
              {resolving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Reject Dispute & Pay Contractor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photo Viewer */}
      <Dialog open={photoViewerOpen} onOpenChange={setPhotoViewerOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Photo {viewingPhotoIdx + 1} of {viewingPhotos.length}</DialogTitle>
          </DialogHeader>
          {viewingPhotos.length > 0 && (
            <div className="space-y-4">
              <img
                src={viewingPhotos[viewingPhotoIdx]}
                alt="Dispute evidence"
                className="w-full rounded-lg max-h-[60vh] object-contain"
              />
              {viewingPhotos.length > 1 && (
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={viewingPhotoIdx === 0}
                    onClick={() => setViewingPhotoIdx(i => i - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={viewingPhotoIdx >= viewingPhotos.length - 1}
                    onClick={() => setViewingPhotoIdx(i => i + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDisputesTab;
