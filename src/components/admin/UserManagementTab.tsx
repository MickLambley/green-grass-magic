import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Search, MoreHorizontal, Eye, UserCheck, UserX, Ban, Trash2, Clock } from "lucide-react";
import UserDetailsDialog from "./UserDetailsDialog";
import StatusChangeDialog from "./StatusChangeDialog";

interface ManagedUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  userType: "customer" | "contractor" | "admin";
  status: string;
  roles: string[];
  joinedAt: string;
  lastSignIn: string | null;
  contractor: any;
}

const UserManagementTab = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [statusChangeOpen, setStatusChangeOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ userId: string; newStatus: string; userType: string } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "list" },
      });
      if (error) throw error;
      setUsers(data.users || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (userId: string, newStatus: string, userType: string) => {
    setPendingAction({ userId, newStatus, userType });
    setStatusChangeOpen(true);
  };

  const confirmStatusChange = async (reason: string) => {
    if (!pendingAction) return;

    try {
      const action = pendingAction.newStatus === "deleted" ? "delete_user" : "change_status";
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: {
          action,
          userId: pendingAction.userId,
          newStatus: pendingAction.newStatus,
          reason,
          userType: pendingAction.userType,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({ title: "Success", description: `User status updated to ${pendingAction.newStatus}.` });
      setStatusChangeOpen(false);
      setPendingAction(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !search ||
      u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || u.userType === typeFilter;
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: "Active" },
      pending_approval: { variant: "secondary", label: "Pending Approval" },
      suspended: { variant: "destructive", label: "Suspended" },
      declined: { variant: "outline", label: "Declined" },
    };
    const c = config[status] || { variant: "secondary" as const, label: status };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const config: Record<string, string> = {
      admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      contractor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      customer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config[type] || ""}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const getStatusActions = (user: ManagedUser) => {
    const actions: { label: string; status: string; icon: any; destructive?: boolean }[] = [];

    if (user.userType === "contractor") {
      if (user.status !== "active") actions.push({ label: "Set Active", status: "active", icon: UserCheck });
      if (user.status !== "pending_approval") actions.push({ label: "Set Pending Approval", status: "pending_approval", icon: Clock });
      if (user.status !== "suspended") actions.push({ label: "Suspend", status: "suspended", icon: Ban });
      if (user.status !== "declined") actions.push({ label: "Decline", status: "declined", icon: UserX });
    } else {
      if (user.status !== "active") actions.push({ label: "Set Active", status: "active", icon: UserCheck });
      if (user.status !== "suspended") actions.push({ label: "Suspend", status: "suspended", icon: Ban });
    }

    actions.push({ label: "Delete User", status: "deleted", icon: Trash2, destructive: true });
    return actions;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="User Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="customer">Customers</SelectItem>
              <SelectItem value="contractor">Contractors</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No users match the current filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>{getTypeBadge(user.userType)}</TableCell>
                  <TableCell>{getStatusBadge(user.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(user.joinedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.lastSignIn ? new Date(user.lastSignIn).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedUser(user); setDetailsOpen(true); }}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {getStatusActions(user).map((action) => (
                          <DropdownMenuItem
                            key={action.status}
                            onClick={() => handleStatusChange(user.id, action.status, user.userType)}
                            className={action.destructive ? "text-destructive focus:text-destructive" : ""}
                          >
                            <action.icon className="w-4 h-4 mr-2" />
                            {action.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <UserDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        user={selectedUser}
        onStatusChange={handleStatusChange}
      />

      <StatusChangeDialog
        open={statusChangeOpen}
        onOpenChange={setStatusChangeOpen}
        pendingAction={pendingAction}
        onConfirm={confirmStatusChange}
      />
    </Card>
  );
};

export default UserManagementTab;
