import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const ContractorSiteAuth = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [contractor, setContractor] = useState<{
    business_name: string | null;
    business_logo_url: string | null;
  } | null>(null);

  useEffect(() => {
    loadContractor();
    checkExistingSession();
  }, [slug]);

  const loadContractor = async () => {
    if (!slug) return;
    const { data } = await supabase
      .from("contractors")
      .select("business_name, business_logo_url")
      .eq("subdomain", slug)
      .eq("website_published", true)
      .single();
    if (data) setContractor(data);
  };

  const checkExistingSession = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      navigate(`/site/${slug}/portal`, { replace: true });
    }
    setCheckingAuth(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/site/${slug}/portal`,
          },
        });
        if (error) throw error;
        toast.success("Check your email to verify your account!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        // Check if the user has a client relationship with this contractor
        const { data: contractorData } = await supabase
          .from("contractors")
          .select("id")
          .eq("subdomain", slug)
          .single();
        
        if (contractorData) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            // Check if client record exists by email or user_id
            const { data: clientRecord } = await supabase
              .from("clients")
              .select("id")
              .eq("contractor_id", contractorData.id)
              .or(`email.eq.${email},user_id.eq.${authUser.id}`)
              .maybeSingle();
            
            if (!clientRecord) {
              await supabase.auth.signOut();
              toast.error("No account found with this business. Please book a service first.");
              setLoading(false);
              return;
            }
            
            // Link user_id to client record if not already linked
            if (clientRecord) {
              await supabase
                .from("clients")
                .update({ user_id: authUser.id })
                .eq("id", clientRecord.id)
                .is("user_id", null);
            }
          }
        }
        
        navigate(`/site/${slug}/portal`);
      }
    } catch (error: any) {
      toast.error(error.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const name = contractor?.business_name || "Lawn Care Pro";

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <button
            onClick={() => navigate(`/site/${slug}`)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to site</span>
          </button>
          <div className="flex items-center gap-2">
            {contractor?.business_logo_url ? (
              <img src={contractor.business_logo_url} alt={name} className="w-7 h-7 rounded-lg object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-lg gradient-hero flex items-center justify-center">
                <Leaf className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
            )}
            <span className="font-display font-bold text-foreground text-sm">{name}</span>
          </div>
        </div>
      </nav>

      {/* Auth Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? `Sign in to view your bookings with ${name}`
                : `Sign up to manage your services with ${name}`}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Smith"
                  required
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-primary font-medium hover:underline"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContractorSiteAuth;
