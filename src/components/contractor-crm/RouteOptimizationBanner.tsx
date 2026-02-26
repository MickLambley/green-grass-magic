import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, TrendingUp, Lock, Loader2, Zap, Route } from "lucide-react";

interface RouteOptimizationBannerProps {
  contractorId: string;
  subscriptionTier: string;
  onOpenOptimizations: () => void;
  onRunOptimization?: () => void;
  isOptimizing?: boolean;
}

const RouteOptimizationBanner = ({ contractorId, subscriptionTier, onOpenOptimizations, onRunOptimization, isOptimizing }: RouteOptimizationBannerProps) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [totalSaved, setTotalSaved] = useState(0);
  const [potentialSaving, setPotentialSaving] = useState(0);
  const [teaserJobCount, setTeaserJobCount] = useState(0);
  const [teaserDate, setTeaserDate] = useState<string | null>(null);

  useEffect(() => {
    fetchOptimizationStats();
  }, [contractorId]);

  const fetchOptimizationStats = async () => {
    // For free tier: check if teaser should show (6+ jobs on a coming day)
    if (subscriptionTier === "free") {
      await checkTeaserEligibility();
      return;
    }

    // Count pending optimizations
    const { count } = await supabase
      .from("route_optimizations")
      .select("id", { count: "exact", head: true })
      .eq("contractor_id", contractorId)
      .in("status", ["pending_approval", "awaiting_customer"]);

    setPendingCount(count || 0);

    // Total time saved this month
    const monthStart = new Date();
    monthStart.setDate(1);
    const { data: applied } = await supabase
      .from("route_optimizations")
      .select("time_saved_minutes")
      .eq("contractor_id", contractorId)
      .eq("status", "applied")
      .gte("created_at", monthStart.toISOString());

    const total = (applied || []).reduce((sum, o) => sum + o.time_saved_minutes, 0);
    setTotalSaved(total);

    // Starter tier: also check teaser for upgrade to Pro
    if (subscriptionTier === "starter") {
      await checkTeaserEligibility();
    }

    // Pro: check for recent potential-saving notifications
    if (subscriptionTier === "pro") {
      const { data: notifications } = await supabase
        .from("notifications")
        .select("message")
        .eq("type", "route_optimization")
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (notifications && notifications.length > 0) {
        const match = notifications[0].message.match(/save (\d+) minutes/);
        if (match) {
          setPotentialSaving(parseInt(match[1]));
        }
      }
    }
  };

  const checkTeaserEligibility = async () => {
    // Check tomorrow and day after for 6+ jobs
    const today = new Date();
    const dates = [1, 2].map(d => {
      const date = new Date(today);
      date.setDate(today.getDate() + d);
      return date.toISOString().split("T")[0];
    });

    for (const date of dates) {
      const { count } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("contractor_id", contractorId)
        .eq("scheduled_date", date)
        .neq("status", "cancelled");

      if (count && count >= 6) {
        setTeaserJobCount(count);
        setTeaserDate(date);
        return;
      }
    }
  };

  // Fake route points for the blurred preview
  const PreviewRouteMap = ({ jobCount }: { jobCount: number }) => {
    const points = Array.from({ length: Math.min(jobCount, 10) }, (_, i) => ({
      x: 15 + Math.sin(i * 1.2) * 30 + i * 7,
      y: 20 + Math.cos(i * 0.8) * 25 + (i % 3) * 12,
    }));

    return (
      <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted/30 border border-border">
        {/* Blurred SVG route preview */}
        <svg className="w-full h-full filter blur-[2px]" viewBox="0 0 100 80">
          {/* Route line */}
          <polyline
            points={points.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            strokeDasharray="3,2"
            opacity="0.6"
          />
          {/* Optimized route line (shorter) */}
          <polyline
            points={points.map((p, i) => `${p.x + (i % 2 ? -3 : 3)},${p.y + (i % 2 ? 2 : -2)}`).join(" ")}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            opacity="0.3"
          />
          {/* Stop markers */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3" fill="hsl(var(--primary))" opacity="0.5" />
              <text x={p.x} y={p.y + 1} textAnchor="middle" fontSize="3" fill="hsl(var(--primary-foreground))" fontWeight="bold" opacity="0.6">
                {i + 1}
              </text>
            </g>
          ))}
        </svg>

        {/* Blur overlay with lock */}
        <div className="absolute inset-0 backdrop-blur-[3px] bg-background/40 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <Lock className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Upgrade to unlock</span>
          </div>
        </div>
      </div>
    );
  };

  // Free tier: show teaser only when 6+ jobs
  if (subscriptionTier === "free") {
    if (teaserJobCount < 6) return null;

    const estimatedSaving = Math.round(teaserJobCount * 5 + 10); // rough ~30-60 min estimate
    const dateLabel = teaserDate === new Date(Date.now() + 86400000).toISOString().split("T")[0] ? "tomorrow" : "in 2 days";

    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  You have {teaserJobCount} jobs {dateLabel}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upgrade to <strong className="text-foreground">Starter</strong> to optimize your route and save ~{estimatedSaving}+ minutes of driving.
                </p>
              </div>
            </div>
            <Button variant="default" size="sm" className="shrink-0" asChild>
              <a href="/contractor-dashboard?tab=settings">
                <Zap className="w-3 h-3 mr-1" /> Upgrade
              </a>
            </Button>
          </div>
          <PreviewRouteMap jobCount={teaserJobCount} />
        </CardContent>
      </Card>
    );
  }

  // Starter tier: show teaser for Pro upgrade when busy, otherwise show limited optimization
  if (subscriptionTier === "starter") {
    if (teaserJobCount >= 6) {
      const estimatedSaving = Math.round(teaserJobCount * 5 + 10);
      const dateLabel = teaserDate === new Date(Date.now() + 86400000).toISOString().split("T")[0] ? "tomorrow" : "in 2 days";

      return (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Route className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {teaserJobCount} jobs {dateLabel} — unlock unlimited optimization
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your Starter plan supports up to 25 stops/day. Upgrade to <strong className="text-foreground">Pro</strong> for unlimited optimization and save ~{estimatedSaving}+ minutes.
                  </p>
                </div>
              </div>
              <Button variant="default" size="sm" className="shrink-0" asChild>
                <a href="/contractor-dashboard?tab=settings">
                  <Zap className="w-3 h-3 mr-1" /> Go Pro
                </a>
              </Button>
            </div>
            <PreviewRouteMap jobCount={teaserJobCount} />
          </CardContent>
        </Card>
      );
    }

    // Normal starter banner with optimization access
    return (
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              {totalSaved > 0 ? (
                <>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                    <Clock className="w-4 h-4 text-primary" />
                    {totalSaved} min saved this month
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Up to 25 stops/day · Upgrade to Pro for unlimited
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Route Optimization
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Optimize up to 25 stops/day to minimize travel time
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Button size="sm" variant="outline" onClick={onOpenOptimizations}>
                Review ({pendingCount})
              </Button>
            )}
            {onRunOptimization && (
              <Button size="sm" onClick={onRunOptimization} disabled={isOptimizing}>
                {isOptimizing ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Optimizing...</>
                ) : (
                  <><MapPin className="w-3.5 h-3.5 mr-1" /> Optimize</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pro: full feature
  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            {pendingCount > 0 ? (
              <>
                <p className="text-sm font-semibold text-foreground">
                  🗺️ {pendingCount} Route Optimization{pendingCount > 1 ? "s" : ""} Pending
                </p>
                <p className="text-xs text-muted-foreground">
                  Review suggested route changes to save travel time
                </p>
              </>
            ) : potentialSaving > 0 ? (
              <>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Save ~{potentialSaving} min by optimizing routes
                </p>
                <p className="text-xs text-muted-foreground">
                  Run optimization to automatically reschedule your jobs for less travel time
                </p>
              </>
            ) : totalSaved > 0 ? (
              <>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Clock className="w-4 h-4 text-primary" />
                  {totalSaved} min saved this month
                </p>
                <p className="text-xs text-muted-foreground">
                  Run optimization anytime to check for more savings
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Route Optimization
                </p>
                <p className="text-xs text-muted-foreground">
                  Run optimization to minimize travel time between jobs
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Button size="sm" variant="outline" onClick={onOpenOptimizations}>
              Review
            </Button>
          )}
          {onRunOptimization && (
            <Button size="sm" onClick={onRunOptimization} disabled={isOptimizing}>
              {isOptimizing ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Optimizing...</>
              ) : (
                <><MapPin className="w-3.5 h-3.5 mr-1" /> Run Optimization</>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RouteOptimizationBanner;
