import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isTestModeAllowed, getTestKey } from "@/lib/testMode";
import { User, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TestModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const personas = [
  {
    key: "customer_new",
    label: "Test Customer",
    description: "Can browse, add addresses, and book lawn mowing jobs",
    icon: <User className="w-5 h-5" />,
    redirect: "/dashboard",
  },
  {
    key: "contractor_active",
    label: "Test Contractor",
    description: "Can view available jobs and accept bookings",
    icon: <Briefcase className="w-5 h-5" />,
    redirect: "/contractor",
  },
];

const TestModeDialog = ({ open, onOpenChange }: TestModeDialogProps) => {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelect = async (persona: typeof personas[0]) => {
    if (!isTestModeAllowed()) return;
    setLoading(persona.key);

    try {
      // Sign out any existing session first
      await supabase.auth.signOut();

      const testKey = getTestKey();
      if (!testKey) throw new Error("Test key not found. Please reload with ?test_key= parameter.");
      const { data, error } = await supabase.functions.invoke("test-mode-login", {
        body: { persona: persona.key, test_key: testKey },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Set the real session from the edge function response
      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        // Mark test mode active in sessionStorage for banner display
        sessionStorage.setItem("testModeActive", "true");
        sessionStorage.setItem("testModePersona", persona.key);

        onOpenChange(false);
        toast.success(`Signed in as ${persona.label}`);
        window.location.href = persona.redirect;
      }
    } catch (err: any) {
      console.error("Test mode login failed:", err);
      toast.error(`Failed to sign in: ${err.message}`);
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">🧪 Test Mode</DialogTitle>
          <DialogDescription>
            Select a persona to sign in as a real test user. The customer can request jobs and the contractor can accept them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {personas.map((p) => (
            <button
              key={p.key}
              onClick={() => handleSelect(p)}
              disabled={loading !== null}
              className="w-full flex items-center gap-4 p-4 rounded-lg border border-border hover:border-primary hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {loading === p.key ? <Loader2 className="w-5 h-5 animate-spin" /> : p.icon}
              </div>
              <div>
                <div className="font-semibold text-foreground">{p.label}</div>
                <div className="text-sm text-muted-foreground">{p.description}</div>
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center pt-2">
          These are real test accounts. Sign out to end the session.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default TestModeDialog;
