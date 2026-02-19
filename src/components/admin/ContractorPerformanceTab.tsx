import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Clock,
  DollarSign,
  Star,
  Activity,
  Shield,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Contractor = Database["public"]["Tables"]["contractors"]["Row"];

interface ContractorPerformanceTabProps {
  contractor: Contractor & { profileName?: string };
}

interface RecentJob {
  id: string;
  scheduled_date: string;
  total_price: number | null;
  status: string;
  street_address?: string;
  city?: string;
}

const ContractorPerformanceTab = ({ contractor }: ContractorPerformanceTabProps) => {
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [last30Stats, setLast30Stats] = useState({
    completed: 0,
    revenue: 0,
    avgRating: 0,
    ratingCount: 0,
    cancelled: 0,
    disputed: 0,
    avgResponse: null as number | null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerformanceData();
  }, [contractor.id]);

  const fetchPerformanceData = async () => {
    setLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysStr = thirtyDaysAgo.toISOString();

    // Fetch last 30 days stats and recent jobs in parallel
    const [completedRes, cancelledRes, disputedRes, ratingRes, responseRes, recentRes] =
      await Promise.all([
        // 30-day completed
        supabase
          .from("bookings")
          .select("total_price")
          .eq("contractor_id", contractor.id)
          .in("status", ["completed", "completed_pending_verification"])
          .gte("completed_at", thirtyDaysStr),
        // 30-day cancelled
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("contractor_id", contractor.id)
          .eq("status", "cancelled")
          .gte("updated_at", thirtyDaysStr),
        // 30-day disputes
        supabase
          .from("disputes")
          .select("booking_id")
          .gte("created_at", thirtyDaysStr)
          .in(
            "booking_id",
            (
              await supabase
                .from("bookings")
                .select("id")
                .eq("contractor_id", contractor.id)
            ).data?.map((b) => b.id) || []
          ),
        // 30-day ratings
        supabase
          .from("bookings")
          .select("customer_rating")
          .eq("contractor_id", contractor.id)
          .not("customer_rating", "is", null)
          .gte("rating_submitted_at", thirtyDaysStr),
        // 30-day avg response time
        supabase
          .from("bookings")
          .select("created_at, contractor_accepted_at")
          .eq("contractor_id", contractor.id)
          .not("contractor_accepted_at", "is", null)
          .gte("contractor_accepted_at", thirtyDaysStr),
        // Recent 10 jobs
        supabase
          .from("bookings")
          .select("id, scheduled_date, total_price, status, address_id")
          .eq("contractor_id", contractor.id)
          .order("scheduled_date", { ascending: false })
          .limit(10),
      ]);

    const completed30 = completedRes.data || [];
    const revenue30 = completed30.reduce((s, b) => s + (b.total_price || 0), 0);

    const ratings30 = ratingRes.data || [];
    const avgRating30 =
      ratings30.length > 0
        ? ratings30.reduce((s, b) => s + (b.customer_rating || 0), 0) / ratings30.length
        : 0;

    const responseTimes = (responseRes.data || [])
      .map((b) => {
        const created = new Date(b.created_at).getTime();
        const accepted = new Date(b.contractor_accepted_at!).getTime();
        return (accepted - created) / (1000 * 60 * 60);
      })
      .filter((h) => h >= 0);

    const avgResponse30 =
      responseTimes.length > 0
        ? Math.round((responseTimes.reduce((s, h) => s + h, 0) / responseTimes.length) * 10) / 10
        : null;

    setLast30Stats({
      completed: completed30.length,
      revenue: revenue30,
      avgRating: Math.round(avgRating30 * 10) / 10,
      ratingCount: ratings30.length,
      cancelled: cancelledRes.count || 0,
      disputed: disputedRes.data?.length || 0,
      avgResponse: avgResponse30,
    });

    // Enrich recent jobs with addresses
    if (recentRes.data) {
      const addressIds = [...new Set(recentRes.data.map((b) => b.address_id))];
      const { data: addrData } = await supabase
        .from("addresses")
        .select("id, street_address, city")
        .in("id", addressIds);
      const addrMap = new Map(addrData?.map((a) => [a.id, a]) || []);

      setRecentJobs(
        recentRes.data.map((b) => ({
          id: b.id,
          scheduled_date: b.scheduled_date,
          total_price: b.total_price,
          status: b.status,
          street_address: addrMap.get(b.address_id)?.street_address,
          city: addrMap.get(b.address_id)?.city,
        }))
      );
    }

    setLoading(false);
  };

  const completionRate =
    (contractor.completed_jobs_count || 0) + (contractor.cancelled_jobs_count || 0) > 0
      ? Math.round(
          ((contractor.completed_jobs_count || 0) /
            ((contractor.completed_jobs_count || 0) + (contractor.cancelled_jobs_count || 0))) *
            100
        )
      : 100;

  const disputeRate =
    (contractor.completed_jobs_count || 0) > 0
      ? Math.round(((contractor.disputed_jobs_count || 0) / (contractor.completed_jobs_count || 0)) * 100)
      : 0;

  const last30CompletionRate =
    last30Stats.completed + last30Stats.cancelled > 0
      ? Math.round((last30Stats.completed / (last30Stats.completed + last30Stats.cancelled)) * 100)
      : 100;

  const last30DisputeRate =
    last30Stats.completed > 0 ? Math.round((last30Stats.disputed / last30Stats.completed) * 100) : 0;

  const memberSince = contractor.created_at
    ? new Date(contractor.created_at).toLocaleDateString("en-AU", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "-";

  const daysSinceMember = contractor.created_at
    ? Math.floor((Date.now() - new Date(contractor.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Quality alerts
  const alerts: { message: string; level: "warning" | "error" }[] = [];
  if ((contractor.average_rating || 0) > 0 && (contractor.average_rating || 0) < 3.5)
    alerts.push({ message: "Average rating below 3.5", level: "error" });
  if (disputeRate > 5) alerts.push({ message: `Dispute rate ${disputeRate}% exceeds 5%`, level: "error" });
  if (completionRate < 90) alerts.push({ message: `Completion rate ${completionRate}% below 90%`, level: "warning" });
  if ((contractor.average_response_time_hours || 0) > 24)
    alerts.push({ message: "Average response time exceeds 24 hours", level: "warning" });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  const tierLabel = { probation: "New", standard: "Verified", premium: "Premium" }[contractor.tier] || contractor.tier;

  const getStatusColor = (status: string) => {
    const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      completed_pending_verification: "outline",
      confirmed: "secondary",
      pending: "secondary",
      cancelled: "destructive",
      disputed: "destructive",
    };
    return map[status] || "secondary";
  };

  return (
    <div className="space-y-6">
      {/* Last 30 Days */}
      <div>
        <Label className="text-base font-semibold flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4" />
          Last 30 Days
        </Label>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-3 text-center">
              <p className="text-2xl font-bold">{last30Stats.completed}</p>
              <p className="text-xs text-muted-foreground">Jobs Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3 text-center">
              <p className="text-2xl font-bold">${last30Stats.revenue.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Revenue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3 text-center">
              <p className="text-2xl font-bold">
                {last30Stats.avgRating > 0 ? `${last30Stats.avgRating} ⭐` : "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                Avg Rating ({last30Stats.ratingCount})
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3 text-center">
              <p className="text-2xl font-bold">{last30CompletionRate}%</p>
              <p className="text-xs text-muted-foreground">Completion Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3 text-center">
              <p className={`text-2xl font-bold ${last30DisputeRate > 5 ? "text-destructive" : ""}`}>
                {last30DisputeRate}%
              </p>
              <p className="text-xs text-muted-foreground">Dispute Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-3 text-center">
              <p className="text-2xl font-bold">
                {last30Stats.avgResponse !== null ? `${last30Stats.avgResponse}h` : "-"}
              </p>
              <p className="text-xs text-muted-foreground">Response Time</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* All-Time Stats */}
      <div>
        <Label className="text-base font-semibold flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4" />
          All-Time Stats
        </Label>
        <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-y-2">
            <div>
              <span className="text-muted-foreground">Total Jobs:</span>{" "}
              <span className="font-medium">{contractor.completed_jobs_count || 0}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Revenue:</span>{" "}
              <span className="font-medium">${Number(contractor.total_revenue || 0).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Overall Rating:</span>{" "}
              <span className="font-medium">
                {(contractor.average_rating || 0) > 0
                  ? `${contractor.average_rating} ⭐ (${contractor.total_ratings_count || 0})`
                  : "-"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Current Tier:</span>{" "}
              <Badge variant="outline" className="ml-1">{tierLabel}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Member Since:</span>{" "}
              <span className="font-medium">{memberSince}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Days Active:</span>{" "}
              <span className="font-medium">{daysSinceMember}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quality Alerts */}
      <div>
        <Label className="text-base font-semibold flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4" />
          Quality Alerts
        </Label>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <CheckCircle className="w-4 h-4" />
            No issues detected — all metrics within acceptable thresholds.
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 text-sm rounded-lg p-3 ${
                  alert.level === "error"
                    ? "text-destructive bg-destructive/10"
                    : "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div>
        <Label className="text-base font-semibold flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4" />
          Recent Activity
        </Label>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No jobs yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-sm">
                    {new Date(job.scheduled_date).toLocaleDateString("en-AU")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {job.street_address ? `${job.street_address}, ${job.city}` : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {job.total_price ? `$${Number(job.total_price).toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(job.status)} className="text-xs">
                      {job.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default ContractorPerformanceTab;
