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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil, Loader2, Calendar, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

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
};

const JobsTab = ({ contractorId }: JobsTabProps) => {
  const [jobs, setJobs] = useState<(Job & { client_name?: string })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const openCreateDialog = () => {
    setEditingJob(null);
    setForm({
      title: "Lawn Mowing",
      client_id: clients.length > 0 ? clients[0].id : "",
      description: "",
      scheduled_date: new Date().toISOString().split("T")[0],
      scheduled_time: "09:00",
      duration_minutes: "60",
      total_price: "",
      notes: "",
      status: "scheduled",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (job: Job) => {
    setEditingJob(job);
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
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.client_id) {
      toast.error("Please select a client");
      return;
    }
    if (!form.scheduled_date) {
      toast.error("Please select a date");
      return;
    }

    setIsSaving(true);
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
    };

    if (editingJob) {
      const { error } = await supabase.from("jobs").update(payload).eq("id", editingJob.id);
      if (error) {
        toast.error("Failed to update job");
      } else {
        toast.success("Job updated");
        setDialogOpen(false);
        fetchData();
      }
    } else {
      const { error } = await supabase.from("jobs").insert(payload);
      if (error) {
        toast.error("Failed to create job");
      } else {
        toast.success("Job created");
        setDialogOpen(false);
        fetchData();
      }
    }
    setIsSaving(false);
  };

  const filtered = jobs.filter((j) => {
    const matchesSearch =
      j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.client_name && j.client_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreateDialog} disabled={clients.length === 0}>
          <Plus className="w-4 h-4 mr-2" /> New Job
        </Button>
      </div>

      {clients.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">Add a client first before creating jobs.</p>
          </CardContent>
        </Card>
      )}

      {clients.length > 0 && filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-display font-semibold text-lg text-foreground mb-1">
              {jobs.length === 0 ? "No jobs yet" : "No matches"}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {jobs.length === 0 ? "Schedule your first job to get started." : "Try different filters."}
            </p>
            {jobs.length === 0 && (
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="w-4 h-4 mr-1" /> New Job
              </Button>
            )}
          </CardContent>
        </Card>
      ) : clients.length > 0 ? (
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
                  <TableCell className="font-medium">{job.title}</TableCell>
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
                      {job.status === "in_progress" ? "In Progress" : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(job)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingJob ? "Edit Job" : "New Job"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
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
            {editingJob && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingJob ? "Save Changes" : "Create Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobsTab;
