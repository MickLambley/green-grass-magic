import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight, X, Sparkles, Lock } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Contractor = Tables<"contractors">;

interface GettingStartedChecklistProps {
  contractor: Contractor;
  onNavigate: (tab: string) => void;
}

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  done: boolean;
  actionLabel: string;
  action: () => void;
}

const GettingStartedChecklist = ({ contractor, onNavigate }: GettingStartedChecklistProps) => {
  const [hasServiceArea, setHasServiceArea] = useState(false);
  const [hasActiveService, setHasActiveService] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const responses = (contractor.questionnaire_responses as Record<string, unknown>) || {};

  useEffect(() => {
    const stored = localStorage.getItem(`checklist_dismissed_${contractor.id}`);
    if (stored === "true") setDismissed(true);
    fetchStatus();
  }, [contractor.id]);

  const fetchStatus = async () => {
    const [suburbsRes, servicesRes] = await Promise.all([
      supabase.from("contractor_service_suburbs").select("id", { count: "exact", head: true }).eq("contractor_id", contractor.id),
      supabase.from("service_offerings").select("id", { count: "exact", head: true }).eq("contractor_id", contractor.id).eq("is_active", true),
    ]);
    setHasServiceArea((suburbsRes.count ?? 0) > 0);
    setHasActiveService((servicesRes.count ?? 0) > 0);
    setIsLoading(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(`checklist_dismissed_${contractor.id}`, "true");
    setDismissed(true);
  };

  const handleRestore = () => {
    localStorage.removeItem(`checklist_dismissed_${contractor.id}`);
    setDismissed(false);
  };

  const handleStripeConnect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "create-account" },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch {
      toast.error("Failed to start Stripe setup. Please try again.");
    }
  };

  if (isLoading) return null;

  // Tier 1 checks
  const hasAbn = !!(contractor.abn && contractor.abn.trim());
  const settingsSaved = !!(responses.settings_saved);
  const pricingConfirmed = !!(responses.pricing_confirmed_at);
  const hasBankTransfer = !!(contractor.bank_bsb && contractor.bank_account_number);
  const defaultTerms = responses.default_payment_terms as string | undefined;
  const hasPaymentTerms = !!(defaultTerms && defaultTerms.trim());

  const tier1Items: ChecklistItem[] = [
    {
      key: "abn",
      label: "Add your ABN",
      description: "Required on all Australian invoices.",
      done: hasAbn,
      actionLabel: "Add ABN →",
      action: () => onNavigate("settings"),
    },
    {
      key: "gst",
      label: "Confirm your GST status",
      description: "Determines whether you issue a Tax Invoice or standard invoice.",
      done: !!(responses.gst_status_confirmed),
      actionLabel: "Review in Settings →",
      action: () => onNavigate("settings"),
    },
    {
      key: "pricing",
      label: "Review and confirm your pricing",
      description: "Make sure your prices are right before going live.",
      done: !!pricingConfirmed,
      actionLabel: "Review Pricing →",
      action: () => onNavigate("pricing"),
    },
    {
      key: "services",
      label: "Enable your services",
      description: "Choose which services you offer to clients.",
      done: hasActiveService,
      actionLabel: "Choose Services →",
      action: () => onNavigate("services"),
    },
    {
      key: "bank",
      label: "Add bank transfer details",
      description: "So clients know how to pay your invoices.",
      done: hasBankTransfer,
      actionLabel: "Add Bank Details →",
      action: () => onNavigate("settings"),
    },
    {
      key: "terms",
      label: "Set your default payment terms",
      description: "Automatically sets a due date on every invoice.",
      done: hasPaymentTerms,
      actionLabel: "Set Payment Terms →",
      action: () => onNavigate("settings"),
    },
  ];

  const tier1Done = tier1Items.filter((i) => i.done).length;
  const tier1AllDone = tier1Done === tier1Items.length;

  // Tier 2
  const hasStripe = !!(contractor.stripe_account_id);

  const tier2Items: ChecklistItem[] = [
    {
      key: "service_area",
      label: "Set your service area",
      description: "Define where you're willing to travel for jobs.",
      done: hasServiceArea,
      actionLabel: "Configure →",
      action: () => onNavigate("settings"),
    },
    {
      key: "stripe",
      label: "Connect Stripe for payments",
      description: "Accept card payments from clients instantly.",
      done: hasStripe,
      actionLabel: "Connect Stripe →",
      action: handleStripeConnect,
    },
    {
      key: "website",
      label: "Go live with your website",
      description: "Publish your booking page so clients can find and book you.",
      done: contractor.website_published,
      actionLabel: "Set Up →",
      action: () => onNavigate("website"),
    },
  ];

  const tier2Done = tier2Items.filter((i) => i.done).length;
  const allComplete = tier1AllDone && tier2Done === tier2Items.length;

  // If all done, hide permanently
  if (allComplete) return null;

  // If dismissed, show small restore link
  if (dismissed) {
    return (
      <button
        onClick={handleRestore}
        className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
      >
        Setup checklist
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tier 1 */}
      <ChecklistSection
        title="Set up your account"
        completedCount={tier1Done}
        totalCount={tier1Items.length}
        items={tier1Items}
        locked={false}
        onDismiss={handleDismiss}
      />

      {/* Tier 2 */}
      <ChecklistSection
        title="Accept online bookings"
        completedCount={tier2Done}
        totalCount={tier2Items.length}
        items={tier2Items}
        locked={!tier1AllDone}
      />
    </div>
  );
};

function ChecklistSection({
  title,
  completedCount,
  totalCount,
  items,
  locked,
  onDismiss,
}: {
  title: string;
  completedCount: number;
  totalCount: number;
  items: ChecklistItem[];
  locked: boolean;
  onDismiss?: () => void;
}) {
  return (
    <Card className={locked ? "opacity-60" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            {locked ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Sparkles className="w-5 h-5 text-primary" />}
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{completedCount} of {totalCount} complete</span>
            {onDismiss && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDismiss}>
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 mt-2">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
        {locked && (
          <p className="text-xs text-muted-foreground mt-2">Complete your account setup above first.</p>
        )}
      </CardHeader>
      {!locked && (
        <CardContent className="space-y-1 pt-0">
          {items.map((item) => (
            <div
              key={item.key}
              className={`flex items-start sm:items-center gap-3 p-2.5 rounded-lg transition-colors ${
                item.done ? "opacity-60" : "hover:bg-muted/50"
              }`}
            >
              {item.done ? (
                <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5 sm:mt-0" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground/40 flex-shrink-0 mt-0.5 sm:mt-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {item.label}
                </p>
                {!item.done && (
                  <>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-primary h-7 px-0 mt-1 sm:hidden"
                      onClick={item.action}
                    >
                      {item.actionLabel} <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </>
                )}
              </div>
              {!item.done && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary h-7 px-2 hidden sm:flex flex-shrink-0"
                  onClick={item.action}
                >
                  {item.actionLabel} <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default GettingStartedChecklist;
