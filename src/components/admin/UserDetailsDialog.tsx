import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { UserCheck, UserX, Ban, Trash2, Clock, Star, Briefcase, AlertTriangle } from "lucide-react";

interface UserDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; email: string; fullName: string | null; userType: string; status: string } | null;
  onStatusChange: (userId: string, newStatus: string, userType: string) => void;
}

interface UserDetails {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  roles: string[];
  joinedAt: string;
  lastSignIn: string | null;
  contractor: any;
  activity: { totalBookings: number; completedBookings: number; disputes: number };
  audit: AuditEntry[];
}

interface AuditEntry {
  id: string;
  previous_status: string;
  new_status: string;
  changed_by_email: string;
  reason: string | null;
  created_at: string;
}

const UserDetailsDialog = ({ open, onOpenChange, user, onStatusChange }: UserDetailsDialogProps) => {
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchDetails();
    } else {
      setDetails(null);
    }
  }, [open, user?.id]);

  const fetchDetails = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "get_user_details", userId: user.id },
      });
      setDetails(data?.user || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatStatus = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : details ? (
          <div className="space-y-6">
            {/* User Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{details.fullName || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{details.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{details.phone || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Roles</p>
                <div className="flex gap-1">
                  {details.roles.map((r) => (
                    <Badge key={r} variant="outline">{r}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Joined</p>
                <p className="font-medium">{new Date(details.joinedAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Sign In</p>
                <p className="font-medium">
                  {details.lastSignIn ? new Date(details.lastSignIn).toLocaleDateString() : "Never"}
                </p>
              </div>
            </div>

            {/* Activity Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Activity Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <Briefcase className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{details.activity.totalBookings}</p>
                    <p className="text-xs text-muted-foreground">Total Bookings</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <Star className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{details.activity.completedBookings}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{details.activity.disputes}</p>
                    <p className="text-xs text-muted-foreground">Disputes</p>
                  </div>
                </div>
                {details.contractor && (
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-2xl font-bold">{details.contractor.completed_jobs_count}</p>
                      <p className="text-xs text-muted-foreground">Jobs Completed</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-2xl font-bold">
                        {details.contractor.average_rating ? Number(details.contractor.average_rating).toFixed(1) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Avg Rating</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-2xl font-bold">${Number(details.contractor.total_revenue || 0).toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status History */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Status History</CardTitle>
              </CardHeader>
              <CardContent>
                {details.audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No status changes recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {details.audit.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 p-3 border rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{formatStatus(entry.previous_status)}</Badge>
                            <span className="text-xs text-muted-foreground">→</span>
                            <Badge variant="secondary" className="text-xs">{formatStatus(entry.new_status)}</Badge>
                          </div>
                          {entry.reason && (
                            <p className="text-sm text-muted-foreground mt-1">{entry.reason}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            by {entry.changed_by_email} • {new Date(entry.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Separator />
            <div className="flex gap-2 flex-wrap">
              {user.status !== "active" && (
                <Button size="sm" onClick={() => { onOpenChange(false); onStatusChange(user.id, "active", user.userType); }}>
                  <UserCheck className="w-4 h-4 mr-1" /> Set Active
                </Button>
              )}
              {user.userType === "contractor" && user.status !== "pending_approval" && (
                <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); onStatusChange(user.id, "pending_approval", user.userType); }}>
                  <Clock className="w-4 h-4 mr-1" /> Set Pending
                </Button>
              )}
              {user.status !== "suspended" && (
                <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); onStatusChange(user.id, "suspended", user.userType); }}>
                  <Ban className="w-4 h-4 mr-1" /> Suspend
                </Button>
              )}
              {user.userType === "contractor" && user.status !== "declined" && (
                <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); onStatusChange(user.id, "declined", user.userType); }}>
                  <UserX className="w-4 h-4 mr-1" /> Decline
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={() => { onOpenChange(false); onStatusChange(user.id, "deleted", user.userType); }}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">Failed to load user details.</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserDetailsDialog;
