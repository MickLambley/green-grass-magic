import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, Mail, Lock, User, ArrowRight, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable/index";
import { z } from "zod";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

const ContractorAuth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(
    searchParams.get("mode") === "signup"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          // Check if user has contractor role
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", "contractor");

          if (roles && roles.length > 0) {
            const { data: contractor } = await supabase
              .from("contractors")
              .select("*")
              .eq("user_id", session.user.id)
              .single();

            if (contractor && contractor.onboarding_completed) {
              navigate("/contractor");
            } else {
              navigate("/contractor-onboarding");
            }
          } else {
            // User is on the contractor auth page — add contractor role and profile
            await supabase.from("user_roles").insert({
              user_id: session.user.id,
              role: "contractor",
            });

            const { data: existingContractor } = await supabase
              .from("contractors")
              .select("id")
              .eq("user_id", session.user.id)
              .single();

            if (!existingContractor) {
              await supabase.from("contractors").insert({
                user_id: session.user.id,
                business_name: null,
                service_areas: [],
                is_active: false,
              });
            }

            toast.success("Welcome! Please complete your contractor profile.");
            navigate("/contractor-onboarding");
          }
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "contractor");

        if (roles && roles.length > 0) {
          const { data: contractor } = await supabase
            .from("contractors")
            .select("*")
            .eq("user_id", session.user.id)
            .single();

          if (contractor && contractor.abn) {
            navigate("/contractor");
          } else {
            navigate("/contractor-onboarding");
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, isSignUp]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const emailResult = emailSchema.safeParse(formData.email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(formData.password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    if (isSignUp) {
      const nameResult = nameSchema.safeParse(formData.fullName);
      if (!nameResult.success) {
        newErrors.fullName = nameResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/contractor-onboarding`,
            data: {
              full_name: formData.fullName,
            },
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            // Existing user — sign them in and add contractor role
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: formData.email,
              password: formData.password,
            });

            if (signInError) {
              toast.error("This email is already registered. Please sign in with your existing password.");
            } else if (signInData.user) {
              // Check if they already have contractor role
              const { data: existingRoles } = await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", signInData.user.id)
                .eq("role", "contractor");

              if (!existingRoles || existingRoles.length === 0) {
                await supabase.from("user_roles").insert({
                  user_id: signInData.user.id,
                  role: "contractor",
                });
              }

              // Check if contractor profile exists
              const { data: existingContractor } = await supabase
                .from("contractors")
                .select("id")
                .eq("user_id", signInData.user.id)
                .single();

              if (!existingContractor) {
                await supabase.from("contractors").insert({
                  user_id: signInData.user.id,
                  business_name: null,
                  service_areas: [],
                  is_active: false,
                });
              }

              toast.success("Welcome! Please complete your contractor profile.");
              navigate("/contractor-onboarding");
            }
          } else {
            toast.error(error.message);
          }
        } else if (data.user) {
          // Add contractor role
          await supabase.from("user_roles").insert({
            user_id: data.user.id,
            role: "contractor",
          });

          // Create contractor profile
          await supabase.from("contractors").insert({
            user_id: data.user.id,
            business_name: null,
            service_areas: [],
            is_active: false,
          });

          toast.success("Account created! Please complete your contractor profile.");
          navigate("/contractor-onboarding");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("Invalid email or password. Please try again.");
          } else {
            toast.error(error.message);
          }
        }
        // Navigation handled by auth state change listener
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Back link */}
          <Link 
            to="/contractors" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Contractors
          </Link>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-soft">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-foreground">
                Yardly
              </span>
              <span className="ml-2 text-sm text-muted-foreground">Contractors</span>
            </div>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              {isSignUp ? "Join as a Contractor" : "Contractor Login"}
            </h1>
            <p className="text-muted-foreground">
              {isSignUp
                ? "Start earning with Yardly"
                : "Sign in to your contractor account"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Smith"
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    className="pl-11"
                  />
                </div>
                {errors.fullName && (
                  <p className="text-sm text-destructive">{errors.fullName}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="pl-11"
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="pl-11"
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {isSignUp ? "Create Account" : "Sign In"}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </Button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              disabled={isLoading}
              onClick={async () => {
                const { error } = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin + "/contractor-auth",
                });
                if (error) {
                  toast.error("Google sign-in failed. Please try again.");
                }
              }}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </Button>
          </form>

          {/* Toggle */}
          <p className="text-center text-muted-foreground mt-6">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary font-medium hover:underline"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>

          {/* Customer link */}
          <p className="text-center text-muted-foreground mt-4 text-sm">
            Looking to book lawn care?{" "}
            <Link to="/auth" className="text-primary hover:underline">
              Customer login
            </Link>
          </p>
        </div>
      </div>

      {/* Right Panel - Decorative */}
      <div className="hidden lg:flex flex-1 gradient-hero items-center justify-center p-12">
        <div className="max-w-md text-center text-primary-foreground">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
            <Leaf className="w-12 h-12" />
          </div>
          <h2 className="font-display text-3xl font-bold mb-4">
            Grow Your Business with Yardly
          </h2>
          <p className="text-primary-foreground/80 text-lg leading-relaxed">
            Manage your clients, schedule jobs, send invoices, and get paid — 
            all from one simple platform built for lawn care pros.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContractorAuth;
