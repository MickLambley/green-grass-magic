import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, HardHat, TrendingUp, Users, Briefcase, Star } from "lucide-react";

interface HealthData {
  totalRevenue: number;
  revenueThisWeek: number;
  totalContractors: number;
  activeContractors: number;
  totalCustomers: number;
  totalJobsCompleted: number;
  avgRating: number;
  totalDisputes: number;
}

const AdminPlatformHealthCards = () => {
  const [data, setData] = useState<HealthData>({
    totalRevenue: 0, revenueThisWeek: 0, totalContractors: 0, activeContractors: 0,
    totalCustomers: 0, totalJobsCompleted: 0, avgRating: 0, totalDisputes: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);

    const [
      totalContractorRes, activeContractorRes, customersRes,
      completedJobsRes, revenueAllRes, revenueWeekRes, avgRatingRes, disputesRes,
    ] = await Promise.all([
      supabase.from("contractors").select("id", { count: "exact", head: true }).eq("approval_status", "approved"),
      supabase.from("contractors").select("id", { count: "exact", head: true }).eq("approval_status", "approved").eq("is_active", true)
        .gte("last_active_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("clients").select("user_id", { count: "exact", head: true }),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("jobs").select("total_price").eq("status", "completed"),
      supabase.from("jobs").select("total_price").eq("status", "completed").gte("completed_at", weekStart.toISOString()),
      supabase.from("contractors").select("average_rating").eq("approval_status", "approved").not("average_rating", "is", null),
      supabase.from("disputes").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    const totalRev = (revenueAllRes.data || []).reduce((s, j) => s + (Number(j.total_price) || 0), 0);
    const weekRev = (revenueWeekRes.data || []).reduce((s, j) => s + (Number(j.total_price) || 0), 0);
    const ratings = avgRatingRes.data || [];
    const avgR = ratings.length > 0 ? ratings.reduce((s, c) => s + (Number(c.average_rating) || 0), 0) / ratings.length : 0;

    setData({
      totalRevenue: totalRev,
      revenueThisWeek: weekRev,
      totalContractors: totalContractorRes.count || 0,
      activeContractors: activeContractorRes.count || 0,
      totalCustomers: customersRes.count || 0,
      totalJobsCompleted: completedJobsRes.count || 0,
      avgRating: Math.round(avgR * 10) / 10,
      totalDisputes: disputesRes.count || 0,
    });
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="animate-pulse"><CardContent className="pt-5 pb-4"><div className="h-16 bg-muted rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const cards = [
    { label: "Total Revenue", value: `$${data.totalRevenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}`, icon: DollarSign, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40" },
    { label: "Revenue This Week", value: `$${data.revenueThisWeek.toLocaleString("en-AU", { minimumFractionDigits: 0 })}`, icon: TrendingUp, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/40" },
    { label: "Active Contractors", value: `${data.activeContractors} / ${data.totalContractors}`, icon: HardHat, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/40" },
    { label: "Total Customers", value: data.totalCustomers.toString(), icon: Users, color: "text-violet-600 bg-violet-100 dark:bg-violet-900/40" },
    { label: "Jobs Completed", value: data.totalJobsCompleted.toString(), icon: Briefcase, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40" },
    { label: "Avg Contractor Rating", value: data.avgRating > 0 ? `${data.avgRating} ★` : "N/A", icon: Star, color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/40" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-foreground mb-1">Platform Health</h2>
        <p className="text-sm text-muted-foreground">High-level metrics across all contractors on the Yardly platform.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="pt-5 pb-4 px-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold leading-tight text-foreground">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{card.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AdminPlatformHealthCards;
