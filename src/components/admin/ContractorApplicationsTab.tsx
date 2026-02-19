import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Eye, Check, X, FileText, Clock, MapPin, Wrench, Loader2, User,
  Edit, Trash2, Ban, UserCheck, Users, ArrowUpDown, ChevronUp, ChevronDown,
  BarChart3, Filter, Shield, AlertTriangle, Download, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import ContractorPerformanceTab from "./ContractorPerformanceTab";
import type { Database } from "@/integrations/supabase/types";

type Contractor = Database["public"]["Tables"]["contractors"]["Row"];

type SortField = "profileName" | "completed_jobs_count" | "average_rating" | "completionRate" | "disputeRate" | "last_active_at";
type SortDir = "asc" | "desc";

interface ContractorWithProfile extends Contractor {
  profileName?: string;
  profilePhone?: string;
  email?: string;
}

interface QuestionnaireResponses {
  identity?: {
    businessName?: string;
    fullName?: string;
    mobileNumber?: string;
    confirmIndependentBusiness?: boolean;
    confirmInsuranceCoverage?: boolean;
    businessAddress?: string;
    mailingAddress?: string;
  };
  services?: {
    mowerTypes?: string[];
    offersGreenWasteRemoval?: boolean;
  };
  operationalRules?: {
    agreePhotoUpload?: boolean;
    agreeSafeWorksite?: boolean;
    agreeCancellationPolicy?: boolean;
    agreePromptCommunication?: boolean;
    agreeProfessionalStandard?: boolean;
    agreeEscrowPayment?: boolean;
    agreeDisputeProcess?: boolean;
  };
  experience?: {
    yearsExperience?: string;
    portfolioPhotoPaths?: string[];
  };
}

const operationalRuleLabels: Record<string, string> = {
  agreePhotoUpload: "Upload before/after photos for each job",
  agreeSafeWorksite: "Maintain a safe worksite",
  agreeCancellationPolicy: "Follow cancellation policy (24hr notice)",
  agreePromptCommunication: "Respond to customer messages within 4 hours",
  agreeProfessionalStandard: "Maintain professional standards",
  agreeEscrowPayment: "Accept escrow-style payment (released after job completion)",
  agreeDisputeProcess: "Follow dispute resolution process",
};

