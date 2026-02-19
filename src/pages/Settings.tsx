import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Leaf,
  ArrowLeft,
  User as UserIcon,
  Lock,
  Bell,
  MapPin,
  Trash2,
  Loader2,
  Save,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Database } from "@/integrations/supabase/types";

type Address = Database["public"]["Tables"]["addresses"]["Row"];

const Settings = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"profile" | "password" | "addresses" | "notifications">("profile");

  // Profile state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Addresses state
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [deleteAddressId, setDeleteAddressId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Notification preferences (stored locally for now)
  const [emailBookingConfirmation, setEmailBookingConfirmation] = useState(true);
  const [emailServiceCompleted, setEmailServiceCompleted] = useState(true);
  const [emailPromotions, setEmailPromotions] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
        fetchAddresses(session.user.id);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
        fetchAddresses(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", userId)
      .single();
    if (data) {
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
    }
  };

  const fetchAddresses = async (userId: string) => {
    const { data } = await supabase
      .from("addresses")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data) setAddresses(data);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), phone: phone.trim() })
        .eq("user_id", user.id);

      if (error) throw error;

      // Also update auth metadata
      await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      });

      toast.success("Profile updated successfully");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Failed to update password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteAddress = async () => {
    if (!deleteAddressId) return;
    setIsDeleting(true);
    try {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("address_id", deleteAddressId)
        .limit(1);

      if (bookings && bookings.length > 0) {
        toast.error("Cannot delete address with existing bookings");
        setDeleteAddressId(null);
        setIsDeleting(false);
        return;
      }

      const { error } = await supabase.from("addresses").delete().eq("id", deleteAddressId);
      if (error) throw error;
      toast.success("Address deleted");
      setAddresses(addresses.filter((a) => a.id !== deleteAddressId));
    } catch {
      toast.error("Failed to delete address");
    } finally {
      setDeleteAddressId(null);
      setIsDeleting(false);
    }
  };

  const getSlopeLabel = (slope: string) => {
    const labels: Record<string, string> = { flat: "Flat", mild: "Mild slope", steep: "Steep slope" };
    return labels[slope] || slope;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl gradient-hero animate-pulse" />
      </div>
    );
  }

  const sections = [
    { id: "profile" as const, label: "Profile", icon: UserIcon },
    { id: "password" as const, label: "Password", icon: Lock },
    { id: "addresses" as const, label: "Addresses", icon: MapPin },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border px-4 md:px-8 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
            <Leaf className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-display font-bold text-foreground">Settings</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar nav */}
          <nav className="flex md:flex-col gap-2 overflow-x-auto md:w-48 flex-shrink-0">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activeSection === s.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <s.icon className="w-4 h-4" />
                {s.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 bg-card rounded-2xl p-6 md:p-8 shadow-soft">
            {activeSection === "profile" && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">Profile</h2>
                  <p className="text-sm text-muted-foreground">Manage your personal information</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Email</Label>
                    <Input value={user?.email || ""} disabled className="mt-1.5 bg-muted" />
                    <p className="text-xs text-muted-foreground mt-1">Contact support to change your email</p>
                  </div>
                  <div>
                    <Label>Full Name</Label>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      className="mt-1.5"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="04XX XXX XXX"
                      className="mt-1.5"
                      maxLength={20}
                    />
                  </div>
                  <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                    {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </Button>
                </div>
              </div>
            )}

            {activeSection === "password" && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">Change Password</h2>
                  <p className="text-sm text-muted-foreground">Update your account password</p>
                </div>
                <div className="space-y-4 max-w-md">
                  <div>
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Confirm Password</Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your new password"
                      className="mt-1.5"
                    />
                  </div>
                  <Button onClick={handleChangePassword} disabled={isSavingPassword || !newPassword}>
                    {isSavingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    Update Password
                  </Button>
                </div>
              </div>
            )}

            {activeSection === "addresses" && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">My Addresses</h2>
                  <p className="text-sm text-muted-foreground">Manage your saved properties</p>
                </div>
                {addresses.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No addresses saved yet. Add one from the dashboard.</p>
                ) : (
                  <div className="space-y-3">
                    {addresses.map((addr) => (
                      <div key={addr.id} className="flex items-start justify-between p-4 rounded-xl border border-border">
                        <div>
                          <p className="font-medium text-foreground">{addr.street_address}</p>
                          <p className="text-sm text-muted-foreground">
                            {addr.city}, {addr.state} {addr.postal_code}
                          </p>
                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{getSlopeLabel(addr.slope)}</span>
                            {addr.square_meters && <span>{addr.square_meters} m²</span>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteAddressId(addr.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSection === "notifications" && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">Notifications</h2>
                  <p className="text-sm text-muted-foreground">Choose what emails you receive</p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">Booking Confirmations</p>
                      <p className="text-sm text-muted-foreground">Receive email when a booking is confirmed</p>
                    </div>
                    <Switch checked={emailBookingConfirmation} onCheckedChange={setEmailBookingConfirmation} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">Service Completed</p>
                      <p className="text-sm text-muted-foreground">Receive email when your lawn service is done</p>
                    </div>
                    <Switch checked={emailServiceCompleted} onCheckedChange={setEmailServiceCompleted} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">Promotions & Offers</p>
                      <p className="text-sm text-muted-foreground">Receive special deals and seasonal offers</p>
                    </div>
                    <Switch checked={emailPromotions} onCheckedChange={setEmailPromotions} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Address Dialog */}
      <AlertDialog open={!!deleteAddressId} onOpenChange={(open) => !open && setDeleteAddressId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Address</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this address? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAddress}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
