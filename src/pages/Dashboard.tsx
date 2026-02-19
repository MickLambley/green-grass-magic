import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Leaf,
  Calendar,
  MapPin,
  Clock,
  Plus,
  LogOut,
  Home,
  Settings,
  ChevronRight,
  Menu,
  X,
  Shield,
  Bell,
  Trash2,
  Pencil,
  AlertTriangle,
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
import { toast } from "sonner";
import AddAddressDialog from "@/components/dashboard/AddAddressDialog";
import BookingDialog from "@/components/dashboard/BookingDialog";
import NotificationsPopover from "@/components/dashboard/NotificationsPopover";
import CompletedServicesDialog from "@/components/dashboard/CompletedServicesDialog";
import { AlternativeSuggestionsCard } from "@/components/dashboard/AlternativeSuggestionsCard";
import JobPhotosGallery from "@/components/dashboard/JobPhotosGallery";
import type { Database } from "@/integrations/supabase/types";

type AlternativeSuggestion = {
  id: string;
  booking_id: string;
  contractor_id: string;
  suggested_date: string;
  suggested_time_slot: string;
  status: string;
  created_at: string;
  contractor?: {
    business_name: string | null;
    user_id: string;
  };
  contractor_profile?: {
    full_name: string | null;
  };
};

type Address = Database["public"]["Tables"]["addresses"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"] & {
  contractor?: {
    business_name: string | null;
    user_id: string;
  } | null;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "bookings">("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [completedServicesDialogOpen, setCompletedServicesDialogOpen] = useState(false);
  const [selectedAddressIdForBooking, setSelectedAddressIdForBooking] = useState<string | undefined>(undefined);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteAddressId, setDeleteAddressId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [deleteBookingId, setDeleteBookingId] = useState<string | null>(null);
  const [isDeletingBooking, setIsDeletingBooking] = useState(false);
  const [contractorProfiles, setContractorProfiles] = useState<Record<string, string>>({});
  const [alternativeSuggestions, setAlternativeSuggestions] = useState<Record<string, AlternativeSuggestion[]>>({});

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) {
        navigate("/auth");
      } else {
        setTimeout(() => {
          fetchUserData(session.user.id);
          checkAdminStatus(session.user.id);
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchUserData(session.user.id);
        checkAdminStatus(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchUserData = async (userId: string) => {
    const { data: addressData } = await supabase
      .from("addresses")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (addressData) {
      setAddresses(addressData);
    }

    const { data: bookingData } = await supabase
      .from("bookings")
      .select(
        `
        *,
        contractor:contractors(
          business_name,
          user_id
        )
      `,
      )
      .eq("user_id", userId)
      .order("scheduled_date", { ascending: false });

    if (bookingData) {
      setBookings(bookingData as Booking[]);

      // Fetch contractor profile names for bookings with contractors
      const contractorUserIds = bookingData.filter((b) => b.contractor?.user_id).map((b) => b.contractor!.user_id);

      if (contractorUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", contractorUserIds);

        if (profiles) {
          const profileMap: Record<string, string> = {};
          profiles.forEach((p) => {
            if (p.full_name) profileMap[p.user_id] = p.full_name;
          });
          setContractorProfiles(profileMap);
        }
      }

      // Fetch alternative suggestions for pending bookings
      const pendingBookingIds = bookingData.filter((b) => b.status === "pending" && !b.contractor_id).map((b) => b.id);

      if (pendingBookingIds.length > 0) {
        const { data: suggestionsData } = await supabase
          .from("alternative_suggestions")
          .select("*")
          .in("booking_id", pendingBookingIds)
          .eq("status", "pending");

        if (suggestionsData && suggestionsData.length > 0) {
          // Fetch contractor details for suggestions
          const suggestionContractorIds = [...new Set(suggestionsData.map((s) => s.contractor_id))];

          const { data: contractorDetails } = await supabase
            .from("contractors")
            .select("id, business_name, user_id")
            .in("id", suggestionContractorIds);

          const contractorMap = new Map(contractorDetails?.map((c) => [c.id, c]) || []);

          // Fetch profile names for contractors
          const suggContractorUserIds = contractorDetails?.map((c) => c.user_id) || [];
          const { data: suggProfiles } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", suggContractorUserIds);

          const profileNameMap = new Map(suggProfiles?.map((p) => [p.user_id, p.full_name]) || []);

          // Group suggestions by booking_id with contractor info
          const suggestionsMap: Record<string, AlternativeSuggestion[]> = {};
          suggestionsData.forEach((s) => {
            const contractor = contractorMap.get(s.contractor_id);
            const enrichedSuggestion: AlternativeSuggestion = {
              ...s,
              contractor: contractor
                ? {
                    business_name: contractor.business_name,
                    user_id: contractor.user_id,
                  }
                : undefined,
              contractor_profile: contractor
                ? {
                    full_name: profileNameMap.get(contractor.user_id) || null,
                  }
                : undefined,
            };

            if (!suggestionsMap[s.booking_id]) {
              suggestionsMap[s.booking_id] = [];
            }
            suggestionsMap[s.booking_id].push(enrichedSuggestion);
          });

          setAlternativeSuggestions(suggestionsMap);
        } else {
          setAlternativeSuggestions({});
        }
      } else {
        setAlternativeSuggestions({});
      }
    }
  };

  const checkAdminStatus = async (userId: string) => {
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");

    setIsAdmin(roles && roles.length > 0);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate("/");
  };

  const handleTabChange = (tab: "overview" | "bookings") => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const openAddressDialog = () => {
    setAddressDialogOpen(true);
    setSidebarOpen(false);
  };

  const handleAddressAdded = () => {
    if (user) {
      fetchUserData(user.id);
    }
  };

  const openBookingDialog = (addressId?: string) => {
    setSelectedAddressIdForBooking(addressId);
    setBookingDialogOpen(true);
  };

  const handleBookingSuccess = () => {
    if (user) {
      fetchUserData(user.id);
    }
  };

  const handleDeleteAddress = async () => {
    if (!deleteAddressId) return;

    setIsDeleting(true);
    try {
      // Check if there are any bookings for this address
      const { data: addressBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("address_id", deleteAddressId)
        .limit(1);

      if (addressBookings && addressBookings.length > 0) {
        toast.error("Cannot delete address with existing bookings");
        setDeleteAddressId(null);
        setIsDeleting(false);
        return;
      }

      const { error } = await supabase.from("addresses").delete().eq("id", deleteAddressId);

      if (error) throw error;

      toast.success("Address deleted successfully");
      setAddresses(addresses.filter((a) => a.id !== deleteAddressId));
    } catch (error) {
      console.error("Error deleting address:", error);
      toast.error("Failed to delete address");
    } finally {
      setDeleteAddressId(null);
      setIsDeleting(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!deleteBookingId) return;

    setIsDeletingBooking(true);
    try {
      const { error } = await supabase.from("bookings").delete().eq("id", deleteBookingId);

      if (error) throw error;

      toast.success("Booking deleted successfully");
      setBookings(bookings.filter((b) => b.id !== deleteBookingId));
    } catch (error) {
      console.error("Error deleting booking:", error);
      toast.error("Failed to delete booking");
    } finally {
      setDeleteBookingId(null);
      setIsDeletingBooking(false);
    }
  };

  const handlePriceApproval = async (bookingId: string, approved: boolean) => {
    try {
      if (approved) {
        // Approve price change - trigger payment setup
        const { data, error } = await supabase.functions.invoke("approve-price-change", {
          body: { bookingId },
        });

        if (error) throw error;
        toast.success("Price approved! Your booking is now being processed.");
      } else {
        // Cancel booking
        const { error } = await supabase
          .from("bookings")
          .update({ status: "cancelled" as any })
          .eq("id", bookingId);

        if (error) throw error;
        toast.success("Booking cancelled.");
      }

      if (user) fetchUserData(user.id);
    } catch (error) {
      console.error("Error handling price approval:", error);
      toast.error("Something went wrong. Please try again.");
    }
  };

  const handleEditBooking = (booking: Booking) => {
    setEditingBooking(booking);
    setBookingDialogOpen(true);
  };

  const canModifyBooking = (booking: Booking): boolean => {
    // Can edit/delete if no contractor has been assigned yet
    return !booking.contractor_id && booking.status !== "completed" && booking.status !== "cancelled";
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      pending_address_verification: { variant: "secondary", label: "Awaiting Verification" },
      price_change_pending: { variant: "secondary", label: "Price Change - Review" },
      verified: { variant: "default", label: "Verified" },
      rejected: { variant: "destructive", label: "Rejected" },
      confirmed: { variant: "default", label: "Confirmed" },
      completed: { variant: "outline", label: "Completed" },
      completed_pending_verification: { variant: "secondary", label: "Awaiting Review" },
      completed_with_issues: { variant: "secondary", label: "Issues Reported" },
      disputed: { variant: "destructive", label: "Disputed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const { variant, label } = config[status] || { variant: "secondary", label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getSlopeLabel = (slope: string) => {
    const labels: Record<string, string> = {
      flat: "Flat",
      mild: "Mild slope",
      steep: "Steep slope",
    };
    return labels[slope] || slope;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl gradient-hero animate-pulse" />
      </div>
    );
  }

  const userName = user?.user_metadata?.full_name || "there";
  const verifiedAddresses = addresses.filter((a) => a.status === "verified");
  const pendingAddresses = addresses.filter((a) => a.status === "pending");
  const upcomingBookings = bookings.filter((b) => b.status === "pending" || b.status === "confirmed" || b.status === "pending_address_verification" || b.status === "price_change_pending");
  const completedBookings = bookings.filter((b) => b.status === "completed" || b.status === "completed_pending_verification" || b.status === "post_payment_dispute");

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
            <Leaf className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-display font-bold text-foreground">Lawnly</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-card border-r border-border p-6 flex flex-col z-50 transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 mt-12 md:mt-0">
          <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-soft">
            <Leaf className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-display font-bold text-foreground">Lawnly</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          <button
            onClick={() => handleTabChange("overview")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
              activeTab === "overview"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="font-medium">Overview</span>
          </button>
          <button
            onClick={() => handleTabChange("bookings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
              activeTab === "bookings"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="font-medium">My Bookings</span>
          </button>
        </nav>

        {/* Bottom Actions */}
        <div className="space-y-2 pt-4 border-t border-border">
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:ml-64 p-4 md:p-8 pt-20 md:pt-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Welcome back, {userName}!</h1>
            <p className="text-muted-foreground text-sm md:text-base">Manage your lawn care services</p>
          </div>
          <div className="flex items-center gap-3">
            {user && <NotificationsPopover userId={user.id} />}
          </div>
        </header>

        {activeTab === "overview" && (
          <div className="space-y-6 md:space-y-8">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              <div className="bg-card rounded-2xl p-5 md:p-6 shadow-soft">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">{verifiedAddresses.length}</p>
                    <p className="text-sm text-muted-foreground">Verified Addresses</p>
                  </div>
                </div>
              </div>
              <div className="bg-card rounded-2xl p-5 md:p-6 shadow-soft">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">{upcomingBookings.length}</p>
                    <p className="text-sm text-muted-foreground">Upcoming Bookings</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setCompletedServicesDialogOpen(true)}
                className="bg-card rounded-2xl p-5 md:p-6 shadow-soft sm:col-span-2 lg:col-span-1 hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer text-left w-full"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-grass-light/50 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-grass-dark" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">{completedBookings.length}</p>
                    <p className="text-sm text-muted-foreground">Completed Services</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Getting Started (only if no addresses) */}
            {addresses.length === 0 && (
              <div className="bg-card rounded-2xl p-6 md:p-8 shadow-soft">
                <h2 className="font-display text-lg md:text-xl font-bold text-foreground mb-6">Getting Started</h2>
                <div className="space-y-4">
                  <button
                    onClick={openAddressDialog}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 transition-colors cursor-pointer group text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="font-display font-bold text-primary">1</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">Add Your Address</h3>
                      <p className="text-sm text-muted-foreground">Add your property address for verification</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-border opacity-50">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <span className="font-display font-bold text-muted-foreground">2</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">Wait for Verification</h3>
                      <p className="text-sm text-muted-foreground">We'll verify your property size and set pricing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-border opacity-50">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <span className="font-display font-bold text-muted-foreground">3</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">Book Your First Mow</h3>
                      <p className="text-sm text-muted-foreground">Schedule your lawn service at your convenience</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming Mows Section */}
            {upcomingBookings.length > 0 && (
              <div className="bg-card rounded-2xl p-6 md:p-8 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg md:text-xl font-bold text-foreground">Upcoming Mows</h2>
                  <Button variant="ghost" size="sm" onClick={() => handleTabChange("bookings")}>
                    View all
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <div className="space-y-3">
                  {upcomingBookings.slice(0, 3).map((booking) => {
                    const address = addresses.find((a) => a.id === booking.address_id);
                    const suggestions = alternativeSuggestions[booking.id] || [];
                    return (
                      <div key={booking.id} className="p-4 rounded-xl border border-border">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                              <Calendar className="w-5 h-5 text-accent-foreground" />
                            </div>
                            <div>
                              <p className="font-medium">
                                {new Date(booking.scheduled_date).toLocaleDateString("en-AU", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                })}
                                {booking.time_slot && ` • ${booking.time_slot}`}
                              </p>
                              {address && (
                                <p className="text-sm text-muted-foreground">
                                  {address.street_address}, {address.city}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(booking.status)}
                            {canModifyBooking(booking) && (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => handleEditBooking(booking)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteBookingId(booking.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {suggestions.length > 0 && (
                          <AlternativeSuggestionsCard
                            suggestions={suggestions}
                            bookingId={booking.id}
                            onSuggestionResponse={() => user && fetchUserData(user.id)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Addresses Section */}
            {addresses.length > 0 && (
              <div className="bg-card rounded-2xl p-6 md:p-8 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg md:text-xl font-bold text-foreground">My Addresses</h2>
                  <Button size="sm" onClick={openAddressDialog}>
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">Add Address</span>
                  </Button>
                </div>
                <div className="space-y-4">
                  {addresses.map((address) => (
                    <div key={address.id} className="p-4 rounded-xl border border-border">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-foreground">{address.street_address}</h3>
                              {getStatusBadge(address.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {address.city}, {address.state} {address.postal_code}
                            </p>
                            <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                              <span>Slope: {getSlopeLabel(address.slope)}</span>
                              <span>•</span>
                              <span>Tiers: {address.tier_count}</span>
                              {address.square_meters && (
                                <>
                                  <span>•</span>
                                  <span>{address.square_meters} m²</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(address.status === "verified" || address.status === "pending") && (
                            <Button size="sm" onClick={() => openBookingDialog(address.id)}>
                              <Calendar className="w-4 h-4" />
                              <span className="hidden sm:inline ml-1">Book Now</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteAddressId(address.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "bookings" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg md:text-xl font-bold text-foreground">My Bookings</h2>
              <Button size="sm" disabled={addresses.filter(a => a.status === "verified" || a.status === "pending").length === 0} onClick={() => openBookingDialog()}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Booking</span>
              </Button>
            </div>

            {bookings.length === 0 ? (
              <div className="bg-card rounded-2xl p-8 md:p-12 shadow-soft text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                  <Calendar className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-display text-lg md:text-xl font-semibold text-foreground mb-2">No bookings yet</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm md:text-base">
                  {verifiedAddresses.length > 0
                    ? "You have verified addresses ready for booking. Schedule your first lawn care service!"
                    : "Once you have a verified address, you can book lawn care services. Add an address first to get started."}
                </p>
                {verifiedAddresses.length > 0 ? (
                  <Button onClick={() => openBookingDialog(verifiedAddresses[0].id)}>
                    <Calendar className="w-4 h-4" />
                    Book Your First Service
                  </Button>
                ) : (
                  <Button variant="outline" onClick={openAddressDialog}>
                    <MapPin className="w-4 h-4" />
                    Add an Address First
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {bookings.map((booking) => {
                  const address = addresses.find((a) => a.id === booking.address_id);
                  const suggestions = alternativeSuggestions[booking.id] || [];
                  return (
                    <div key={booking.id} className="bg-card rounded-2xl p-6 shadow-soft">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-6 h-6 text-accent-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-foreground">
                                {new Date(booking.scheduled_date).toLocaleDateString("en-AU", {
                                  weekday: "long",
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </h3>
                              {getStatusBadge(booking.status)}
                            </div>
                            {address && (
                              <p className="text-sm text-muted-foreground">
                                {address.street_address}, {address.city}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              {booking.total_price && (
                                <p className="text-sm font-medium text-primary">Total: ${booking.total_price}</p>
                              )}
                              {booking.time_slot && (
                                <p className="text-sm text-muted-foreground">• {booking.time_slot}</p>
                              )}
                            </div>
                            {booking.contractor_id && booking.contractor && (
                              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                <span className="font-medium">
                                  {booking.status === "completed" ? "Completed by:" : "Assigned to:"}
                                </span>
                                {booking.contractor.business_name ||
                                  contractorProfiles[booking.contractor.user_id] ||
                                  "Contractor"}
                              </p>
                            )}
                          </div>
                        </div>
                      {canModifyBooking(booking) && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditBooking(booking)}>
                              <Pencil className="w-4 h-4" />
                              <span className="hidden sm:inline ml-1">Edit</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteBookingId(booking.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                        {booking.status === "price_change_pending" && (
                          <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">Price Updated - Action Required</p>
                            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                              Original: ${Number(booking.original_price || 0).toFixed(2)} → New: ${Number(booking.total_price || 0).toFixed(2)}
                            </p>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handlePriceApproval(booking.id, true)}>
                                Approve New Price
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handlePriceApproval(booking.id, false)}>
                                Cancel Booking
                              </Button>
                            </div>
                          </div>
                        )}
                        {booking.status === "completed_pending_verification" && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => navigate(`/customer/bookings/${booking.id}/verify`)}
                          >
                            Review Job
                          </Button>
                        )}
                        {booking.status === "completed" && booking.completed_at && (() => {
                          const completedAt = new Date(booking.completed_at).getTime();
                          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
                          const withinWindow = Date.now() - completedAt < sevenDaysMs;
                          return withinWindow;
                        })() && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-950/30"
                            onClick={() => navigate(`/customer/bookings/${booking.id}/verify`)}
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Report Issue
                          </Button>
                        )}
                      </div>
                      {suggestions.length > 0 && (
                        <AlternativeSuggestionsCard
                          suggestions={suggestions}
                          bookingId={booking.id}
                          onSuggestionResponse={() => user && fetchUserData(user.id)}
                        />
                      )}
                      {(booking.status === "completed_pending_verification" || booking.status === "completed" || booking.status === "post_payment_dispute") && (
                        <JobPhotosGallery bookingId={booking.id} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Address Dialog */}
      <AddAddressDialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen} onSuccess={handleAddressAdded} />

      {/* Booking Dialog */}
      <BookingDialog
        open={bookingDialogOpen}
        onOpenChange={(open) => {
          setBookingDialogOpen(open);
          if (!open) setEditingBooking(null);
        }}
        addresses={addresses}
        defaultAddressId={selectedAddressIdForBooking}
        onSuccess={handleBookingSuccess}
        onAddressAdded={handleAddressAdded}
        editingBooking={editingBooking}
      />

      {/* Completed Services Dialog */}
      {user && (
        <CompletedServicesDialog
          open={completedServicesDialogOpen}
          onOpenChange={setCompletedServicesDialogOpen}
          userId={user.id}
        />
      )}

      {/* Delete Address Confirmation Dialog */}
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

      {/* Delete Booking Confirmation Dialog */}
      <AlertDialog open={!!deleteBookingId} onOpenChange={(open) => !open && setDeleteBookingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this booking? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingBooking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBooking}
              disabled={isDeletingBooking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingBooking ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
