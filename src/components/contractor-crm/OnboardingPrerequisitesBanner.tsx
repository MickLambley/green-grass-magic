import { AlertTriangle, MapPin, CreditCard, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface OnboardingPrerequisitesBannerProps {
  contractorId: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  onNavigateToSettings: () => void;
  /** Pass contractor.updated_at so the banner re-checks after settings saves */
  refreshKey?: string;
}

const OnboardingPrerequisitesBanner = ({
  contractorId,
  stripeAccountId,
  stripeOnboardingComplete,
  onNavigateToSettings,
  refreshKey,
}: OnboardingPrerequisitesBannerProps) => {
  const [hasServiceArea, setHasServiceArea] = useState<boolean | null>(null);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  useEffect(() => {
    checkServiceArea();
  }, [contractorId, refreshKey]);

  const checkServiceArea = async () => {
    const { count } = await supabase
      .from("contractor_service_suburbs")
      .select("id", { count: "exact", head: true })
      .eq("contractor_id", contractorId);
    setHasServiceArea((count ?? 0) > 0);
  };

  const stripeComplete = stripeAccountId && stripeOnboardingComplete;

  // Don't render if both are complete
  if (hasServiceArea === null) return null;
  if (hasServiceArea && stripeComplete) return null;

  const handleStripeConnect = async () => {
    setIsConnectingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "create-account" },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      toast.error("Failed to start Stripe setup. Please try again.");
    }
    setIsConnectingStripe(false);
  };

  const items = [
    {
      key: "service_area",
      complete: hasServiceArea,
      label: "Set up your service area",
      icon: MapPin,
      action: onNavigateToSettings,
      actionLabel: "Configure",
    },
    {
      key: "stripe",
      complete: !!stripeComplete,
      label: "Connect Stripe for payments",
      icon: CreditCard,
      action: handleStripeConnect,
      actionLabel: "Connect Stripe",
      loading: isConnectingStripe,
    },
  ];

  const incomplete = items.filter((i) => !i.complete);

  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-destructive">
            Complete setup to accept online bookings
          </p>
          <p className="text-xs text-destructive/80 mt-0.5">
            {incomplete.length === 1
              ? "1 step remaining before you can receive online bookings."
              : `${incomplete.length} steps remaining before you can receive online bookings.`}
          </p>
        </div>
      </div>
      <div className="space-y-2 pl-8">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              {item.complete ? (
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
              ) : (
                <item.icon className="w-4 h-4 text-destructive flex-shrink-0" />
              )}
              <span
                className={`text-sm ${
                  item.complete
                    ? "text-muted-foreground line-through"
                    : "text-foreground font-medium"
                }`}
              >
                {item.label}
              </span>
            </div>
            {!item.complete && (
              <Button
                size="sm"
                variant="destructive"
                onClick={item.action}
                disabled={item.loading}
                className="flex-shrink-0"
              >
                {item.loading && (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                )}
                {item.actionLabel}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OnboardingPrerequisitesBanner;
