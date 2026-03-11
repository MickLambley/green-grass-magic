import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Receipt, CreditCard, Globe, Users, Calendar, Sparkles, ArrowRight } from "lucide-react";

interface GettingStartedChecklistProps {
  contractorId: string;
  stripeOnboardingComplete: boolean;
  websitePublished: boolean;
  onNavigate: (tab: string) => void;
}

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  icon: any;
  done: boolean;
  action?: () => void;
  actionLabel?: string;
}

const GettingStartedChecklist = ({ contractorId, stripeOnboardingComplete, websitePublished, onNavigate }: GettingStartedChecklistProps) => {
  const [hasClient, setHasClient] = useState(false);
  const [hasJob, setHasJob] = useState(false);
  const [hasInvoice, setHasInvoice] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [contractorId]);

  const fetchStatus = async () => {
    const [clientsRes, jobsRes, invoicesRes] = await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId),
    ]);
    setHasClient((clientsRes.count || 0) > 0);
    setHasJob((jobsRes.count || 0) > 0);
    setHasInvoice((invoicesRes.count || 0) > 0);
    setIsLoading(false);
  };

  if (isLoading) return null;

  const items: ChecklistItem[] = [
    {
      key: "client",
      label: "Add your first client",
      description: "Start managing your customer base",
      icon: Users,
      done: hasClient,
      action: () => onNavigate("clients"),
      actionLabel: "Add Client",
    },
    {
      key: "job",
      label: "Schedule your first job",
      description: "Keep track of your work schedule",
      icon: Calendar,
      done: hasJob,
      action: () => onNavigate("jobs"),
      actionLabel: "Add Job",
    },
    {
      key: "invoice",
      label: "Send your first invoice",
      description: "Get paid faster",
      icon: Receipt,
      done: hasInvoice,
      action: () => onNavigate("invoices"),
      actionLabel: "New Invoice",
    },
    {
      key: "stripe",
      label: "Connect Stripe",
      description: "Accept online payments",
      icon: CreditCard,
      done: stripeOnboardingComplete,
      action: () => onNavigate("settings"),
      actionLabel: "Set Up",
    },
    {
      key: "website",
      label: "Go live with your website",
      description: "Get new bookings 24/7",
      icon: Globe,
      done: websitePublished,
      action: () => onNavigate("website"),
      actionLabel: "Set Up",
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const allDone = completedCount === items.length;

  if (dismissed) return null;

  if (allDone) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">You're all set! 🎉</p>
              <p className="text-xs text-muted-foreground">Your business is fully set up on Yardly.</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} className="text-muted-foreground text-xs">
            Dismiss
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Getting Started
          </CardTitle>
          <span className="text-xs text-muted-foreground">{completedCount}/{items.length} complete</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 mt-2">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / items.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {items.map((item) => (
          <div
            key={item.key}
            className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
              item.done ? "opacity-60" : "hover:bg-muted/50"
            }`}
          >
            {item.done ? (
              <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground/40 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            {!item.done && item.action && (
              <Button variant="ghost" size="sm" className="text-xs text-primary h-7 px-2" onClick={item.action}>
                {item.actionLabel} <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default GettingStartedChecklist;
