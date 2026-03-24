import { useState, useEffect, useMemo, useCallback } from "react";
import { autoShiftTime } from "@/lib/scheduleConflict";
import { supabase } from "@/integrations/supabase/client";
import type { WorkingHours } from "./WorkingHoursEditor";
import PlatformBookingDetailDialog from "./PlatformBookingDetailDialog";
import JobCompletionDialog from "./JobCompletionDialog";
import SuggestTimeDialog from "./SuggestTimeDialog";
import MarkPaidDialog from "./MarkPaidDialog";
import QuoteResponseDialog from "./QuoteResponseDialog";
import MissingAddressesDialog from "./MissingAddressesDialog";
import OptimizationPreviewDialog from "./OptimizationPreviewDialog";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Pencil, Loader2, Calendar, ChevronLeft, ChevronRight, List, LayoutGrid, Check, X, MapPin, CheckCircle2, DollarSign, Clock, Trash2, MessageSquare, Send, RefreshCw, PencilLine } from "lucide-react";
import DayTimeline from "./DayTimeline";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek, isToday } from "date-fns";
import type { Tables, Json } from "@/integrations/supabase/types";

type Job = Tables<"jobs">;
type Client = Tables<"clients">;
type ServiceOffering = Tables<"service_offerings">;

interface ClientAddress {
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

interface JobsTabProps {
  contractorId: string;
  subscriptionTier?: string;
  workingHours?: WorkingHours | null;
  onOpenRouteOptimization?: () => void;
}

const statusColors: Record<string, string> = {
  scheduled: "bg-sky/20 text-sky border-sky/30",
  in_progress: "bg-sunshine/20 text-sunshine border-sunshine/30",
  completed: "bg-primary/20 text-primary border-primary/30",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
  pending_confirmation: "bg-sunshine/20 text-sunshine border-sunshine/30",
  // Platform booking statuses
  pending: "bg-sunshine/20 text-sunshine border-sunshine/30",
  confirmed: "bg-sky/20 text-sky border-sky/30",
  
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface RecurrenceRule {
  frequency: "weekly" | "fortnightly" | "monthly";
  interval: number;
  count?: number;
}

// Unified item that can represent either a CRM job or a platform booking
interface UnifiedJob {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  total_price: number | null;
  client_name: string;
  client_address?: ClientAddress | null;
  description: string | null;
  notes: string | null;
  recurrence_rule: Json | null;
  recurring_job_id: string | null;
  source: "crm" | "platform";
  // CRM-only fields
  client_id?: string;
  duration_minutes?: number | null;
  requires_quote?: boolean;
  quote_status?: string;
  customer_email?: string | null;
  // Platform-only fields
  address_street?: string;
  address_city?: string;
  address_state?: string;
}

const JobsTab = ({ contractorId, subscriptionTier, workingHours: contractorWorkingHours, onOpenRouteOptimization }: JobsTabProps) => {
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [serviceOfferings, setServiceOfferings] = useState<ServiceOffering[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "timeline">("timeline");
  const [timelineDate, setTimelineDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [platformDetailOpen, setPlatformDetailOpen] = useState(false);
  const [selectedPlatformBookingId, setSelectedPlatformBookingId] = useState<string | null>(null);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionJob, setCompletionJob] = useState<{
    id: string; title: string; source: string; total_price: number | null; client_name: string; payment_status: string;
    requires_quote?: boolean; quote_type?: string | null; quoted_rate?: number | null; quoted_hours?: number | null;
  } | null>(null);
  const [suggestTimeOpen, setSuggestTimeOpen] = useState(false);
  const [suggestTimeJob, setSuggestTimeJob] = useState<{
    id: string; title: string; client_name: string; scheduled_date: string; source: "crm" | "platform";
  } | null>(null);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markPaidJob, setMarkPaidJob] = useState<{
    id: string; title: string; client_name: string; total_price: number | null;
  } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingSuggestionJobIds, setPendingSuggestionJobIds] = useState<Set<string>>(new Set());
  const [seriesInfo, setSeriesInfo] = useState<{ id: string; frequency: string; count: number } | null>(null);
  const [saveScope, setSaveScope] = useState<null | "pending">(null);
  const [originalFormValues, setOriginalFormValues] = useState<Record<string, any> | null>(null);
  const [deleteSeriesOpen, setDeleteSeriesOpen] = useState(false);
  const [frequencyChangeConfirmOpen, setFrequencyChangeConfirmOpen] = useState(false);
  const [listPage, setListPage] = useState(0);
  const PAGE_SIZE = 25;
  const [quoteResponseOpen, setQuoteResponseOpen] = useState(false);
  const [quoteResponseJob, setQuoteResponseJob] = useState<{
    id: string; title: string; client_name: string; description: string | null; customer_email?: string | null;
  } | null>(null);
  const [useCustomTitle, setUseCustomTitle] = useState(false);
  const [priceHelperText, setPriceHelperText] = useState<string | null>(null);
  const [missingAddressDialogOpen, setMissingAddressDialogOpen] = useState(false);
  const [missingAddressJobs, setMissingAddressJobs] = useState<{ jobId: string; jobTitle: string; clientName: string; clientId: string }[]>([]);
  const [optimizationPreview, setOptimizationPreview] = useState<any>(null);
  const [optimizationPreviewOpen, setOptimizationPreviewOpen] = useState(false);
  const [isApplyingOptimization, setIsApplyingOptimization] = useState(false);
  const [editClientDialogOpen, setEditClientDialogOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  const handleRunOptimization = async () => {
    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("route-optimization", {
        body: { contractor_id: contractorId, preview: true },
      });
      if (error) throw error;
      if (data?.result) {
        const r = data.result;
        // Handle missing addresses error
        if (r.error === "missing_addresses") {
          setMissingAddressJobs(r.affectedJobs || []);
          setMissingAddressDialogOpen(true);
          setIsOptimizing(false);
          return;
        }
        // If no changes needed, show toast
        if (!r.proposedChanges || r.proposedChanges.length === 0) {
          toast.success(r.message || "Your schedule is already optimised — no changes needed.", { duration: 4000 });
        } else {
          // Show preview dialog
          setOptimizationPreview(r);
          setOptimizationPreviewOpen(true);
        }
      } else {
        toast.info("No optimization opportunities found for today's jobs.");
      }
    } catch (err) {
      console.error("Optimization error:", err);
      toast.error("Failed to run route optimization");
    }
    setIsOptimizing(false);
  };

  const handleApplyOptimization = async () => {
    setIsApplyingOptimization(true);
    try {
      const { data, error } = await supabase.functions.invoke("route-optimization", {
        body: { contractor_id: contractorId, preview: false },
      });
      if (error) throw error;
      toast.success("Route optimisation applied!");
      setOptimizationPreviewOpen(false);
      setOptimizationPreview(null);
      fetchData();
    } catch (err) {
      console.error("Apply optimization error:", err);
      toast.error("Failed to apply route optimization");
    }
    setIsApplyingOptimization(false);
  };

  const handleEditClientFromMissingAddress = (clientId: string) => {
    setMissingAddressDialogOpen(false);
    setEditingClientId(clientId);
    setEditClientDialogOpen(true);
  };

  // Helper to check if a client has a valid address
  const clientHasValidAddress = useCallback((clientId: string): boolean => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return false;
    const addr = client.address as any;
    if (!addr) return false;
    const street = (addr.street || "").trim();
    const city = (addr.city || "").trim();
    const postcode = (addr.postcode || "").trim();
    return street.length > 0 && (city.length > 0 || postcode.length > 0);
  }, [clients]);

