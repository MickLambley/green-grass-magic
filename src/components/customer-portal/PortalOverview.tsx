import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, CheckCircle2, Clock, AlertCircle, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import PortalAlternativeTimesCard from "./PortalAlternativeTimesCard";
import type { ContractorBrand } from "./PortalLayout";

interface PortalJob {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  total_price: number | null;
  payment_status: string;
}

interface AlternativeSuggestion {
  id: string;
  job_id: string | null;
  contractor_id: string;
  suggested_date: string;
  suggested_time_slot: string;
  status: string;
  created_at: string;
}

interface PortalOverviewProps {
  userId: string;
  contractor: ContractorBrand;
  onNavigate: (tab: string) => void;
}

export const PortalOverview = ({ userId, contractor, onNavigate }: PortalOverviewProps) => {
  const [stats, setStats] = useState({ upcoming: 0, completed: 0, pendingAction: 0 });
  const [upcomingJobs, setUpcomingJobs] = useState<PortalJob[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, AlternativeSuggestion[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, [userId, contractor.id]);

  const loadOverview = async () => {
    const { data: clientRecords } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .eq("contractor_id", contractor.id);

    if (!clientRecords || clientRecords.length === 0) {
      setLoading(false);
      return;
    }

    const clientIds = clientRecords.map((c) => c.id);

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, status, scheduled_date, scheduled_time, total_price, payment_status")
      .eq("contractor_id", contractor.id)
      .in("client_id", clientIds)
      .order("scheduled_date", { ascending: true });

    if (jobs) {
      const upcoming = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");
      const completed = jobs.filter((j) => j.status === "completed");
      const pendingAction = jobs.filter((j) => j.status === "pending_confirmation");

      setStats({ upcoming: upcoming.length, completed: completed.length, pendingAction: pendingAction.length });
      setUpcomingJobs(upcoming.slice(0, 3));

      // Load suggestions for pending jobs
      const pendingIds = pendingAction.map((j) => j.id);
      if (pendingIds.length > 0) {
        const { data: suggestionsData } = await supabase
          .from("alternative_suggestions")
          .select("*")
          .in("job_id", pendingIds)
          .eq("status", "pending");

        if (suggestionsData) {
          const map: Record<string, AlternativeSuggestion[]> = {};
          suggestionsData.forEach((s) => {
            const key = s.job_id!;
            if (!map[key]) map[key] = [];
            map[key].push(s);
          });
          setSuggestions(map);
        }
      }
    }

    setLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${contractor.primary_color}15` }}>
              <Calendar className="w-6 h-6" style={{ color: contractor.primary_color }} />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-foreground">{stats.upcoming}</p>
              <p className="text-sm text-muted-foreground">Upcoming Jobs</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-950/20 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-foreground">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </div>
        </div>
        {stats.pendingAction > 0 && (
          <button onClick={() => onNavigate("jobs")} className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl p-5 shadow-sm border border-amber-200 dark:border-amber-800 text-left hover:ring-2 hover:ring-amber-300 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">{stats.pendingAction}</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">Needs Your Action</p>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Upcoming Jobs */}
      {upcomingJobs.length > 0 && (
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-foreground">Upcoming Jobs</h2>
            <button onClick={() => onNavigate("jobs")} className="text-sm font-medium flex items-center gap-1 hover:underline" style={{ color: contractor.primary_color }}>
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {upcomingJobs.map((job) => {
              const jobSuggestions = suggestions[job.id] || [];
              return (
                <div key={job.id} className="p-4 rounded-xl border border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${contractor.primary_color}15` }}>
                        <Calendar className="w-5 h-5" style={{ color: contractor.primary_color }} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{job.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(job.scheduled_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                          {job.scheduled_time && ` • ${job.scheduled_time}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.total_price != null && (
                        <span className="text-sm font-medium" style={{ color: contractor.primary_color }}>${job.total_price.toFixed(2)}</span>
                      )}
                      <Badge variant={job.status === "pending_confirmation" ? "secondary" : "default"}>
                        {job.status === "pending_confirmation" ? "Pending" : job.status === "scheduled" ? "Scheduled" : job.status}
                      </Badge>
                    </div>
                  </div>
                  {jobSuggestions.length > 0 && (
                    <PortalAlternativeTimesCard
                      suggestions={jobSuggestions}
                      jobId={job.id}
                      contractorName={contractor.business_name}
                      onResponse={loadOverview}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {upcomingJobs.length === 0 && stats.completed === 0 && (
        <div className="bg-card rounded-2xl p-8 shadow-sm border border-border text-center">
          <Calendar className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold text-foreground mb-2">Welcome!</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            You don't have any jobs yet. Book a service through {contractor.business_name}'s website to get started.
          </p>
        </div>
      )}
    </div>
  );
};

export default PortalOverview;
