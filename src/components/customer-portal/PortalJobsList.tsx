import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, DollarSign, MapPin, ChevronRight, Image, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import PortalAlternativeTimesCard from "./PortalAlternativeTimesCard";
import PortalJobDetail from "./PortalJobDetail";
import type { ContractorBrand } from "./PortalLayout";

interface PortalJob {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  total_price: number | null;
  payment_status: string;
  description: string | null;
  notes: string | null;
  completed_at: string | null;
  source: string;
  client_id: string;
  contractor_id: string;
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

interface PortalJobsListProps {
  userId: string;
  contractor: ContractorBrand;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_confirmation: { label: "Pending Confirmation", variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "default" },
  in_progress: { label: "In Progress", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const paymentStatusConfig: Record<string, { label: string; color: string }> = {
  paid: { label: "Paid", color: "text-green-600" },
  invoiced: { label: "Invoiced", color: "text-amber-600" },
  unpaid: { label: "Unpaid", color: "text-muted-foreground" },
};

export const PortalJobsList = ({ userId, contractor }: PortalJobsListProps) => {
  const [jobs, setJobs] = useState<PortalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Record<string, AlternativeSuggestion[]>>({});
  const [selectedJob, setSelectedJob] = useState<PortalJob | null>(null);

  useEffect(() => {
    loadJobs();
  }, [userId, contractor.id]);

  const loadJobs = async () => {
    // Get client records for this user + contractor
    const { data: clientRecords } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .eq("contractor_id", contractor.id);

    if (!clientRecords || clientRecords.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const clientIds = clientRecords.map((c) => c.id);

    const { data: jobsData } = await supabase
      .from("jobs")
      .select("*")
      .eq("contractor_id", contractor.id)
      .in("client_id", clientIds)
      .order("scheduled_date", { ascending: false });

    if (jobsData) {
      setJobs(jobsData as PortalJob[]);

      // Load alternative suggestions for pending jobs
      const pendingJobIds = jobsData.filter((j) => j.status === "pending_confirmation").map((j) => j.id);
      if (pendingJobIds.length > 0) {
        const { data: suggestionsData } = await supabase
          .from("alternative_suggestions")
          .select("*")
          .in("job_id", pendingJobIds)
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

  if (selectedJob) {
    return (
      <PortalJobDetail
        job={selectedJob}
        contractor={contractor}
        userId={userId}
        onBack={() => { setSelectedJob(null); loadJobs(); }}
      />
    );
  }

  const upcomingJobs = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");
  const pastJobs = jobs.filter((j) => j.status === "completed" || j.status === "cancelled");

  if (jobs.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-8 md:p-12 shadow-sm text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
          <Calendar className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-display text-lg font-semibold text-foreground mb-2">No jobs yet</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Once you book a service with {contractor.business_name}, your jobs will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upcoming / Active */}
      {upcomingJobs.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Upcoming & Active</h2>
          <div className="space-y-3">
            {upcomingJobs.map((job) => {
              const jobSuggestions = suggestions[job.id] || [];
              const { label, variant } = statusConfig[job.status] || statusConfig.scheduled;

              return (
                <div key={job.id} className="bg-card rounded-xl p-5 shadow-sm border border-border hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setSelectedJob(job)}>
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
                      <Badge variant={variant}>{label}</Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                  {jobSuggestions.length > 0 && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <PortalAlternativeTimesCard
                        suggestions={jobSuggestions}
                        jobId={job.id}
                        contractorName={contractor.business_name}
                        onResponse={loadJobs}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past / Completed */}
      {pastJobs.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Past Jobs</h2>
          <div className="space-y-3">
            {pastJobs.map((job) => {
              const { label, variant } = statusConfig[job.status] || statusConfig.completed;
              const paymentInfo = paymentStatusConfig[job.payment_status] || paymentStatusConfig.unpaid;

              return (
                <div key={job.id} className="bg-card rounded-xl p-5 shadow-sm border border-border hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setSelectedJob(job)}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        {job.status === "completed" ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-destructive" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{job.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(job.scheduled_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.total_price != null && (
                        <span className={`text-sm font-medium ${paymentInfo.color}`}>
                          ${job.total_price.toFixed(2)} • {paymentInfo.label}
                        </span>
                      )}
                      <Badge variant={variant}>{label}</Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalJobsList;