const ContractorApplicationsTab = () => {
  const [contractors, setContractors] = useState<ContractorWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorWithProfile | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [insuranceUrl, setInsuranceUrl] = useState<string | null>(null);
  const [insuranceVerified, setInsuranceVerified] = useState(false);
  const [insuranceExpiryDate, setInsuranceExpiryDate] = useState("");
  
  // Edit form state
  const [editBusinessName, setEditBusinessName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editServiceAreas, setEditServiceAreas] = useState("");
  const [editServiceRadius, setEditServiceRadius] = useState("");

  // Sorting & filtering
  const [sortField, setSortField] = useState<SortField>("completed_jobs_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterMinRating, setFilterMinRating] = useState<string>("all");
  const [filterMaxDispute, setFilterMaxDispute] = useState<string>("all");

  useEffect(() => {
    fetchContractors();
  }, []);

  const fetchContractors = async () => {
    setLoading(true);

    const { data: contractorData } = await supabase
      .from("contractors")
      .select("*")
      .order("applied_at", { ascending: false });

    if (contractorData) {
      const userIds = contractorData.map((c) => c.user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", userIds);

      const profileMap = new Map(
        profilesData?.map((p) => [p.user_id, { name: p.full_name, phone: p.phone }]) || []
      );

      const contractorsWithProfiles = contractorData.map((c) => ({
        ...c,
        profileName: profileMap.get(c.user_id)?.name || "Unknown",
        profilePhone: profileMap.get(c.user_id)?.phone || undefined,
      }));

      setContractors(contractorsWithProfiles);
      
      // Fetch emails via edge function
      fetchContractorEmails(contractorData.map(c => c.user_id), contractorsWithProfiles);
    }

    setLoading(false);
  };
  
  const fetchContractorEmails = async (userIds: string[], currentContractors: ContractorWithProfile[]) => {
    if (userIds.length === 0) return;
    
    setEmailsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("admin-get-user-emails", {
        body: { userIds },
      });
      
      if (response.data?.emails) {
        const emailMap = response.data.emails as Record<string, string>;
        setContractors(currentContractors.map(c => ({
          ...c,
          email: emailMap[c.user_id] || undefined,
        })));
      }
    } catch (error) {
      console.error("Failed to fetch contractor emails:", error);
    }
    setEmailsLoading(false);
  };

  const getSignedUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("contractor-documents")
      .createSignedUrl(filePath, 3600);

    if (error) {
      console.error("Failed to get signed URL:", error);
      return null;
    }
    return data.signedUrl;
  };

  const openReviewDialog = async (contractor: ContractorWithProfile) => {
    setSelectedContractor(contractor);
    setAdminNotes("");
    setInsuranceUrl(null);
    setInsuranceVerified(contractor.insurance_verified || false);
    setInsuranceExpiryDate(contractor.insurance_expiry_date || "");

    if (contractor.insurance_certificate_url) {
      const url = await getSignedUrl(contractor.insurance_certificate_url);
      setInsuranceUrl(url);
    }

    setReviewDialogOpen(true);
  };

  const openEditDialog = (contractor: ContractorWithProfile) => {
    setSelectedContractor(contractor);
    setEditBusinessName(contractor.business_name || "");
    setEditPhone(contractor.phone || "");
    setEditServiceAreas(contractor.service_areas?.join(", ") || "");
    setEditServiceRadius(contractor.service_radius_km?.toString() || "");
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (contractor: ContractorWithProfile) => {
    setSelectedContractor(contractor);
    setDeleteDialogOpen(true);
  };

  const handleApproval = async (approved: boolean) => {
    if (!selectedContractor) return;

    setProcessing(true);

    const { data: { user } } = await supabase.auth.getUser();

    // Add or ensure contractor role exists
    if (approved) {
      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert({
          user_id: selectedContractor.user_id,
          role: "contractor" as const,
        }, { onConflict: "user_id,role" });

      if (roleError && roleError.code !== "23505") {
        console.error("Failed to add contractor role:", roleError);
      }
    }

    const updateData: Partial<Contractor> = {
      approval_status: approved ? "approved" : "rejected",
      approved_at: approved ? new Date().toISOString() : null,
      approved_by: approved ? user?.id : null,
      is_active: approved,
      insurance_verified: approved ? insuranceVerified : false,
      insurance_expiry_date: insuranceExpiryDate || null,
    };

    const { error } = await supabase
      .from("contractors")
      .update(updateData)
      .eq("id", selectedContractor.id);

    if (error) {
      toast.error("Failed to update application status");
      setProcessing(false);
      return;
    }

    toast.success(
      approved
        ? `${selectedContractor.profileName} has been approved as a contractor!`
        : `Application from ${selectedContractor.profileName} has been rejected.`
    );

    setReviewDialogOpen(false);
    setProcessing(false);
    fetchContractors();
  };

  const handleSuspend = async (contractor: ContractorWithProfile) => {
    const newActiveStatus = !contractor.is_active;
    
    const { error } = await supabase
      .from("contractors")
      .update({ is_active: newActiveStatus })
      .eq("id", contractor.id);

    if (error) {
      toast.error("Failed to update contractor status");
      return;
    }

    toast.success(
      newActiveStatus 
        ? `${contractor.profileName} has been reactivated.`
        : `${contractor.profileName} has been suspended.`
    );
    fetchContractors();
  };

  const handleUpdate = async () => {
    if (!selectedContractor) return;

    setProcessing(true);

    const areasArray = editServiceAreas
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const { error } = await supabase
      .from("contractors")
      .update({
        business_name: editBusinessName || null,
        phone: editPhone || null,
        service_areas: areasArray,
        service_radius_km: editServiceRadius ? parseFloat(editServiceRadius) : null,
      })
      .eq("id", selectedContractor.id);

    if (error) {
      toast.error("Failed to update contractor");
      setProcessing(false);
      return;
    }

    toast.success("Contractor updated successfully");
    setEditDialogOpen(false);
    setProcessing(false);
    fetchContractors();
  };

  const handleDelete = async () => {
    if (!selectedContractor) return;

    setProcessing(true);

    // Remove contractor role
    await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", selectedContractor.user_id)
      .eq("role", "contractor");

    // Delete contractor record
    const { error } = await supabase
      .from("contractors")
      .delete()
      .eq("id", selectedContractor.id);

    if (error) {
      toast.error("Failed to delete contractor");
      setProcessing(false);
      return;
    }

    toast.success(`${selectedContractor.profileName} has been removed.`);
    setDeleteDialogOpen(false);
    setProcessing(false);
    fetchContractors();
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (status === "approved" && !isActive) {
      return <Badge variant="outline" className="text-orange-600 border-orange-300">Suspended</Badge>;
    }
    
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      approved: "default",
      rejected: "destructive",
    };
    const labels: Record<string, string> = {
      pending: "Pending Review",
      approved: "Active",
      rejected: "Rejected",
    };
    return <Badge variant={variants[status] || "secondary"}>{labels[status] || status}</Badge>;
  };

  const parseQuestionnaire = (responses: unknown): QuestionnaireResponses | null => {
    if (!responses || typeof responses !== "object") return null;
    return responses as QuestionnaireResponses;
  };

  const pendingApplications = contractors.filter((c) => c.approval_status === "pending");
  const rejectedApplications = contractors.filter((c) => c.approval_status === "rejected");

  const getCompletionRate = (c: ContractorWithProfile) => {
    const total = (c.completed_jobs_count || 0) + (c.cancelled_jobs_count || 0);
    return total > 0 ? Math.round(((c.completed_jobs_count || 0) / total) * 100) : 100;
  };

  const getDisputeRate = (c: ContractorWithProfile) => {
    return (c.completed_jobs_count || 0) > 0
      ? Math.round(((c.disputed_jobs_count || 0) / (c.completed_jobs_count || 0)) * 100)
      : 0;
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "< 1h ago";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const activeContractors = useMemo(() => {
    let list = contractors.filter((c) => c.approval_status === "approved");

    // Apply filters
    if (filterTier !== "all") list = list.filter((c) => c.tier === filterTier);
    if (filterMinRating !== "all") {
      const min = parseFloat(filterMinRating);
      list = list.filter((c) => (c.average_rating || 0) >= min);
    }
    if (filterMaxDispute !== "all") {
      const max = parseFloat(filterMaxDispute);
      list = list.filter((c) => getDisputeRate(c) <= max);
    }

    // Apply sorting
    list.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortField) {
        case "profileName":
          valA = (a.profileName || "").toLowerCase();
          valB = (b.profileName || "").toLowerCase();
          return sortDir === "asc" ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
        case "completed_jobs_count":
          valA = a.completed_jobs_count || 0;
          valB = b.completed_jobs_count || 0;
          break;
        case "average_rating":
          valA = Number(a.average_rating || 0);
          valB = Number(b.average_rating || 0);
          break;
        case "completionRate":
          valA = getCompletionRate(a);
          valB = getCompletionRate(b);
          break;
        case "disputeRate":
          valA = getDisputeRate(a);
          valB = getDisputeRate(b);
          break;
        case "last_active_at":
          valA = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
          valB = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
          break;
      }
      return sortDir === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return list;
  }, [contractors, sortField, sortDir, filterTier, filterMinRating, filterMaxDispute]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending
            {pendingApplications.length > 0 && (
              <Badge variant="secondary">{pendingApplications.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" />
            Active
            <Badge variant="outline">{activeContractors.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center gap-2">
            <X className="w-4 h-4" />
            Rejected
            <Badge variant="outline">{rejectedApplications.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Pending Applications */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Pending Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingApplications.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No pending contractor applications.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>ABN</TableHead>
                      <TableHead>Applied</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingApplications.map((contractor) => (
                      <TableRow key={contractor.id}>
                        <TableCell className="font-medium">
                          {contractor.profileName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {contractor.email || (emailsLoading ? "..." : "-")}
                        </TableCell>
                        <TableCell>{contractor.business_name || "-"}</TableCell>
                        <TableCell>{contractor.abn || "-"}</TableCell>
                        <TableCell>
                          {contractor.applied_at
                            ? new Date(contractor.applied_at).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openReviewDialog(contractor)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Contractors */}
        <TabsContent value="active">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Active Contractors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Filters:</span>
                </div>
                <Select value={filterTier} onValueChange={setFilterTier}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    <SelectItem value="probation">New</SelectItem>
                    <SelectItem value="standard">Verified</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterMinRating} onValueChange={setFilterMinRating}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="Min Rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Rating</SelectItem>
                    <SelectItem value="4.5">4.5+ ⭐</SelectItem>
                    <SelectItem value="4.0">4.0+ ⭐</SelectItem>
                    <SelectItem value="3.5">3.5+ ⭐</SelectItem>
                    <SelectItem value="3.0">3.0+ ⭐</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterMaxDispute} onValueChange={setFilterMaxDispute}>
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue placeholder="Max Dispute %" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Dispute %</SelectItem>
                    <SelectItem value="3">≤ 3% Disputes</SelectItem>
                    <SelectItem value="5">≤ 5% Disputes</SelectItem>
                    <SelectItem value="10">≤ 10% Disputes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {activeContractors.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No active contractors.
                </p>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("profileName")}>
                        <span className="flex items-center">Name<SortIcon field="profileName" /></span>
                      </TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("completed_jobs_count")}>
                        <span className="flex items-center">Jobs<SortIcon field="completed_jobs_count" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("average_rating")}>
                        <span className="flex items-center">Avg Rating<SortIcon field="average_rating" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("completionRate")}>
                        <span className="flex items-center">Completion<SortIcon field="completionRate" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("disputeRate")}>
                        <span className="flex items-center">Disputes<SortIcon field="disputeRate" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("last_active_at")}>
                        <span className="flex items-center">Last Active<SortIcon field="last_active_at" /></span>
                      </TableHead>
                      <TableHead>Insurance Expiry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeContractors.map((contractor) => {
                      const compRate = getCompletionRate(contractor);
                      const dispRate = getDisputeRate(contractor);
                      return (
                      <TableRow key={contractor.id}>
                        <TableCell className="font-medium">
                          <div>
                            {contractor.profileName}
                            {contractor.business_name && (
                              <p className="text-xs text-muted-foreground">{contractor.business_name}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {{ probation: "New", standard: "Verified", premium: "Premium" }[contractor.tier] || contractor.tier}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{contractor.completed_jobs_count || 0}</TableCell>
                        <TableCell>
                          {Number(contractor.average_rating || 0) > 0
                            ? <span className="font-medium">{contractor.average_rating} ⭐</span>
                            : <span className="text-muted-foreground">-</span>
                          }
                        </TableCell>
                        <TableCell>
                          <span className={compRate < 90 ? "text-destructive font-medium" : ""}>{compRate}%</span>
                        </TableCell>
                        <TableCell>
                          <span className={dispRate > 5 ? "text-destructive font-medium" : ""}>
                            {dispRate}%{dispRate > 5 ? " ⚠️" : ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(contractor.last_active_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {contractor.insurance_expiry_date ? (() => {
                            const expiry = new Date(contractor.insurance_expiry_date);
                            const now = new Date();
                            const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                            const formatted = expiry.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
                            if (daysLeft < 0) return <span className="text-destructive font-medium">Expired ⛔</span>;
                            if (daysLeft <= 30) return <span className="text-amber-600 font-medium">{formatted} ⚠️</span>;
                            return <span>{formatted}</span>;
                          })() : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(contractor.approval_status, contractor.is_active)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openReviewDialog(contractor)}
                              title="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(contractor)}
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSuspend(contractor)}
                              title={contractor.is_active ? "Suspend" : "Reactivate"}
                            >
                              {contractor.is_active ? (
                                <Ban className="w-4 h-4 text-orange-500" />
                              ) : (
                                <UserCheck className="w-4 h-4 text-green-500" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(contractor)}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rejected Applications */}
        <TabsContent value="rejected">
          <Card>
            <CardHeader>
              <CardTitle>Rejected Applications</CardTitle>
            </CardHeader>
            <CardContent>
              {rejectedApplications.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No rejected applications.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Rejected Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rejectedApplications.map((contractor) => (
                      <TableRow key={contractor.id}>
                        <TableCell className="font-medium">
                          {contractor.profileName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {contractor.email || (emailsLoading ? "..." : "-")}
                        </TableCell>
                        <TableCell>{contractor.business_name || "-"}</TableCell>
                        <TableCell>
                          {contractor.approved_at
                            ? new Date(contractor.approved_at).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openReviewDialog(contractor)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(contractor)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedContractor?.approval_status === "pending" 
                ? "Review Contractor Application" 
                : "Contractor Details"}
            </DialogTitle>
          </DialogHeader>

          {selectedContractor && (
            <Tabs defaultValue="details" className="space-y-4">
              {selectedContractor.approval_status !== "pending" && (
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="performance" className="flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5" />
                    Performance
                  </TabsTrigger>
                </TabsList>
              )}
              <TabsContent value="details">
                <ScrollArea className="max-h-[55vh] pr-4">
                  <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Applicant Name</Label>
                    <p className="font-medium">{selectedContractor.profileName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Business Name</Label>
                    <p className="font-medium">{selectedContractor.business_name || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">ABN</Label>
                    <p className="font-medium">{selectedContractor.abn || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Phone</Label>
                    <p className="font-medium">{selectedContractor.phone || selectedContractor.profilePhone || "-"}</p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Business Address</Label>
                    <p className="font-medium">{selectedContractor.business_address || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Applied Date</Label>
                    <p className="font-medium">
                      {selectedContractor.applied_at
                        ? new Date(selectedContractor.applied_at).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <div className="mt-1">
                      {getStatusBadge(selectedContractor.approval_status, selectedContractor.is_active)}
                    </div>
                  </div>
                </div>

                {/* Service Areas */}
                {selectedContractor.service_areas && selectedContractor.service_areas.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Serviced Suburbs ({selectedContractor.service_areas.length})
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {selectedContractor.service_areas.map((suburb, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {suburb}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Insurance Certificate - Enhanced */}
                <div className="space-y-3 p-4 border rounded-lg">
                  <Label className="flex items-center gap-2 text-base font-semibold">
                    <Shield className="w-4 h-4" />
                    Insurance Verification
                  </Label>
                  
                  {/* Certificate Preview/Download */}
                  {insuranceUrl ? (
                    <div className="space-y-2">
                      {insuranceUrl.match(/\.(jpg|jpeg|png|webp)/) && (
                        <img src={insuranceUrl} alt="Insurance Certificate" className="max-h-40 rounded border object-contain" />
                      )}
                      <a
                        href={insuranceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Download className="w-4 h-4" />
                        Download Certificate
                      </a>
                    </div>
                  ) : selectedContractor.insurance_certificate_url ? (
                    <p className="text-muted-foreground text-sm">Loading certificate...</p>
                  ) : (
                    <p className="text-muted-foreground text-sm">No certificate uploaded</p>
                  )}

                  {/* Insurance Expiry Date */}
                  <div className="space-y-1">
                    <Label htmlFor="adminInsuranceExpiry" className="text-sm">Insurance Expiry Date</Label>
                    <Input
                      id="adminInsuranceExpiry"
                      type="date"
                      value={insuranceExpiryDate}
                      onChange={(e) => setInsuranceExpiryDate(e.target.value)}
                    />
                    {insuranceExpiryDate && new Date(insuranceExpiryDate) < new Date() && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Insurance has expired
                      </p>
                    )}
                  </div>

                  {/* Verification Checkbox */}
                  <div className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg">
                    <Checkbox
                      id="insuranceVerified"
                      checked={insuranceVerified}
                      onCheckedChange={(checked) => setInsuranceVerified(checked === true)}
                    />
                    <label htmlFor="insuranceVerified" className="text-sm leading-relaxed cursor-pointer">
                      Insurance certificate verified and adequate (min $5M cover confirmed)
                    </label>
                  </div>
                </div>

                {/* Service Radius */}
                {selectedContractor.service_radius_km && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Service Radius
                    </Label>
                    <p className="font-medium">{selectedContractor.service_radius_km} km</p>
                  </div>
                )}

                {/* Questionnaire Responses */}
                {selectedContractor.questionnaire_responses && (
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Application Questionnaire</Label>
                    {(() => {
                      const responses = parseQuestionnaire(selectedContractor.questionnaire_responses);
                      if (!responses) return null;

                      return (
                        <>
                          {/* Identity Details */}
                          {responses.identity && (
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                Identity & Business Details
                              </Label>
                              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                {responses.identity.businessName && (
                                  <div>
                                    <span className="text-sm text-muted-foreground">Business Name: </span>
                                    <span className="font-medium">{responses.identity.businessName}</span>
                                  </div>
                                )}
                                {responses.identity.fullName && (
                                  <div>
                                    <span className="text-sm text-muted-foreground">Full Name: </span>
                                    <span className="font-medium">{responses.identity.fullName}</span>
                                  </div>
                                )}
                                {responses.identity.mobileNumber && (
                                  <div>
                                    <span className="text-sm text-muted-foreground">Mobile: </span>
                                    <span className="font-medium">{responses.identity.mobileNumber}</span>
                                  </div>
                                )}
                                {responses.identity.businessAddress && (
                                  <div>
                                    <span className="text-sm text-muted-foreground">Business Address: </span>
                                    <span className="font-medium">{responses.identity.businessAddress}</span>
                                  </div>
                                )}
                                {responses.identity.mailingAddress && responses.identity.mailingAddress !== responses.identity.businessAddress && (
                                  <div>
                                    <span className="text-sm text-muted-foreground">Mailing Address: </span>
                                    <span className="font-medium">{responses.identity.mailingAddress}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  {responses.identity.confirmIndependentBusiness ? (
                                    <Check className="w-4 h-4 text-primary" />
                                  ) : (
                                    <X className="w-4 h-4 text-destructive" />
                                  )}
                                  <span className="text-sm">Confirmed independent business operator</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {responses.identity.confirmInsuranceCoverage ? (
                                    <Check className="w-4 h-4 text-primary" />
                                  ) : (
                                    <X className="w-4 h-4 text-destructive" />
                                  )}
                                  <span className="text-sm">Insurance covers lawn care services</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {responses.services && (
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                <Wrench className="w-4 h-4" />
                                Services & Equipment
                              </Label>
                              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                <div>
                                  <span className="text-sm text-muted-foreground">Mower Types: </span>
                                  <span className="font-medium">
                                    {responses.services.mowerTypes?.join(", ") || "Not specified"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-sm text-muted-foreground">Offers Green Waste Removal: </span>
                                  <span className="font-medium">
                                    {responses.services.offersGreenWasteRemoval === true ? "Yes" : responses.services.offersGreenWasteRemoval === false ? "No" : "Not specified"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {responses.experience && (
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Experience
                              </Label>
                              <div className="bg-muted/50 rounded-lg p-3">
                                <span className="text-sm text-muted-foreground">Years of Experience: </span>
                                <span className="font-medium">
                                  {responses.experience.yearsExperience || "Not specified"}
                                </span>
                                {responses.experience.portfolioPhotoPaths && responses.experience.portfolioPhotoPaths.length > 0 && (
                                  <div className="mt-2">
                                    <span className="text-sm text-muted-foreground">
                                      Portfolio: {responses.experience.portfolioPhotoPaths.length} photo(s) uploaded
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {responses.operationalRules && (
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                <Check className="w-4 h-4" />
                                Operational Rules Agreement
                              </Label>
                              <div className="bg-muted/50 rounded-lg p-3">
                                <ul className="text-sm space-y-1">
                                  {Object.entries(responses.operationalRules).map(([key, value]) => (
                                    <li key={key} className="flex items-start gap-2">
                                      {value ? (
                                        <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                                      ) : (
                                        <X className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                                      )}
                                      <span>{operationalRuleLabels[key] || key}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Admin Notes */}
                {selectedContractor.approval_status === "pending" && (
                  <div className="space-y-2">
                    <Label>Admin Notes (Optional)</Label>
                    <Textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add any notes about this application..."
                      rows={3}
                    />
                  </div>
                )}
              </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="performance">
                <ScrollArea className="max-h-[55vh] pr-4">
                  <ContractorPerformanceTab contractor={selectedContractor} />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          {selectedContractor?.approval_status === "pending" && (
            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                onClick={() => handleApproval(false)}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <X className="w-4 h-4 mr-2" />
                )}
                Reject
              </Button>
              <Button 
                onClick={() => handleApproval(true)} 
                disabled={processing || !insuranceVerified || !insuranceExpiryDate}
                title={!insuranceVerified || !insuranceExpiryDate ? "Verify insurance and set expiry date before approving" : ""}
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Approve
              </Button>
              {(!insuranceVerified || !insuranceExpiryDate) && (
                <p className="text-xs text-muted-foreground w-full text-right">
                  ⚠️ Verify insurance and set expiry date to enable approval
                </p>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contractor</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input
                value={editBusinessName}
                onChange={(e) => setEditBusinessName(e.target.value)}
                placeholder="e.g., Green Thumb Lawn Care"
              />
            </div>

            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="e.g., 0412 345 678"
              />
            </div>

            <div className="space-y-2">
              <Label>Service Areas</Label>
              <Input
                value={editServiceAreas}
                onChange={(e) => setEditServiceAreas(e.target.value)}
                placeholder="e.g., Brisbane, Gold Coast, Ipswich"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of suburbs/cities.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Service Radius (km)</Label>
              <Input
                type="number"
                value={editServiceRadius}
                onChange={(e) => setEditServiceRadius(e.target.value)}
                placeholder="e.g., 25"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={processing}>
              {processing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contractor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently remove {selectedContractor?.profileName} as a contractor? 
              This will delete their contractor profile and remove their contractor role.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ContractorApplicationsTab;