  const [form, setForm] = useState({
    title: "Lawn Mowing",
    client_id: "",
    description: "",
    scheduled_date: "",
    scheduled_time: "",
    duration_minutes: "",
    total_price: "",
    notes: "",
    status: "scheduled",
    is_recurring: false,
    recurrence_frequency: "weekly" as "weekly" | "fortnightly" | "monthly",
    recurrence_count: "4",
  });

  useEffect(() => {
    fetchData();
    fetchPendingSuggestions();
    fetchServiceOfferings();
  }, [contractorId]);

  const fetchServiceOfferings = async () => {
    const { data } = await supabase
      .from("service_offerings")
      .select("*")
      .eq("contractor_id", contractorId)
      .eq("is_active", true)
      .order("created_at");
    if (data) setServiceOfferings(data);
  };

  const getContractorBasePrice = async (): Promise<number | null> => {
    const { data } = await supabase
      .from("contractors")
      .select("questionnaire_responses")
      .eq("id", contractorId)
      .single();
    const pricing = (data?.questionnaire_responses as any)?.pricing;
    return pricing?.base_price ?? null;
  };

  const enabledServices = useMemo(() => {
    if (serviceOfferings.length === 0) return [];
    const CATEGORY_ORDER: Record<string, number> = { lawn: 0, garden: 1, removal: 2, other: 3 };
    return [...serviceOfferings].sort((a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99));
  }, [serviceOfferings]);

  const isLawnService = (name: string) => {
    const lawnNames = ["lawn mowing", "edging & trimming", "edging and trimming"];
    return lawnNames.includes(name.toLowerCase());
  };

  const handleServiceSelect = async (value: string) => {
    if (value === "__custom__") {
      setUseCustomTitle(true);
      setForm(f => ({ ...f, title: "" }));
      setPriceHelperText(null);
      return;
    }
    setUseCustomTitle(false);
    setForm(f => ({ ...f, title: value }));

    const service = enabledServices.find(s => s.name === value);
    if (service) {
      if (isLawnService(service.name)) {
        const basePrice = await getContractorBasePrice();
        if (basePrice) {
          setForm(f => ({ ...f, title: value, total_price: basePrice.toString() }));
        }
        setPriceHelperText(null);
      } else if (service.requires_quote) {
        setPriceHelperText("Quote required — enter the agreed price for this job.");
        if (service.default_rate) {
          setForm(f => ({ ...f, title: value, total_price: service.default_rate!.toString() }));
        } else {
          setForm(f => ({ ...f, title: value, total_price: "" }));
        }
      } else {
        setPriceHelperText(null);
      }
    }
  };

