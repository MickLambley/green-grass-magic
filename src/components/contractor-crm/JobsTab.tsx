import { useState, useEffect, useMemo, useCallback } from "react";
import { autoShiftTime } from "@/lib/scheduleConflict";
import { supabase } from "@/integrations/supabase/client";
import type { WorkingHours } from "./WorkingHoursEditor";
import PlatformBookingDetailDialog from "./PlatformBookingDetailDialog";
import JobCompletionDialog from "./JobCompletionDialog";
import SuggestTimeDialog from "./SuggestTimeDialog";
import MarkPaidDialog from "./MarkPaidDialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Pencil, Loader2, Calendar, ChevronLeft, ChevronRight, List, LayoutGrid, Check, X, MapPin, CheckCircle2, DollarSign, Clock, Trash2 } from "lucide-react";
import DayTimeline from "./DayTimeline";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek, isToday } from "date-fns";
import type { Tables, Json } from "@/integrations/supabase/types";

type Job = Tables<"jobs">;
type Client = Tables<"clients">;

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
  source: "crm" | "platform";
  // CRM-only fields
  client_id?: string;
  duration_minutes?: number | null;
  // Platform-only fields
  address_street?: string;
  address_city?: string;
  address_state?: string;
  customer_email?: string | null;
}

const JobsTab = ({ contractorId, subscriptionTier, workingHours: contractorWorkingHours, onOpenRouteOptimization }: JobsTabProps) => {
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
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
  } | null>(null);
  const [suggestTimeOpen, setSuggestTimeOpen] = useState(false);
  const [suggestTimeJob, setSuggestTimeJob] = useState<{
    id: string; title: string; client_name: string; scheduled_date: string; source: "crm" | "platform";
  } | null>(null);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markPaidJob, setMarkPaidJob] = useState<{
    id: string; title: string; client_name: string; total_price: number | null;
  } | null>(null);

  const handleRunOptimization = async () => {
    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("route-optimization", {
        body: { contractor_id: contractorId },
      });
      if (error) throw error;
      if (data?.result) {
        const r = data.result;
        toast.success(`Route optimized! Level ${r.level} saved ${r.timeSaved} minutes. Status: ${r.status === "pending_approval" ? "Awaiting your approval" : "Applied"}`);
        if (r.status === "pending_approval" && onOpenRouteOptimization) {
          onOpenRouteOptimization();
        }
        fetchData();
      } else {
        toast.info("No optimization opportunities found for today's jobs. Ensure jobs have client addresses and are not locked.");
      }
    } catch (err) {
      console.error("Optimization error:", err);
      toast.error("Failed to run route optimization");
    }
    setIsOptimizing(false);
  };

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
  }, [contractorId]);

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
          source: "crm",
          client_id: j.client_id,
          duration_minutes: j.duration_minutes,
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
    setForm({
      title: "Lawn Mowing",
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
  };

  const openEditDialog = (job: Job) => {
    setEditingJob(job);
    const recurrence = job.recurrence_rule as unknown as RecurrenceRule | null;
    setForm({
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
    });
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

    setIsSaving(true);

    const recurrenceRule: RecurrenceRule | null = form.is_recurring
      ? {
          frequency: form.recurrence_frequency,
          interval: form.recurrence_frequency === "fortnightly" ? 2 : 1,
          count: parseInt(form.recurrence_count) || 4,
        }
      : null;

    // Auto-shift if there's a scheduling conflict
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

    const payload = {
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
      const { error } = await supabase.from("jobs").update(payload).eq("id", editingJob.id);
      if (error) toast.error("Failed to update job");
      else { toast.success("Job updated"); setDialogOpen(false); fetchData(); }
    } else {
      // Create the initial job
      const { error } = await supabase.from("jobs").insert(payload);
      if (error) { toast.error("Failed to create job"); setIsSaving(false); return; }

      // If recurring, create additional jobs
      if (form.is_recurring) {
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
          additionalJobs.push({
            ...payload,
            scheduled_date: nextDate.toISOString().split("T")[0],
          });
        }

        if (additionalJobs.length > 0) {
          const { error: batchError } = await supabase.from("jobs").insert(additionalJobs);
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
    if (source === "platform") {
      // Accept a platform booking - set contractor_id and confirm
      const { error } = await supabase.from("bookings").update({ 
        contractor_id: contractorId, 
        status: "confirmed" as any,
        contractor_accepted_at: new Date().toISOString(),
      }).eq("id", jobId);
      if (error) toast.error("Failed to accept booking");
      else { toast.success("Booking accepted"); fetchData(); }
    } else {
      const { error } = await supabase.from("jobs").update({ status: "scheduled" }).eq("id", jobId);
      if (error) toast.error("Failed to confirm job");
      else { toast.success("Job confirmed"); fetchData(); }
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

  const handleStartCompletion = (job: UnifiedJob) => {
    setCompletionJob({
      id: job.id,
      title: job.title,
      source: job.source === "platform" ? "website_booking" : "manual",
      total_price: job.total_price,
      client_name: job.client_name,
      payment_status: "unpaid",
    });
    setCompletionDialogOpen(true);
  };

  const filtered = jobs.filter((j) => {
    const matchesSearch =
      j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.client_name && j.client_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
              <Card key={job.id} className="border-sunshine/30 bg-sunshine/5">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground text-sm">{job.title}</p>
                      <p className="text-xs text-muted-foreground">{job.client_name}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-sunshine/20 text-sunshine border-sunshine/30">
                      {job.source === "platform" ? "🌐 Website" : "Manual"}
                    </Badge>
                  </div>
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
                    <Button size="sm" className="flex-1" onClick={() => handleConfirmJob(job.id, job.source)}>
                      <Check className="w-3.5 h-3.5 mr-1" /> Confirm
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleSuggestTime(job)}>
                      <Calendar className="w-3.5 h-3.5 mr-1" /> Reschedule
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeclineJob(job.id, job.source)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
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
            // Auto-shift if conflict
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
                {filtered.map((job) => (
                  <TableRow key={job.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { if (job.source === "platform") { setSelectedPlatformBookingId(job.id); setPlatformDetailOpen(true); } else { openEditDialog(job as any); } }}>
                    <TableCell className="font-medium">
                      {job.title}
                      {job.recurrence_rule && <Badge variant="outline" className="ml-2 text-[10px]">Recurring</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{job.client_name}</div>
                      {job.client_address && (job.client_address.street || job.client_address.city) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {[job.client_address.street, job.client_address.city, job.client_address.state].filter(Boolean).join(", ")}
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
                      <Badge variant="outline" className={statusColors[job.status] || ""}>
                        {job.source === "platform" && <span className="mr-1">🌐</span>}
                        {job.status === "in_progress" ? "In Progress" 
                          : job.status === "pending_confirmation" ? "Pending" 
                          : job.status === "pending" ? "Awaiting Accept"
                          : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {(job.status === "pending_confirmation" || job.status === "pending") && (
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
          </Card>
        )
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJob ? "Edit Job" : "New Job"}</DialogTitle>
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
              <Label>Job Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lawn Mowing" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={form.scheduled_time} onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input type="number" step="0.01" value={form.total_price} onChange={(e) => setForm({ ...form, total_price: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} placeholder="60" />
              </div>
            </div>

            {/* Recurrence */}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingJob ? "Save Changes" : form.is_recurring ? `Create ${form.recurrence_count} Jobs` : "Create Job"}
            </Button>
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
    </div>
  );
};

export default JobsTab;
