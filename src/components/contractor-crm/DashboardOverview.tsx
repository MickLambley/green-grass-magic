import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, Calendar, FileText, DollarSign, Loader2, Clock,
  AlertCircle, MapPin, CheckCircle2, ChevronRight, Plus, MessageSquareText,
} from "lucide-react";
import { format, isToday, isTomorrow, parseISO, isBefore, startOfDay, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import JobCompletionDialog from "./JobCompletionDialog";

type Job = Tables<"jobs">;

interface ClientAddress {
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

interface DashboardOverviewProps {
  contractorId: string;
  onNavigateToTab?: (tab: string, filter?: string) => void;
  onNavigateToJob?: (jobId: string) => void;
}

const statusColors: Record<string, string> = {
  scheduled: "bg-sky/20 text-sky border-sky/30",
  in_progress: "bg-sunshine/20 text-sunshine border-sunshine/30",
  pending_confirmation: "bg-muted text-muted-foreground",
};

const formatTime12 = (time: string | null) => {
  if (!time) return "";
  try {
    const [h, m] = time.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  } catch {
    return time;
  }
};

const DashboardOverview = ({ contractorId, onNavigateToTab, onNavigateToJob }: DashboardOverviewProps) => {
  const [stats, setStats] = useState({
    clientCount: 0,
    scheduledJobs: 0,
    unpaidInvoices: 0,
    overdueInvoices: 0,
    revenue: 0,
    openQuotes: 0,
  });
  const [weekSummary, setWeekSummary] = useState({ completedCount: 0, earned: 0 });
  const [todaysJobs, setTodaysJobs] = useState<(Job & { client_name?: string; client_address?: ClientAddress | null })[]>([]);
  const [upcomingJobs, setUpcomingJobs] = useState<(Job & { client_name?: string; client_address?: ClientAddress | null })[]>([]);
  const [websiteBookings, setWebsiteBookings] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionJob, setCompletionJob] = useState<{
    id: string; title: string; source: string; total_price: number | null; client_name: string; payment_status: string;
  } | null>(null);

  const handleQuickComplete = (job: Job & { client_name?: string }) => {
    setCompletionJob({
      id: job.id,
      title: job.title,
      source: job.source === "website_booking" ? "website_booking" : "manual",
      total_price: job.total_price,
      client_name: job.client_name || "Unknown",
      payment_status: job.payment_status,
    });
    setCompletionDialogOpen(true);
  };

  useEffect(() => { fetchAll(); }, [contractorId]);

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-jobs')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, (payload) => {
        const updated = payload.new as Job;
        if (updated.status === 'completed' || updated.status === 'cancelled') {
          setTodaysJobs((prev) => prev.filter((j) => j.id !== updated.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchAll = async () => {
    const today = new Date().toISOString().split("T")[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEndDate = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

    const [
      clientsRes, scheduledRes, unpaidRes, paidRes, todayRes, upcomingRes,
      websiteRes, overdueRes, quotesRes, weekCompletedRes,
    ] = await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).eq("status", "scheduled"),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).neq("status", "paid"),
      supabase.from("invoices").select("total").eq("contractor_id", contractorId).eq("status", "paid"),
      supabase.from("jobs").select("*").eq("contractor_id", contractorId).eq("scheduled_date", today).in("status", ["scheduled", "in_progress"]).order("scheduled_time"),
      supabase.from("jobs").select("*").eq("contractor_id", contractorId).gt("scheduled_date", today).lte("scheduled_date", weekEnd).eq("status", "scheduled").order("scheduled_date").order("scheduled_time").limit(5),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).eq("source", "website_booking").eq("status", "pending_confirmation"),
      supabase.from("invoices").select("id, due_date").eq("contractor_id", contractorId).neq("status", "paid").not("due_date", "is", null),
      supabase.from("quotes").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).in("status", ["draft", "sent", "pending"]),
      // This week's completed jobs
      supabase.from("jobs").select("id, total_price").eq("contractor_id", contractorId).eq("status", "completed").gte("scheduled_date", weekStart).lte("scheduled_date", weekEndDate),
    ]);

    const revenue = (paidRes.data || []).reduce((sum, inv) => sum + Number(inv.total), 0);
    const todayDate = startOfDay(new Date());
    const overdueCount = (overdueRes.data || []).filter((inv) => inv.due_date && isBefore(new Date(inv.due_date), todayDate)).length;

    // Week summary
    const weekCompleted = weekCompletedRes.data || [];
    const weekEarned = weekCompleted.reduce((sum, j) => sum + Number(j.total_price || 0), 0);

    const { data: clients } = await supabase.from("clients").select("id, name, address").eq("contractor_id", contractorId);
    const clientMap = new Map((clients || []).map((c) => [c.id, c]));

    setStats({
      clientCount: clientsRes.count || 0,
      scheduledJobs: scheduledRes.count || 0,
      unpaidInvoices: unpaidRes.count || 0,
      overdueInvoices: overdueCount,
      revenue,
      openQuotes: quotesRes.count || 0,
    });
    setWeekSummary({ completedCount: weekCompleted.length, earned: weekEarned });
    setTodaysJobs((todayRes.data || []).map((j) => {
      const client = clientMap.get(j.client_id);
      return { ...j, client_name: client?.name || "Unknown", client_address: client?.address as ClientAddress | null };
    }));
    setUpcomingJobs((upcomingRes.data || []).map((j) => {
      const client = clientMap.get(j.client_id);
      return { ...j, client_name: client?.name || "Unknown", client_address: client?.address as ClientAddress | null };
    }));
    setWebsiteBookings(websiteRes.count || 0);
    setIsLoading(false);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const summaryCards = [
    {
      title: "Clients", value: stats.clientCount, icon: Users, color: "text-primary",
      subtitle: undefined as string | undefined, subtitleColor: "", tab: "clients", filter: undefined as string | undefined,
    },
    {
      title: "Upcoming Jobs", value: stats.scheduledJobs, icon: Calendar, color: "text-sky",
      subtitle: undefined, subtitleColor: "", tab: "jobs", filter: "upcoming",
    },
    {
      title: "Open Quotes", value: stats.openQuotes, icon: MessageSquareText,
      color: stats.openQuotes > 0 ? "text-amber-500" : "text-muted-foreground",
      subtitle: undefined, subtitleColor: "", tab: "quotes", filter: "open",
    },
    {
      title: "Unpaid Invoices", value: stats.unpaidInvoices, icon: FileText,
      color: stats.overdueInvoices > 0 ? "text-destructive" : "text-sunshine",
      subtitle: stats.overdueInvoices > 0 ? `${stats.overdueInvoices} overdue` : undefined,
      subtitleColor: "text-destructive", tab: "invoices", filter: "unpaid",
    },
    {
      title: "Revenue", value: `$${stats.revenue.toLocaleString()}`, icon: DollarSign, color: "text-primary",
      subtitle: undefined, subtitleColor: "", tab: "invoices", filter: "paid",
    },
  ];

  // Find the next upcoming job (soonest after now)
  const nextUpcomingId = upcomingJobs.length > 0 ? upcomingJobs[0].id : null;

  return (
    <div className="space-y-6">
      {/* Summary Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryCards.map((card) => (
          <Card
            key={card.title}
            className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md group"
            onClick={() => onNavigateToTab?.(card.tab, card.filter)}
          >
            <CardContent className="flex items-center gap-3 p-4 relative">
              <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">{card.title}</p>
                <p className="text-xl font-display font-bold text-foreground">{card.value}</p>
                {card.subtitle && (
                  <p className={`text-[11px] font-medium ${card.subtitleColor}`}>{card.subtitle}</p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors absolute right-3 bottom-3" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* This Week's Revenue Summary */}
      {weekSummary.completedCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm text-foreground">
            <span className="font-medium">This week:</span>{" "}
            {weekSummary.completedCount} job{weekSummary.completedCount !== 1 ? "s" : ""} completed · ${weekSummary.earned.toLocaleString()} earned
          </p>
        </div>
      )}

      {/* Website bookings alert */}
      {websiteBookings > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-sm text-foreground">
              You have <strong>{websiteBookings}</strong> new website booking{websiteBookings > 1 ? "s" : ""} awaiting confirmation.
              Check the Jobs tab to accept or decline.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Jobs */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Today's Jobs
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => onNavigateToTab?.("jobs", "new-today")}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> New Job
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {todaysJobs.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground text-sm mb-3">No jobs today — enjoy the break!</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateToTab?.("jobs", "new-today")}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add one
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {todaysJobs.map((job) => {
                  const addressParts = [job.client_address?.street, job.client_address?.city].filter(Boolean);
                  return (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => onNavigateToJob?.(job.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {job.scheduled_time && (
                            <span className="text-xs font-semibold text-primary whitespace-nowrap">{formatTime12(job.scheduled_time)}</span>
                          )}
                          <p className="font-medium text-sm text-foreground truncate">{job.client_name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{job.title}</p>
                        {addressParts.length > 0 && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{addressParts.join(", ")}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <Badge variant="outline" className={`text-[10px] ${statusColors[job.status] || ""}`}>
                          {job.status === "in_progress" ? "In Progress" : "Scheduled"}
                        </Badge>
                        {(job.status === "scheduled" || job.status === "in_progress") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-primary hover:text-primary"
                            onClick={(e) => { e.stopPropagation(); handleQuickComplete(job); }}
                            title="Complete Job"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coming Up */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-sky" />
              Coming Up
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingJobs.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No upcoming jobs this week.</p>
            ) : (
              <div className="space-y-2">
                {upcomingJobs.map((job, idx) => {
                  const jobDate = parseISO(job.scheduled_date);
                  const dateLabel = isTomorrow(jobDate) ? "Tomorrow" : format(jobDate, "EEE d MMM");
                  const isNext = job.id === nextUpcomingId;
                  return (
                    <div
                      key={job.id}
                      className={`flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer ${
                        isNext ? "bg-primary/5 border-l-2 border-l-primary" : "bg-muted/50"
                      }`}
                      onClick={() => onNavigateToJob?.(job.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-sky whitespace-nowrap">{dateLabel}</span>
                          {isNext && (
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Next</Badge>
                          )}
                        </div>
                        <p className="font-medium text-sm text-foreground truncate">{job.client_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{job.title}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        {job.scheduled_time && (
                          <p className="text-xs font-medium text-foreground">{formatTime12(job.scheduled_time)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {upcomingJobs.length > 0 && (
              <button
                onClick={() => onNavigateToTab?.("jobs")}
                className="mt-3 text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 mx-auto"
              >
                View all jobs <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      <JobCompletionDialog
        open={completionDialogOpen}
        onOpenChange={setCompletionDialogOpen}
        job={completionJob}
        contractorId={contractorId}
        onCompleted={fetchAll}
      />
    </div>
  );
};

export default DashboardOverview;
