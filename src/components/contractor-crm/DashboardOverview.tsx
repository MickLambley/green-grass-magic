import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar, FileText, DollarSign, Loader2, Clock, AlertCircle, MapPin } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type Job = Tables<"jobs">;

interface ClientAddress {
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

interface DashboardOverviewProps {
  contractorId: string;
  onNavigateToJob?: (jobId: string) => void;
}

const statusColors: Record<string, string> = {
  scheduled: "bg-sky/20 text-sky border-sky/30",
  in_progress: "bg-sunshine/20 text-sunshine border-sunshine/30",
  pending_confirmation: "bg-muted text-muted-foreground",
};

const DashboardOverview = ({ contractorId, onNavigateToJob }: DashboardOverviewProps) => {
  const [stats, setStats] = useState({
    clientCount: 0,
    scheduledJobs: 0,
    unpaidInvoices: 0,
    revenue: 0,
  });
  const [todaysJobs, setTodaysJobs] = useState<(Job & { client_name?: string; client_address?: ClientAddress | null })[]>([]);
  const [upcomingJobs, setUpcomingJobs] = useState<(Job & { client_name?: string; client_address?: ClientAddress | null })[]>([]);
  const [websiteBookings, setWebsiteBookings] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, [contractorId]);

  // Realtime: remove completed/cancelled jobs from today's list
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-jobs')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs' },
        (payload) => {
          const updated = payload.new as Job;
          if (updated.status === 'completed' || updated.status === 'cancelled') {
            setTodaysJobs((prev) => prev.filter((j) => j.id !== updated.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchAll = async () => {
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const [clientsRes, scheduledRes, unpaidRes, paidRes, todayRes, upcomingRes, websiteRes] = await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).eq("status", "scheduled"),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).eq("status", "unpaid"),
      supabase.from("invoices").select("total").eq("contractor_id", contractorId).eq("status", "paid"),
      // Today's jobs
      supabase.from("jobs").select("*").eq("contractor_id", contractorId).eq("scheduled_date", today).in("status", ["scheduled", "in_progress"]).order("scheduled_time"),
      // Upcoming (next 7 days, excluding today)
      supabase.from("jobs").select("*").eq("contractor_id", contractorId).gt("scheduled_date", today).lte("scheduled_date", weekEnd).eq("status", "scheduled").order("scheduled_date").limit(5),
      // Website bookings pending
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).eq("source", "website_booking").eq("status", "pending_confirmation"),
    ]);

    const revenue = (paidRes.data || []).reduce((sum, inv) => sum + Number(inv.total), 0);

    // Fetch client names and addresses for today's and upcoming jobs
    const { data: clients } = await supabase.from("clients").select("id, name, address").eq("contractor_id", contractorId);
    const clientMap = new Map((clients || []).map((c) => [c.id, c]));

    setStats({
      clientCount: clientsRes.count || 0,
      scheduledJobs: scheduledRes.count || 0,
      unpaidInvoices: unpaidRes.count || 0,
      revenue,
    });
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
    { title: "Clients", value: stats.clientCount, icon: Users, color: "text-primary" },
    { title: "Upcoming Jobs", value: stats.scheduledJobs, icon: Calendar, color: "text-sky" },
    { title: "Unpaid Invoices", value: stats.unpaidInvoices, icon: FileText, color: "text-sunshine" },
    { title: "Revenue", value: `$${stats.revenue.toFixed(0)}`, icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`w-12 h-12 rounded-xl bg-muted flex items-center justify-center ${card.color}`}>
                <card.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-display font-bold text-foreground">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Today's Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaysJobs.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No jobs scheduled for today. 🎉</p>
            ) : (
              <div className="space-y-3">
                {todaysJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm text-foreground">{job.title}</p>
                      <p className="text-xs text-muted-foreground">{job.client_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.scheduled_time && (
                        <span className="text-xs text-muted-foreground">{job.scheduled_time}</span>
                      )}
                      <Badge variant="outline" className={`text-[10px] ${statusColors[job.status] || ""}`}>
                        {job.status === "in_progress" ? "In Progress" : "Scheduled"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming */}
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
              <div className="space-y-3">
                {upcomingJobs.map((job) => {
                  const jobDate = parseISO(job.scheduled_date);
                  const dateLabel = isTomorrow(jobDate) ? "Tomorrow" : format(jobDate, "EEE, dd MMM");
                  return (
                    <div key={job.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm text-foreground">{job.title}</p>
                        <p className="text-xs text-muted-foreground">{job.client_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-foreground">{dateLabel}</p>
                        {job.scheduled_time && <p className="text-xs text-muted-foreground">{job.scheduled_time}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardOverview;
