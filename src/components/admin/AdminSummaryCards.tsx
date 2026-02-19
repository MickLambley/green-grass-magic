import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  MapPin,
  Clock,
  FileText,
  AlertTriangle,
  ThumbsUp,
  DollarSign,
  HardHat,
} from "lucide-react";

export type AdminFilter =
  | null
  | "pending_addresses"
  | "unassigned_jobs"
  | "price_change_pending"
  | "disputes"
  | "quality"
  | "revenue"
  | "contractors";

interface SummaryData {
  pendingAddresses: number;
  pendingAddressesUrgent: boolean;
  unassignedJobs24h: number;
  priceChangePending: number;
  unresolvedDisputes: number;
  disputesUrgent: boolean;
  satisfactionPct: number;
  revenueThisWeek: number;
  activeContractors: number;
  totalContractors: number;
}

interface AdminSummaryCardsProps {
  activeFilter: AdminFilter;
  onFilterChange: (filter: AdminFilter) => void;
}

const AdminSummaryCards = ({ activeFilter, onFilterChange }: AdminSummaryCardsProps) => {
  const [data, setData] = useState<SummaryData>({
    pendingAddresses: 0,
    pendingAddressesUrgent: false,
    unassignedJobs24h: 0,
    priceChangePending: 0,
    unresolvedDisputes: 0,
    disputesUrgent: false,
    satisfactionPct: 100,
    revenueThisWeek: 0,
    activeContractors: 0,
    totalContractors: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    // Start of this week (Monday)
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString();

    const [
      pendingAddrRes,
      urgentAddrRes,
      unassignedRes,
      priceChangeRes,
      disputesRes,
      urgentDisputesRes,
      completedRes,
      disputedCompletedRes,
      revenueRes,
      activeContractorRes,
      totalContractorRes,
    ] = await Promise.all([
      // 1. Pending addresses count
      supabase
        .from("addresses")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      // 1b. Urgent pending addresses (>24h)
      supabase
        .from("addresses")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("created_at", twentyFourHoursAgo),
      // 2. Unassigned jobs >24h
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed")
        .is("contractor_id", null)
        .lt("created_at", twentyFourHoursAgo),
      // 3. Price change pending
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "price_change_pending"),
      // 4. Unresolved disputes
      supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      // 4b. Urgent disputes (>48h)
      supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("created_at", fortyEightHoursAgo),
      // 5. Total completed jobs (for satisfaction)
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("status", ["completed", "completed_pending_verification"]),
      // 5b. Disputed completed (for satisfaction)
      supabase
        .from("disputes")
        .select("id", { count: "exact", head: true }),
      // 6. Revenue this week
      supabase
        .from("bookings")
        .select("total_price")
        .in("status", ["completed", "completed_pending_verification"])
        .gte("completed_at", weekStartStr),
      // 7. Active contractors (accepted a job in last 7 days)
      supabase
        .from("contractors")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .gte("last_active_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      // 7b. Total approved contractors
      supabase
        .from("contractors")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "approved"),
    ]);

    const totalCompleted = completedRes.count || 0;
    const totalDisputes = disputedCompletedRes.count || 0;
    const satisfactionPct =
      totalCompleted > 0
        ? Math.round(((totalCompleted - totalDisputes) / totalCompleted) * 100)
        : 100;

    const revenueTotal = (revenueRes.data || []).reduce(
      (sum, b) => sum + (Number(b.total_price) || 0),
      0
    );

    setData({
      pendingAddresses: pendingAddrRes.count || 0,
      pendingAddressesUrgent: (urgentAddrRes.count || 0) > 0,
      unassignedJobs24h: unassignedRes.count || 0,
      priceChangePending: priceChangeRes.count || 0,
      unresolvedDisputes: disputesRes.count || 0,
      disputesUrgent: (urgentDisputesRes.count || 0) > 0,
      satisfactionPct,
      revenueThisWeek: revenueTotal,
      activeContractors: activeContractorRes.count || 0,
      totalContractors: totalContractorRes.count || 0,
    });

    setLoading(false);
  };

  const handleClick = (filter: AdminFilter) => {
    onFilterChange(activeFilter === filter ? null : filter);
  };

  type CardColor = "red" | "yellow" | "green" | "blue";

  const getColorClasses = (color: CardColor, isActive: boolean) => {
    const base: Record<CardColor, { bg: string; icon: string; border: string }> = {
      red: {
        bg: "bg-red-50 dark:bg-red-950/30",
        icon: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
        border: "border-red-200 dark:border-red-800",
      },
      yellow: {
        bg: "bg-amber-50 dark:bg-amber-950/30",
        icon: "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400",
        border: "border-amber-200 dark:border-amber-800",
      },
      green: {
        bg: "bg-emerald-50 dark:bg-emerald-950/30",
        icon: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400",
        border: "border-emerald-200 dark:border-emerald-800",
      },
      blue: {
        bg: "bg-blue-50 dark:bg-blue-950/30",
        icon: "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400",
        border: "border-blue-200 dark:border-blue-800",
      },
    };
    const c = base[color];
    return {
      card: `${c.bg} ${isActive ? `ring-2 ring-offset-2 ${c.border}` : ""} border ${c.border}`,
      icon: c.icon,
    };
  };

  const cards: {
    id: AdminFilter;
    label: string;
    value: string;
    icon: React.ReactNode;
    color: CardColor;
  }[] = [
    {
      id: "pending_addresses",
      label: "Addresses Pending Verification",
      value: data.pendingAddresses.toString(),
      icon: <MapPin className="w-5 h-5" />,
      color: data.pendingAddresses === 0 ? "green" : data.pendingAddressesUrgent ? "red" : "yellow",
    },
    {
      id: "unassigned_jobs",
      label: "Unassigned Jobs (>24h)",
      value: data.unassignedJobs24h.toString(),
      icon: <Clock className="w-5 h-5" />,
      color: data.unassignedJobs24h > 0 ? "red" : "green",
    },
    {
      id: "price_change_pending",
      label: "Bookings Awaiting Approval",
      value: data.priceChangePending.toString(),
      icon: <FileText className="w-5 h-5" />,
      color: data.priceChangePending > 0 ? "yellow" : "green",
    },
    {
      id: "disputes",
      label: "Reported Issues",
      value: data.unresolvedDisputes.toString(),
      icon: <AlertTriangle className="w-5 h-5" />,
      color: data.unresolvedDisputes === 0 ? "green" : data.disputesUrgent ? "red" : "yellow",
    },
    {
      id: "quality",
      label: "Customer Satisfaction",
      value: `${data.satisfactionPct}%`,
      icon: <ThumbsUp className="w-5 h-5" />,
      color: data.satisfactionPct >= 90 ? "green" : data.satisfactionPct >= 80 ? "yellow" : "red",
    },
    {
      id: "revenue",
      label: "Revenue This Week",
      value: `$${data.revenueThisWeek.toFixed(0)}`,
      icon: <DollarSign className="w-5 h-5" />,
      color: "blue",
    },
    {
      id: "contractors",
      label: "Active Contractors",
      value: `${data.activeContractors} / ${data.totalContractors}`,
      icon: <HardHat className="w-5 h-5" />,
      color:
        data.totalContractors === 0
          ? "yellow"
          : data.activeContractors / data.totalContractors > 0.7
          ? "green"
          : data.activeContractors / data.totalContractors >= 0.5
          ? "yellow"
          : "red",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-5 pb-4">
              <div className="h-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((card) => {
        const isActive = activeFilter === card.id;
        const colors = getColorClasses(card.color, isActive);
        return (
          <Card
            key={card.id}
            className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${colors.card}`}
            onClick={() => handleClick(card.id)}
          >
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 ${colors.icon}`}>
                  {card.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-tight">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                    {card.label}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default AdminSummaryCards;