  const fetchPendingSuggestions = async () => {
    // Fetch alternative_suggestions with status='pending' for this contractor
    const { data } = await supabase
      .from("alternative_suggestions")
      .select("job_id, booking_id")
      .eq("contractor_id", contractorId)
      .eq("status", "pending");
    if (data) {
      const ids = new Set<string>();
      data.forEach(s => {
        if (s.job_id) ids.add(s.job_id);
        if (s.booking_id) ids.add(s.booking_id);
      });
      setPendingSuggestionJobIds(ids);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    const [jobsRes, clientsRes, bookingsRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("contractor_id", contractorId).order("scheduled_date", { ascending: false }),
      supabase.from("clients").select("*").eq("contractor_id", contractorId).order("name"),
      // Fetch platform bookings assigned or preferred to this contractor
      supabase.from("bookings").select(`
        id, status, scheduled_date, scheduled_time, total_price, grass_length, notes, clippings_removal, user_id,
        address:addresses(street_address, city, state, postal_code)
      `).eq("contractor_id", contractorId)
        .order("scheduled_date", { ascending: false }),
    ]);

    if (clientsRes.data) setClients(clientsRes.data);

    const unifiedJobs: UnifiedJob[] = [];

    // Add CRM jobs
    if (jobsRes.data && clientsRes.data) {
      const clientMap = new Map(clientsRes.data.map((c) => [c.id, c]));
      jobsRes.data.forEach((j) => {
        const client = clientMap.get(j.client_id);
        unifiedJobs.push({
          id: j.id,
          title: j.title,
          status: j.status,
          scheduled_date: j.scheduled_date,
          scheduled_time: j.scheduled_time,
          total_price: j.total_price,
          client_name: client?.name || "Unknown",
          client_address: client?.address as ClientAddress | null,
          description: j.description,
          notes: j.notes,
          recurrence_rule: j.recurrence_rule,
          recurring_job_id: j.recurring_job_id || null,
          source: "crm",
          client_id: j.client_id,
          duration_minutes: j.duration_minutes,
          requires_quote: j.requires_quote,
          quote_status: j.quote_status,
          customer_email: j.customer_email,
        });
      });
    }

    // Add platform bookings (avoid duplicates by checking IDs)
    if (bookingsRes.data) {
      const existingIds = new Set(unifiedJobs.map((j) => j.id));
      // Fetch profile names for booking users
      const userIds = [...new Set(bookingsRes.data.map((b) => b.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) || []);

      bookingsRes.data.forEach((b) => {
        if (existingIds.has(b.id)) return;
        const addr = b.address as any;
        unifiedJobs.push({
          id: b.id,
          title: `Lawn Mowing${b.clippings_removal ? " + Clippings" : ""}`,
          status: b.status,
          scheduled_date: b.scheduled_date,
          scheduled_time: b.scheduled_time,
          total_price: b.total_price,
          client_name: profileMap.get(b.user_id) || "Customer",
          client_address: addr ? { street: addr.street_address, city: addr.city, state: addr.state, postcode: addr.postal_code } : null,
          description: null,
          notes: b.notes,
          recurrence_rule: null,
          recurring_job_id: null,
          source: "platform",
          address_street: addr?.street_address,
          address_city: addr?.city,
          address_state: addr?.state,
        });
      });
    }

    // Sort by date descending
    unifiedJobs.sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
    setJobs(unifiedJobs);
    setIsLoading(false);
  };

  const openCreateDialog = (dateOverride?: string) => {
    setEditingJob(null);
    const defaultTitle = enabledServices.length > 0 ? enabledServices[0].name : "Lawn Mowing";
    setUseCustomTitle(enabledServices.length === 0);
    setPriceHelperText(null);
    setForm({
      title: defaultTitle,
      client_id: clients.length > 0 ? clients[0].id : "",
      description: "",
      scheduled_date: dateOverride || new Date().toISOString().split("T")[0],
      scheduled_time: "09:00",
      duration_minutes: "60",
      total_price: "",
      notes: "",
      status: "scheduled",
      is_recurring: false,
      recurrence_frequency: "weekly",
      recurrence_count: "4",
    });
    setDialogOpen(true);
    // Auto-populate price for first service if it's a lawn service
    if (enabledServices.length > 0 && isLawnService(defaultTitle)) {
      getContractorBasePrice().then(bp => {
        if (bp) setForm(f => ({ ...f, total_price: bp.toString() }));
      });
    }
  };

  const openEditDialog = async (job: Job) => {
    const recurringId = job.recurring_job_id;
    if (recurringId) {
      const { count } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("recurring_job_id", recurringId);
      const recRule = job.recurrence_rule as unknown as RecurrenceRule | null;
      setSeriesInfo({
        id: recurringId,
        frequency: recRule?.frequency || "weekly",
        count: count || 1,
      });
    } else {
      setSeriesInfo(null);
    }
    setSaveScope(null);
    proceedToEditDialog(job);
  };

  const proceedToEditDialog = (job: Job) => {
    setEditingJob(job);
    const recurrence = job.recurrence_rule as unknown as RecurrenceRule | null;
    // Check if title matches an enabled service
    const matchesService = enabledServices.some(s => s.name === job.title);
    setUseCustomTitle(!matchesService);
    setPriceHelperText(null);
    const formValues = {
      title: job.title,
      client_id: job.client_id,
      description: job.description || "",
      scheduled_date: job.scheduled_date,
      scheduled_time: job.scheduled_time || "",
      duration_minutes: job.duration_minutes?.toString() || "",
      total_price: job.total_price?.toString() || "",
      notes: job.notes || "",
      status: job.status,
      is_recurring: !!recurrence,
      recurrence_frequency: recurrence?.frequency || "weekly",
      recurrence_count: recurrence?.count?.toString() || "4",
    };
    setForm(formValues);
    setOriginalFormValues({ ...formValues });
    setDialogOpen(true);
  };

  // Helper: get existing job slots for a given date (for conflict detection)
  const getSameDaySlots = useCallback(async (date: string, excludeJobId?: string) => {
    const sameDayJobs = jobs.filter(
      (j) => j.scheduled_date === date && j.scheduled_time && j.status !== "cancelled" && j.id !== excludeJobId,
    );
    return sameDayJobs.map((j) => ({
      id: j.id,
      scheduled_time: j.scheduled_time!,
      duration_minutes: j.duration_minutes || 60,
    }));
  }, [jobs]);

  const handleSave = async () => {
    if (!form.client_id) { toast.error("Please select a client"); return; }
    if (!form.scheduled_date) { toast.error("Please select a date"); return; }

    // For recurring jobs with field changes, show scope selection first
    if (editingJob && seriesInfo && !saveScope) {
      const hasFieldChanges = originalFormValues && (
        form.title !== originalFormValues.title ||
        form.scheduled_date !== originalFormValues.scheduled_date ||
        form.scheduled_time !== originalFormValues.scheduled_time ||
        form.total_price !== originalFormValues.total_price ||
        form.duration_minutes !== originalFormValues.duration_minutes ||
        form.notes !== originalFormValues.notes ||
        form.recurrence_frequency !== originalFormValues.recurrence_frequency
      );
      if (hasFieldChanges) {
        setSaveScope("pending");
        return;
      }
    }

    await executeSave(null);
  };

  const handleSaveThisOnly = () => executeSave("this");

  const handleSaveAllFuture = async () => {
    if (originalFormValues && form.recurrence_frequency !== originalFormValues.recurrence_frequency) {
      setFrequencyChangeConfirmOpen(true);
      return;
    }
    await executeSave("future");
  };

  const executeSave = async (scope: "this" | "future" | null) => {
    setIsSaving(true);
    setFrequencyChangeConfirmOpen(false);

    const recurrenceRule: RecurrenceRule | null = form.is_recurring
      ? { frequency: form.recurrence_frequency, interval: form.recurrence_frequency === "fortnightly" ? 2 : 1, count: parseInt(form.recurrence_count) || 4 }
      : null;

    let resolvedTime = form.scheduled_time || null;
    let originalTime: string | null = null;
    if (resolvedTime) {
      const duration = form.duration_minutes ? parseInt(form.duration_minutes) : 60;
      const existing = await getSameDaySlots(form.scheduled_date, editingJob?.id);
      const result = autoShiftTime(resolvedTime, duration, existing);
      if (result.shifted) {
        originalTime = resolvedTime;
        resolvedTime = result.newTime;
        toast.info(result.message);
      }
    }

    const payload: Record<string, any> = {
      contractor_id: contractorId,
      client_id: form.client_id,
      title: form.title.trim() || "Lawn Mowing",
      description: form.description.trim() || null,
      scheduled_date: form.scheduled_date,
      scheduled_time: resolvedTime,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      total_price: form.total_price ? parseFloat(form.total_price) : null,
      notes: form.notes.trim() || null,
      status: form.status,
      original_scheduled_time: originalTime,
      completed_at: form.status === "completed" ? new Date().toISOString() : null,
      recurrence_rule: recurrenceRule as unknown as Json,
    };

    if (editingJob) {
      // "Save this only": detach from series
      if (scope === "this" && editingJob.recurring_job_id) {
        payload.recurring_job_id = null;
        payload.recurrence_rule = null;
      }

      const { error } = await supabase.from("jobs").update(payload).eq("id", editingJob.id);
      if (error) { toast.error("Failed to update job"); setIsSaving(false); return; }

      if (scope === "future" && editingJob.recurring_job_id) {
        const today = new Date().toISOString().split("T")[0];
        const frequencyChanged = originalFormValues && form.recurrence_frequency !== originalFormValues.recurrence_frequency;

        if (frequencyChanged) {
          // Call edge function to delete+regenerate with new frequency
          const { error: fnError } = await supabase.functions.invoke("manage-recurring-series", {
            body: {
              action: "change_frequency",
              series_id: editingJob.recurring_job_id,
              current_job_id: editingJob.id,
              new_frequency: form.recurrence_frequency,
              contractor_id: contractorId,
            },
          });
          if (fnError) toast.error("Failed to update series frequency");
          else toast.success("Series frequency updated and future jobs regenerated");
        } else {
          const dateChanged = originalFormValues && form.scheduled_date !== originalFormValues.scheduled_date;
          const timeChanged = originalFormValues && form.scheduled_time !== originalFormValues.scheduled_time;

          if (dateChanged && originalFormValues) {
            // Day-of-week shift: apply same shift to all future jobs
            const oldDow = new Date(originalFormValues.scheduled_date).getDay();
            const newDow = new Date(form.scheduled_date).getDay();
            const dowShift = newDow - oldDow;

            const { data: futureJobs } = await supabase
              .from("jobs")
              .select("id, scheduled_date")
              .eq("recurring_job_id", editingJob.recurring_job_id)
              .neq("id", editingJob.id)
              .gte("scheduled_date", today)
              .eq("status", "scheduled");

            if (futureJobs) {
              const fieldUpdates: Record<string, any> = {};
              if (form.title !== originalFormValues.title) fieldUpdates.title = form.title.trim() || "Lawn Mowing";
              if (form.total_price !== originalFormValues.total_price) fieldUpdates.total_price = form.total_price ? parseFloat(form.total_price) : null;
              if (form.duration_minutes !== originalFormValues.duration_minutes) fieldUpdates.duration_minutes = form.duration_minutes ? parseInt(form.duration_minutes) : null;
              if (form.notes !== originalFormValues.notes) fieldUpdates.notes = form.notes.trim() || null;
              if (timeChanged) fieldUpdates.scheduled_time = resolvedTime;

              for (const fj of futureJobs) {
                const fjDate = new Date(fj.scheduled_date);
                fjDate.setDate(fjDate.getDate() + dowShift);
                await supabase.from("jobs").update({
                  ...fieldUpdates,
                  scheduled_date: fjDate.toISOString().split("T")[0],
                }).eq("id", fj.id);
              }
            }
          } else if (originalFormValues) {
            // No date change — bulk update other fields
            const futurePayload: Record<string, any> = {};
            if (timeChanged) futurePayload.scheduled_time = resolvedTime;
            if (form.title !== originalFormValues.title) futurePayload.title = form.title.trim() || "Lawn Mowing";
            if (form.total_price !== originalFormValues.total_price) futurePayload.total_price = form.total_price ? parseFloat(form.total_price) : null;
            if (form.duration_minutes !== originalFormValues.duration_minutes) futurePayload.duration_minutes = form.duration_minutes ? parseInt(form.duration_minutes) : null;
            if (form.notes !== originalFormValues.notes) futurePayload.notes = form.notes.trim() || null;

            if (Object.keys(futurePayload).length > 0) {
              await supabase.from("jobs").update(futurePayload)
                .eq("recurring_job_id", editingJob.recurring_job_id)
                .neq("id", editingJob.id)
                .gte("scheduled_date", today)
                .eq("status", "scheduled");
            }
          }
          toast.success("Updated this job and all future jobs");
        }
      } else if (scope === "this") {
        toast.success("Job updated (detached from series)");
      } else {
        toast.success("Job updated");
      }

      setSaveScope(null);
      setSeriesInfo(null);
      setOriginalFormValues(null);
      setDialogOpen(false);
      fetchData();
    } else {
      // Create new job
      const seriesId = form.is_recurring ? crypto.randomUUID() : null;
      const createPayload = { ...payload, ...(seriesId ? { recurring_job_id: seriesId } : {}) };

      const { error } = await supabase.from("jobs").insert(createPayload as any);
      if (error) { toast.error("Failed to create job"); setIsSaving(false); return; }

      if (form.is_recurring && seriesId) {
        const count = parseInt(form.recurrence_count) || 4;
        const baseDate = new Date(form.scheduled_date);
        const additionalJobs = [];

        for (let i = 1; i < count; i++) {
          const nextDate = new Date(baseDate);
          if (form.recurrence_frequency === "weekly") {
            nextDate.setDate(baseDate.getDate() + i * 7);
          } else if (form.recurrence_frequency === "fortnightly") {
            nextDate.setDate(baseDate.getDate() + i * 14);
          } else {
            nextDate.setMonth(baseDate.getMonth() + i);
          }
          additionalJobs.push({ ...createPayload, scheduled_date: nextDate.toISOString().split("T")[0] });
        }

        if (additionalJobs.length > 0) {
          const { error: batchError } = await supabase.from("jobs").insert(additionalJobs as any);
          if (batchError) toast.error("Some recurring jobs failed to create");
        }
        toast.success(`Created ${count} recurring jobs`);
      } else {
        toast.success("Job created");
      }

      setDialogOpen(false);
      fetchData();
    }
    setIsSaving(false);
  };

  const handleConfirmJob = async (jobId: string, source: "crm" | "platform") => {
    // Clean up any pending alternative suggestions for this job
    if (pendingSuggestionJobIds.has(jobId)) {
      if (source === "platform") {
        await supabase.from("alternative_suggestions").update({ status: "dismissed" }).eq("booking_id", jobId).eq("status", "pending");
      } else {
        await supabase.from("alternative_suggestions").update({ status: "dismissed" }).eq("job_id", jobId).eq("status", "pending");
      }
    }

    if (source === "platform") {
      const { error } = await supabase.from("bookings").update({ 
        contractor_id: contractorId, 
        status: "confirmed" as any,
        contractor_accepted_at: new Date().toISOString(),
      }).eq("id", jobId);
      if (error) toast.error("Failed to accept booking");
      else { toast.success("Booking accepted"); fetchData(); fetchPendingSuggestions(); }
    } else {
      const { error } = await supabase.from("jobs").update({ status: "scheduled" }).eq("id", jobId);
      if (error) toast.error("Failed to confirm job");
      else { toast.success("Job confirmed"); fetchData(); fetchPendingSuggestions(); }
    }
  };

  const handleDeclineJob = async (jobId: string, source: "crm" | "platform") => {
    if (source === "platform") {
      const { error } = await supabase.from("bookings").update({ status: "cancelled" as any }).eq("id", jobId);
      if (error) toast.error("Failed to decline booking");
      else { toast.success("Booking declined"); fetchData(); }
    } else {
      const { error } = await supabase.from("jobs").update({ status: "cancelled" }).eq("id", jobId);
      if (error) toast.error("Failed to decline job");
      else { toast.success("Job declined"); fetchData(); }
    }
  };

  const handleSuggestTime = (job: UnifiedJob) => {
    setSuggestTimeJob({
      id: job.id,
      title: job.title,
      client_name: job.client_name,
      scheduled_date: job.scheduled_date,
      source: job.source,
    });
    setSuggestTimeOpen(true);
  };

  const handleOpenMarkPaid = (job: UnifiedJob) => {
    setMarkPaidJob({
      id: job.id,
      title: job.title,
      client_name: job.client_name,
      total_price: job.total_price,
    });
    setMarkPaidOpen(true);
  };

  const handleOpenQuoteResponse = (job: UnifiedJob) => {
    setQuoteResponseJob({
      id: job.id,
      title: job.title,
      client_name: job.client_name,
      description: job.description,
      customer_email: job.customer_email,
    });
    setQuoteResponseOpen(true);
  };

  const handleStartCompletion = (job: UnifiedJob) => {
    setCompletionJob({
      id: job.id,
      title: job.title,
      source: job.source === "platform" ? "website_booking" : "manual",
      total_price: job.total_price,
      client_name: job.client_name,
      payment_status: "unpaid",
      requires_quote: (job as any).requires_quote || false,
      quote_type: (job as any).quote_type || null,
      quoted_rate: (job as any).quoted_rate || null,
      quoted_hours: (job as any).quoted_hours || null,
    });
    setCompletionDialogOpen(true);
  };

  const handleDeleteJob = async () => {
    if (!deletingJobId) return;
    setIsDeleting(true);
    const { error } = await supabase.from("jobs").delete().eq("id", deletingJobId);
    if (error) {
      toast.error("Failed to delete job");
    } else {
      toast.success("Job deleted");
      setDialogOpen(false);
      fetchData();
    }
    setIsDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteSeriesOpen(false);
    setDeletingJobId(null);
  };

  const handleDeleteAllFuture = async () => {
    if (!deletingJobId || !editingJob?.recurring_job_id) return;
    setIsDeleting(true);
    const today = new Date().toISOString().split("T")[0];

    // Delete the current job
    const { error: currentError } = await supabase.from("jobs").delete().eq("id", deletingJobId);
    if (currentError) {
      toast.error("Failed to delete job");
      setIsDeleting(false);
      return;
    }

    // Delete all future scheduled jobs in the series
    const { error: futureError } = await supabase
      .from("jobs")
      .delete()
      .eq("recurring_job_id", editingJob.recurring_job_id)
      .gte("scheduled_date", today)
      .eq("status", "scheduled");

    if (futureError) toast.error("Some future jobs failed to delete");
    else toast.success("Deleted this job and all future jobs in the series");

    setIsDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteSeriesOpen(false);
    setDeletingJobId(null);
    setDialogOpen(false);
    fetchData();
  };

  const filtered = jobs.filter((j) => {
    const matchesSearch =
      j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.client_name && j.client_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Paginated slice for list view
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedJobs = filtered.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setListPage(0); }, [searchQuery, statusFilter]);

  // Pending confirmation jobs for the hero section
  const pendingJobs = jobs.filter(j => j.status === "pending_confirmation" || j.status === "pending");

  // Calendar data
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const jobsByDate = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((job) => {
      const key = job.scheduled_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(job);
    });
    return map;
  }, [filtered]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search jobs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending_confirmation">Pending</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <Button variant={viewMode === "timeline" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("timeline")} title="Timeline">
              <Clock className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === "calendar" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("calendar")} title="Calendar">
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("list")} title="List">
              <List className="w-4 h-4" />
            </Button>
          </div>
          {subscriptionTier && ["starter", "pro"].includes(subscriptionTier) && (
            <Button variant="outline" onClick={handleRunOptimization} disabled={isOptimizing}>
              {isOptimizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
              {isOptimizing ? "Optimizing..." : "Run Route Optimization"}
            </Button>
          )}
          <Button onClick={() => openCreateDialog()} disabled={clients.length === 0}>
            <Plus className="w-4 h-4 mr-2" /> New Job
          </Button>
        </div>
      </div>

      {clients.length === 0 && (
        <Card><CardContent className="py-8 text-center"><p className="text-muted-foreground text-sm">Add a client first before creating jobs.</p></CardContent></Card>
      )}

      {/* Pending Confirmation Section */}
      {pendingJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sunshine animate-pulse" />
            Pending Confirmation ({pendingJobs.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingJobs.map((job) => (
              <Card key={job.id} className={`${job.requires_quote && job.quote_status === "pending" ? "bg-amber-500/5 border-amber-500/40 ring-1 ring-amber-500/20" : pendingSuggestionJobIds.has(job.id) ? "bg-sunshine/5 border-sky/40 ring-1 ring-sky/20" : "bg-sunshine/5 border-sunshine/30"}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground text-sm">{job.title}</p>
                      <p className="text-xs text-muted-foreground">{job.client_name}</p>
                      {job.client_address && (job.client_address.city || job.client_address.postcode) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{[job.client_address.city, job.client_address.postcode].filter(Boolean).join(" ")}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] bg-sunshine/20 text-sunshine border-sunshine/30">
                        {job.source === "platform" ? "🌐 Website" : "Manual"}
                      </Badge>
                      {job.requires_quote && job.quote_status === "pending" && (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30 animate-pulse">
                          ⚡ Quote Needed
                        </Badge>
                      )}
                      {job.requires_quote && job.quote_status === "quoted" && (
                        <Badge variant="outline" className="text-[10px] bg-sky/20 text-sky border-sky/30">
                          💬 Quote Sent
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Pending alternative suggestions indicator */}
                  {pendingSuggestionJobIds.has(job.id) && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-sky/10 border border-sky/20">
                      <MessageSquare className="w-3.5 h-3.5 text-sky shrink-0" />
                      <span className="text-[11px] text-sky font-medium">Alternative times sent — awaiting customer response</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(job.scheduled_date), "dd MMM yyyy")}
                    </span>
                    {job.total_price && (
                      <span className="font-medium text-foreground">${Number(job.total_price).toFixed(2)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {job.requires_quote && job.quote_status === "pending" ? (
                      <>
                        <Button size="sm" className="flex-1" onClick={() => handleOpenQuoteResponse(job)}>
                          <Send className="w-3.5 h-3.5 mr-1" /> Send Quote
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeclineJob(job.id, job.source)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" className="flex-1" onClick={() => handleConfirmJob(job.id, job.source)}>
                          <Check className="w-3.5 h-3.5 mr-1" /> {pendingSuggestionJobIds.has(job.id) ? "Override & Confirm" : "Confirm"}
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => handleSuggestTime(job)}>
                          <Calendar className="w-3.5 h-3.5 mr-1" /> Reschedule
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeclineJob(job.id, job.source)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Timeline View */}
      {viewMode === "timeline" && clients.length > 0 && (
        <DayTimeline
          jobs={filtered.filter(j => j.scheduled_date === format(timelineDate, "yyyy-MM-dd")).map(j => ({
            id: j.id,
            title: j.title,
            client_name: j.client_name,
            scheduled_time: j.scheduled_time,
            duration_minutes: j.duration_minutes ?? null,
            status: j.status,
            source: j.source,
            client_address: j.client_address,
            original_scheduled_time: (j as any).original_scheduled_time ?? null,
          }))}
          date={timelineDate}
          onDateChange={setTimelineDate}
          workingHours={(() => {
            if (!contractorWorkingHours) return undefined;
            const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
            const dayKey = dayNames[timelineDate.getDay()];
            const schedule = contractorWorkingHours[dayKey];
            return schedule?.enabled ? { start: schedule.start, end: schedule.end } : null;
          })()}
          onRunOptimization={subscriptionTier && ["starter", "pro"].includes(subscriptionTier) ? handleRunOptimization : undefined}
          isOptimizing={isOptimizing}
          canOptimize={!!subscriptionTier && ["starter", "pro"].includes(subscriptionTier)}
          onJobClick={(job) => {
            const unified = jobs.find(j => j.id === job.id);
            if (!unified) return;
            if (unified.source === "platform") {
              setSelectedPlatformBookingId(unified.id);
              setPlatformDetailOpen(true);
            } else {
              openEditDialog(unified as any);
            }
          }}
          onJobReschedule={async (jobId, newTime, source) => {
            const dateStr = format(timelineDate, "yyyy-MM-dd");
            const job = jobs.find(j => j.id === jobId);
            const duration = job?.duration_minutes || 60;
            const existing = await getSameDaySlots(dateStr, jobId);
            const shift = autoShiftTime(newTime, duration, existing);
            const finalTime = shift.shifted ? shift.newTime : newTime;

            if (shift.shifted) toast.info(shift.message);

            if (source === "platform") {
              const { error } = await supabase.from("bookings").update({ scheduled_time: finalTime }).eq("id", jobId);
              if (error) { toast.error("Failed to reschedule"); return; }
            } else {
              const updatePayload: Record<string, any> = { scheduled_time: finalTime };
              if (shift.shifted) updatePayload.original_scheduled_time = newTime;
              else updatePayload.original_scheduled_time = null;
              const { error } = await supabase.from("jobs").update(updatePayload).eq("id", jobId);
              if (error) { toast.error("Failed to reschedule"); return; }
            }
            toast.success(`Rescheduled to ${finalTime}`);
            fetchData();
          }}
        />
      )}

      {viewMode === "calendar" && clients.length > 0 && (
        <Card>
          <CardContent className="p-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h3 className="font-display font-semibold text-lg text-foreground">
                {format(currentMonth, "MMMM yyyy")}
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {WEEKDAYS.map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">{day}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {calendarDays.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const dayJobs = jobsByDate.get(dateKey) || [];
                const inMonth = isSameMonth(day, currentMonth);
                const today = isToday(day);

                return (
                  <div
                    key={dateKey}
                    className={`min-h-[80px] md:min-h-[100px] p-1 cursor-pointer transition-colors hover:bg-muted/50 ${
                      inMonth ? "bg-card" : "bg-muted/30"
                    } ${today ? "ring-2 ring-primary ring-inset" : ""}`}
                    onClick={() => openCreateDialog(dateKey)}
                  >
                    <span className={`text-xs font-medium ${inMonth ? "text-foreground" : "text-muted-foreground/50"} ${today ? "text-primary font-bold" : ""}`}>
                      {format(day, "d")}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayJobs.slice(0, 3).map((job) => (
                        <div
                          key={job.id}
                          className={`text-[10px] md:text-xs px-1 py-0.5 rounded truncate cursor-pointer ${statusColors[job.status] || "bg-muted"}`}
                          onClick={(e) => { e.stopPropagation(); if (job.source === "crm") openEditDialog(job as any); else { setSelectedPlatformBookingId(job.id); setPlatformDetailOpen(true); } }}
                          title={`${job.title} - ${job.client_name}`}
                        >
                          {job.scheduled_time && <span className="font-medium">{job.scheduled_time} </span>}
                          {job.client_name}
                        </div>
                      ))}
                      {dayJobs.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">+{dayJobs.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List View */}
      {viewMode === "list" && clients.length > 0 && (
        filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-display font-semibold text-lg text-foreground mb-1">
                {jobs.length === 0 ? "No jobs yet" : "No matches"}
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                {jobs.length === 0 ? "Schedule your first job to get started." : "Try different filters."}
              </p>
              {jobs.length === 0 && <Button onClick={() => openCreateDialog()} size="sm"><Plus className="w-4 h-4 mr-1" /> New Job</Button>}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="hidden md:table-cell">Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedJobs.map((job) => (
                  <TableRow key={job.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { if (job.source === "platform") { setSelectedPlatformBookingId(job.id); setPlatformDetailOpen(true); } else { openEditDialog(job as any); } }}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        {job.title}
                        {job.recurrence_rule && <Badge variant="outline" className="text-[10px]">Recurring</Badge>}
                        {!job.scheduled_time && (
                          <Badge variant="outline" className="text-[10px] bg-sunshine/10 text-sunshine border-sunshine/30">No time set</Badge>
                        )}
                        {job.source === "crm" && job.client_id && !clientHasValidAddress(job.client_id) && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-sunshine/10 text-sunshine border-sunshine/30 cursor-pointer hover:bg-sunshine/20"
                            onClick={(e) => { e.stopPropagation(); setEditingClientId(job.client_id!); setEditClientDialogOpen(true); }}
                          >
                            <MapPin className="w-3 h-3 mr-0.5" /> No address
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{job.client_name}</div>
                      {job.client_address && (job.client_address.street || job.client_address.city) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {[job.client_address.street, job.client_address.city, job.client_address.postcode].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {format(new Date(job.scheduled_date), "dd MMM yyyy")}
                      {job.scheduled_time && ` ${job.scheduled_time}`}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {job.total_price ? `$${Number(job.total_price).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={statusColors[job.status] || ""}>
                          {job.source === "platform" && <span className="mr-1">🌐</span>}
                          {job.status === "in_progress" ? "In Progress" 
                            : job.status === "pending_confirmation" ? "Pending" 
                            : job.status === "pending" ? "Awaiting Accept"
                            : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                        </Badge>
                        {job.requires_quote && job.quote_status === "pending" && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30 animate-pulse">
                            ⚡ Quote Needed
                          </Badge>
                        )}
                        {job.requires_quote && job.quote_status === "quoted" && (
                          <Badge variant="outline" className="text-[10px] bg-sky/20 text-sky border-sky/30">
                            💬 Quoted
                          </Badge>
                        )}
                        {job.requires_quote && job.quote_status === "accepted" && (
                          <Badge variant="outline" className="text-[10px] bg-primary/20 text-primary border-primary/30">
                            ✅ Accepted
                          </Badge>
                        )}
                        {job.requires_quote && job.quote_status === "declined" && (
                          <Badge variant="outline" className="text-[10px] bg-destructive/20 text-destructive border-destructive/30">
                            Declined
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {/* Send Quote button for quote-required pending jobs */}
                        {job.requires_quote && job.quote_status === "pending" && (
                          <Button variant="ghost" size="icon" className="text-primary hover:text-primary" onClick={(e) => { e.stopPropagation(); handleOpenQuoteResponse(job); }} title="Send Quote">
                            <Send className="w-4 h-4" />
                          </Button>
                        )}
                        {(job.status === "pending_confirmation" || job.status === "pending") && !(job.requires_quote && job.quote_status === "pending") && (
                          <>
                            <Button variant="ghost" size="icon" className="text-primary hover:text-primary" onClick={(e) => { e.stopPropagation(); handleConfirmJob(job.id, job.source); }} title="Accept">
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); handleSuggestTime(job); }} title="Suggest New Time">
                              <Calendar className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeclineJob(job.id, job.source); }} title="Decline">
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {(job.status === "scheduled" || job.status === "in_progress" || job.status === "confirmed") && (
                          <Button variant="ghost" size="icon" className="text-primary hover:text-primary" onClick={(e) => { e.stopPropagation(); handleStartCompletion(job); }} title="Complete Job">
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                        {job.status === "completed" && (job as any).payment_status === "invoiced" && (
                          <Button variant="ghost" size="icon" className="text-primary hover:text-primary" onClick={(e) => { e.stopPropagation(); handleOpenMarkPaid(job); }} title="Mark as Paid">
                            <DollarSign className="w-4 h-4" />
                          </Button>
                        )}
                        {job.source === "crm" && <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditDialog(job as any); }}><Pencil className="w-4 h-4" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {listPage * PAGE_SIZE + 1}–{Math.min((listPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={listPage === 0} onClick={() => setListPage(p => p - 1)}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={listPage >= totalPages - 1} onClick={() => setListPage(p => p + 1)}>
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setSaveScope(null); setSeriesInfo(null); setOriginalFormValues(null); setUseCustomTitle(false); setPriceHelperText(null); } }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJob ? "Edit Job" : "New Job"}</DialogTitle>
            {editingJob && <DialogDescription>Update the job details below.</DialogDescription>}
          </DialogHeader>
          <div className="space-y-4">
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
              <Label>Service / Job Title</Label>
              {enabledServices.length > 0 && !useCustomTitle ? (
                <Select value={form.title} onValueChange={handleServiceSelect}>
                  <SelectTrigger><SelectValue placeholder="Select a service" /></SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const grouped = enabledServices.reduce<Record<string, ServiceOffering[]>>((acc, s) => {
                        (acc[s.category] = acc[s.category] || []).push(s);
                        return acc;
                      }, {});
                      const categoryLabels: Record<string, string> = { lawn: "Lawn Care", garden: "Garden & Landscaping", removal: "Removal", other: "Other Services" };
                      const showGroups = enabledServices.length > 5;
                      const items: React.ReactNode[] = [];
                      Object.entries(grouped).forEach(([cat, svcs]) => {
                        if (showGroups) {
                          items.push(
                            <div key={`label-${cat}`} className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                              {categoryLabels[cat] || cat}
                            </div>
                          );
                        }
                        svcs.forEach(s => {
                          items.push(<SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>);
                        });
                      });
                      items.push(<SelectItem key="__custom__" value="__custom__"><span className="flex items-center gap-1.5"><PencilLine className="w-3.5 h-3.5" /> Other / Custom...</span></SelectItem>);
                      return items;
                    })()}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Enter custom job title"
                      className="flex-1"
                    />
                    {enabledServices.length > 0 && (
                      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => { setUseCustomTitle(false); setForm(f => ({ ...f, title: enabledServices[0].name })); setPriceHelperText(null); }}>
                        Pick service
                      </Button>
                    )}
                  </div>
                  {enabledServices.length === 0 && (
                    <p className="text-xs text-muted-foreground">No services enabled — go to Services to add some, or type a custom title.</p>
                  )}
                </div>
              )}
            </div>
            {/* Recurring series indicator */}
            {editingJob && seriesInfo && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                <RefreshCw className="w-4 h-4 text-primary shrink-0" />
                <span>Recurring job · {seriesInfo.frequency.charAt(0).toUpperCase() + seriesInfo.frequency.slice(1)} · {seriesInfo.count} jobs in series</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={form.scheduled_time} onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} />
                {!form.scheduled_time && (
                  <p className="text-xs text-muted-foreground">No time set — Route Optimisation will assign a start time based on your working hours.</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input type="number" step="0.01" value={form.total_price} onChange={(e) => setForm({ ...form, total_price: e.target.value })} placeholder="0.00" />
                {priceHelperText && <p className="text-xs text-amber-600">{priceHelperText}</p>}
              </div>
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} placeholder="60" />
              </div>
            </div>

            {/* Frequency dropdown for recurring series */}
            {editingJob && seriesInfo && (
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={form.recurrence_frequency} onValueChange={(v: "weekly" | "fortnightly" | "monthly") => setForm({ ...form, recurrence_frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Recurrence for new jobs */}
            {!editingJob && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.is_recurring}
                    onCheckedChange={(checked) => setForm({ ...form, is_recurring: !!checked })}
                    id="recurring"
                  />
                  <Label htmlFor="recurring" className="text-sm cursor-pointer">Recurring job</Label>
                </div>
                {form.is_recurring && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Frequency</Label>
                      <Select value={form.recurrence_frequency} onValueChange={(v: "weekly" | "fortnightly" | "monthly") => setForm({ ...form, recurrence_frequency: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="fortnightly">Fortnightly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Occurrences</Label>
                      <Input type="number" min="2" max="52" value={form.recurrence_count} onChange={(e) => setForm({ ...form, recurrence_count: e.target.value })} className="h-8 text-sm" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {editingJob && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Job notes..." rows={2} />
            </div>
          </div>
          <DialogFooter className={editingJob ? "flex justify-between sm:justify-between" : ""}>
            {editingJob && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeletingJobId(editingJob.id);
                  if (seriesInfo) {
                    setDeleteSeriesOpen(true);
                  } else {
                    setDeleteConfirmOpen(true);
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            )}
            {saveScope === "pending" ? (
              <div className="flex gap-2 items-center">
                <Button variant="ghost" size="sm" onClick={() => setSaveScope(null)}>Cancel</Button>
                <Button variant="outline" size="sm" onClick={handleSaveThisOnly} disabled={isSaving}>
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  Save this job only
                </Button>
                <Button size="sm" onClick={handleSaveAllFuture} disabled={isSaving}>
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  Save all future jobs
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setDialogOpen(false); setSaveScope(null); setSeriesInfo(null); }}>Cancel</Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingJob ? "Save Changes" : form.is_recurring ? `Create ${form.recurrence_count} Jobs` : "Create Job"}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Platform Booking Detail Dialog */}
      <PlatformBookingDetailDialog
        open={platformDetailOpen}
        onOpenChange={setPlatformDetailOpen}
        bookingId={selectedPlatformBookingId}
        contractorId={contractorId}
        onUpdated={fetchData}
      />

      {/* Job Completion Dialog */}
      <JobCompletionDialog
        open={completionDialogOpen}
        onOpenChange={setCompletionDialogOpen}
        job={completionJob}
        contractorId={contractorId}
        onCompleted={fetchData}
      />

      {/* Suggest Alternative Time Dialog */}
      <SuggestTimeDialog
        open={suggestTimeOpen}
        onOpenChange={setSuggestTimeOpen}
        job={suggestTimeJob}
        contractorId={contractorId}
        onSuggested={fetchData}
      />

      {/* Mark as Paid Dialog */}
      <MarkPaidDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        job={markPaidJob}
        onMarked={fetchData}
      />

      {/* Quote Response Dialog */}
      <QuoteResponseDialog
        open={quoteResponseOpen}
        onOpenChange={setQuoteResponseOpen}
        job={quoteResponseJob}
        contractorId={contractorId}
        onQuoteSent={fetchData}
      />

      {/* Delete Confirmation — Single Job */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to permanently delete this job?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteJob} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation — Recurring Series */}
      <AlertDialog open={deleteSeriesOpen} onOpenChange={setDeleteSeriesOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-destructive" />
              Delete Recurring Job
            </AlertDialogTitle>
            <AlertDialogDescription>
              This job is part of a recurring series. How would you like to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteJob}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Delete this job only
            </AlertDialogAction>
            <AlertDialogAction
              onClick={handleDeleteAllFuture}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Delete all future jobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Frequency Change Confirmation */}
      <AlertDialog open={frequencyChangeConfirmOpen} onOpenChange={setFrequencyChangeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Series Frequency?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the frequency will delete and recreate upcoming scheduled jobs in this series. This cannot be undone. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => executeSave("future")}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JobsTab;
