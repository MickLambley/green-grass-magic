import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Leaf, Calendar, Clock, LogOut, Home, ChevronRight,
  Loader2, Plus, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import PublicBookingForm from "@/components/contractor-website/PublicBookingForm";

interface Job {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  total_price: number | null;
  completed_at: string | null;
  description: string | null;
  client_id: string;
}

interface ContractorInfo {
  id: string;
  business_name: string | null;
  business_logo_url: string | null;
  subdomain: string | null;
}

const ContractorSiteDashboard = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [contractor, setContractor] = useState<ContractorInfo | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showBooking, setShowBooking] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "bookings">("overview");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session?.user) {
        navigate(`/site/${slug}/auth`, { replace: true });
      } else {
        setUser(session.user);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate(`/site/${slug}/auth`, { replace: true });
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [slug, navigate]);

  useEffect(() => {
    if (user && slug) {
      loadData();
    }
  }, [user, slug]);

  const loadData = async () => {
    // Load contractor
    const { data: contractorData } = await supabase
      .from("contractors")
      .select("id, business_name, business_logo_url, subdomain")
      .eq("subdomain", slug)
      .eq("website_published", true)
      .single();

    if (!contractorData) {
      toast.error("Contractor not found");
      setLoading(false);
      return;
    }
    setContractor(contractorData);

    // Find client records matching user's email
    const { data: clients } = await supabase
      .from("clients")
      .select("id")
      .eq("contractor_id", contractorData.id)
      .eq("email", user!.email);

    if (clients && clients.length > 0) {
      const clientIds = clients.map((c) => c.id);
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, title, scheduled_date, scheduled_time, status, total_price, completed_at, description, client_id")
        .eq("contractor_id", contractorData.id)
        .in("client_id", clientIds)
        .order("scheduled_date", { ascending: false });

      if (jobsData) setJobs(jobsData);
    }

    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate(`/site/${slug}`);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      scheduled: { variant: "secondary", label: "Scheduled" },
      in_progress: { variant: "default", label: "In Progress" },
      completed: { variant: "outline", label: "Completed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const { variant, label } = config[status] || { variant: "secondary" as const, label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const name = contractor?.business_name || "Lawn Care Pro";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const upcomingJobs = jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress");
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const userName = user?.user_metadata?.full_name || "there";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            {contractor?.business_logo_url ? (
              <img src={contractor.business_logo_url} alt={name} className="w-7 h-7 rounded-lg object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-lg gradient-hero flex items-center justify-center">
                <Leaf className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
            )}
            <span className="font-display font-bold text-foreground text-sm">{name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowBooking(true)}>
              <Plus className="w-4 h-4 mr-1" /> Book
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Home className="w-4 h-4 inline mr-1.5" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab("bookings")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "bookings"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Calendar className="w-4 h-4 inline mr-1.5" />
            My Bookings
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">Welcome back, {userName}!</h1>
              <p className="text-sm text-muted-foreground">Manage your services with {name}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">{upcomingJobs.length}</p>
                    <p className="text-xs text-muted-foreground">Upcoming</p>
                  </div>
                </div>
              </div>
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">{completedJobs.length}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Button className="w-full h-full min-h-[80px] rounded-2xl" onClick={() => setShowBooking(true)}>
                  <div className="flex flex-col items-center gap-1">
                    <Plus className="w-5 h-5" />
                    <span className="text-xs">Book a Service</span>
                  </div>
                </Button>
              </div>
            </div>

            {/* Upcoming */}
            {upcomingJobs.length > 0 && (
              <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg font-bold text-foreground">Upcoming Services</h2>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab("bookings")}>
                    View all <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <div className="space-y-3">
                  {upcomingJobs.slice(0, 3).map((job) => (
                    <div key={job.id} className="p-4 rounded-xl border border-border flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Calendar className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">{job.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(job.scheduled_date).toLocaleDateString("en-AU", {
                              weekday: "short", day: "numeric", month: "short",
                            })}
                            {job.scheduled_time && ` • ${job.scheduled_time}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.total_price && (
                          <span className="text-sm font-medium text-primary">${job.total_price}</span>
                        )}
                        {getStatusBadge(job.status)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {jobs.length === 0 && (
              <div className="bg-card rounded-2xl p-8 shadow-sm border border-border text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Calendar className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">No bookings yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Book your first service with {name} to get started.
                </p>
                <Button onClick={() => setShowBooking(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Book Your First Service
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === "bookings" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-foreground">All Bookings</h2>
              <Button size="sm" onClick={() => setShowBooking(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Booking
              </Button>
            </div>

            {jobs.length === 0 ? (
              <div className="bg-card rounded-2xl p-8 shadow-sm border border-border text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Calendar className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">No bookings yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Your booking history will appear here.</p>
                <Button onClick={() => setShowBooking(true)}>Book a Service</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div key={job.id} className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Calendar className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-foreground text-sm">{job.title}</h3>
                            {getStatusBadge(job.status)}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(job.scheduled_date).toLocaleDateString("en-AU", {
                              weekday: "long", year: "numeric", month: "long", day: "numeric",
                            })}
                            {job.scheduled_time && ` • ${job.scheduled_time}`}
                          </p>
                          {job.description && (
                            <p className="text-xs text-muted-foreground mt-1">{job.description}</p>
                          )}
                          {job.total_price && (
                            <p className="text-sm font-medium text-primary mt-1">${job.total_price}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Booking Dialog */}
      {showBooking && contractor && (
        <PublicBookingForm
          contractorSlug={slug!}
          contractorName={name}
          onClose={() => {
            setShowBooking(false);
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default ContractorSiteDashboard;
