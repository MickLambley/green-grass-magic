import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, ArrowRight, TrendingUp, Lock } from "lucide-react";
import { format } from "date-fns";

interface RouteOptimizationBannerProps {
  contractorId: string;
  subscriptionTier: string;
  onOpenOptimizations: () => void;
}

const RouteOptimizationBanner = ({ contractorId, subscriptionTier, onOpenOptimizations }: RouteOptimizationBannerProps) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [totalSaved, setTotalSaved] = useState(0);

  useEffect(() => {
    fetchOptimizationStats();
  }, [contractorId]);

  const fetchOptimizationStats = async () => {
    if (subscriptionTier === "free") return;

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
  };

  // Free tier: hidden
  if (subscriptionTier === "free") return null;

  // Starter tier: teaser
  if (subscriptionTier === "starter") {
    return (
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-primary" />
                Route Optimization
              </p>
              <p className="text-xs text-muted-foreground">
                Upgrade to Pro to automatically save travel time between jobs
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0">
            <Lock className="w-3 h-3 mr-1" /> Upgrade
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Pro/Team: full feature
  if (pendingCount === 0 && totalSaved === 0) return null;

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
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Clock className="w-4 h-4 text-primary" />
                  {totalSaved} min saved this month
                </p>
                <p className="text-xs text-muted-foreground">
                  Route optimization is working in the background
                </p>
              </>
            )}
          </div>
        </div>
        {pendingCount > 0 && (
          <Button size="sm" onClick={onOpenOptimizations}>
            Review
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default RouteOptimizationBanner;
