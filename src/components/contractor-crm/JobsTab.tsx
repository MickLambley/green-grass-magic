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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Pencil, Loader2, Calendar, ChevronLeft, ChevronRight, List, LayoutGrid, Check, X, MapPin } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek, isToday } from "date-fns";
import type { Tables, Json } from "@/integrations/supabase/types";

type Job = Tables<"jobs">;
type Client = Tables<"clients">;

interface JobsTabProps {
  contractorId: string;
}

const statusColors: Record<string, string> = {
  scheduled: "bg-sky/20 text-sky border-sky/30",
  in_progress: "bg-sunshine/20 text-sunshine border-sunshine/30",
  completed: "bg-primary/20 text-primary border-primary/30",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
  pending_confirmation: "bg-sunshine/20 text-sunshine border-sunshine/30",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface RecurrenceRule {
  frequency: "weekly" | "fortnightly" | "monthly";
  interval: number;
  count?: number;
}

const JobsTab = ({ contractorId }: JobsTabProps) => {
  const [jobs, setJobs] = useState<(Job & { client_name?: string })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [currentMonth, setCurrentMonth] = useState(new Date());

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
    const [jobsRes, clientsRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("contractor_id", contractorId).order("scheduled_date", { ascending: false }),
      supabase.from("clients").select("*").eq("contractor_id", contractorId).order("name"),
    ]);

    if (clientsRes.data) setClients(clientsRes.data);
    if (jobsRes.data && clientsRes.data) {
      const clientMap = new Map(clientsRes.data.map((c) => [c.id, c.name]));
      setJobs(jobsRes.data.map((j) => ({ ...j, client_name: clientMap.get(j.client_id) || "Unknown" })));
    }
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

    const payload = {
      contractor_id: contractorId,
      client_id: form.client_id,
      title: form.title.trim() || "Lawn Mowing",
      description: form.description.trim() || null,
      scheduled_date: form.scheduled_date,
      scheduled_time: form.scheduled_time || null,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      total_price: form.total_price ? parseFloat(form.total_price) : null,
      notes: form.notes.trim() || null,
      status: form.status,
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

  const handleConfirmJob = async (jobId: string) => {
    const { error } = await supabase.from("jobs").update({ status: "scheduled" }).eq("id", jobId);
    if (error) toast.error("Failed to confirm job");
    else { toast.success("Job confirmed"); fetchData(); }
  };

  const handleDeclineJob = async (jobId: string) => {
    const { error } = await supabase.from("jobs").update({ status: "cancelled" }).eq("id", jobId);
    if (error) toast.error("Failed to decline job");
    else { toast.success("Job declined"); fetchData(); }
  };

  const filtered = jobs.filter((j) => {
    const matchesSearch =
      j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.client_name && j.client_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
            <Button variant={viewMode === "calendar" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("calendar")}>
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("list")}>
              <List className="w-4 h-4" />
            </Button>
          </div>
          <Button onClick={() => openCreateDialog()} disabled={clients.length === 0}>
            <Plus className="w-4 h-4 mr-2" /> New Job
          </Button>
        </div>
      </div>

      {clients.length === 0 && (
        <Card><CardContent className="py-8 text-center"><p className="text-muted-foreground text-sm">Add a client first before creating jobs.</p></CardContent></Card>
      )}

      {/* Calendar View */}
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
                          onClick={(e) => { e.stopPropagation(); openEditDialog(job); }}
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
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">
                      {job.title}
                      {job.recurrence_rule && <Badge variant="outline" className="ml-2 text-[10px]">Recurring</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{job.client_name}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {format(new Date(job.scheduled_date), "dd MMM yyyy")}
                      {job.scheduled_time && ` ${job.scheduled_time}`}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {job.total_price ? `$${Number(job.total_price).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[job.status] || ""}>
                        {job.status === "in_progress" ? "In Progress" : job.status === "pending_confirmation" ? "Pending" : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {job.status === "pending_confirmation" && (
                          <>
                            <Button variant="ghost" size="icon" className="text-primary hover:text-primary" onClick={() => handleConfirmJob(job.id)} title="Accept">
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeclineJob(job.id)} title="Decline">
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(job)}><Pencil className="w-4 h-4" /></Button>
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
    </div>
  );
};

export default JobsTab;
