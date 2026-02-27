import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

interface StripeConnectBannerProps {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
}

const StripeConnectBanner = ({ stripeAccountId, stripeOnboardingComplete }: StripeConnectBannerProps) => {
  const [isLoading, setIsLoading] = useState(false);

  if (stripeAccountId && stripeOnboardingComplete) return null;

  const handleConnect = async () => {
    setIsLoading(true);
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
    setIsLoading(false);
  };

  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
      <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
      <p className="text-sm font-medium text-destructive flex-1 min-w-0">
        <strong>Warning:</strong> Your Stripe account is not connected. You will not be able to accept online payments until you complete your setup.
      </p>
      <Button
        size="sm"
        variant="destructive"
        onClick={handleConnect}
        disabled={isLoading}
        className="flex-shrink-0"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
        Complete Setup
      </Button>
    </div>
  );
};

export default StripeConnectBanner;
