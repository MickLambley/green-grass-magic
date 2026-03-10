import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CreditCard, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/integrations/supabase/types";

type Contractor = Tables<"contractors">;

interface StripeConnectSettingsCardProps {
  contractor: Contractor;
}

const StripeConnectSettingsCard = ({ contractor }: StripeConnectSettingsCardProps) => {
  const [isConnecting, setIsConnecting] = useState(false);

  const isConnected = contractor.stripe_account_id && contractor.stripe_onboarding_complete;
  const isPartial = contractor.stripe_account_id && !contractor.stripe_onboarding_complete;

  const handleConnect = async () => {
    setIsConnecting(true);
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
    setIsConnecting(false);
  };

  const handleDashboard = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "create-login-link" },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      toast.error("Failed to open Stripe dashboard.");
    }
    setIsConnecting(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Stripe Payments
        </CardTitle>
        <CardDescription>Accept online payments from customers via Stripe Connect</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Connected & Active</span>
              <Badge variant="outline" className="ml-auto text-xs">
                {contractor.stripe_payouts_enabled ? "Payouts enabled" : "Payouts pending"}
              </Badge>
            </>
          ) : isPartial ? (
            <>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-600">Setup incomplete</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Not connected</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {isConnected ? (
            <>
              <Button variant="outline" size="sm" onClick={handleDashboard} disabled={isConnecting}>
                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ExternalLink className="w-4 h-4 mr-1" />}
                Stripe Dashboard
              </Button>
              <Button variant="outline" size="sm" onClick={handleConnect} disabled={isConnecting}>
                Reconnect
              </Button>
            </>
          ) : (
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
              {isPartial ? "Complete Stripe Setup" : "Connect Stripe"}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Stripe Connect allows you to securely accept payments from online bookings. Funds are deposited directly to your bank account.
        </p>
      </CardContent>
    </Card>
  );
};

export default StripeConnectSettingsCard;
