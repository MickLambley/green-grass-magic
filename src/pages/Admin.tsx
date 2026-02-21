import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Leaf, LogOut, Users, HardHat, UserCog, BarChart3 } from "lucide-react";
import ContractorApplicationsTab from "@/components/admin/ContractorApplicationsTab";
import UserManagementTab from "@/components/admin/UserManagementTab";
import AdminPlatformHealthCards from "@/components/admin/AdminPlatformHealthCards";

// Badge component for pending contractors
const PendingContractorsBadge = () => {
  const [count, setCount] = useState<number>(0);
  
  useEffect(() => {
    const fetchPendingCount = async () => {
      const { count: pendingCount } = await supabase
        .from("contractors")
        .select("*", { count: "exact", head: true })
        .eq("approval_status", "pending");
      
      setCount(pendingCount || 0);
    };
    
    fetchPendingCount();
  }, []);
  
  if (count === 0) return null;
  return <Badge variant="secondary" className="ml-1">{count}</Badge>;
};

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("health");

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      toast({
        title: "Access Denied",
        description: "You don't have admin privileges.",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    setIsAdmin(true);
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-foreground">Yardly</span>
              <Badge variant="outline" className="ml-2">Admin</Badge>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="health" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Platform Health
            </TabsTrigger>
            <TabsTrigger value="contractors" className="flex items-center gap-2">
              <HardHat className="w-4 h-4" />
              Contractors
              <PendingContractorsBadge />
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <UserCog className="w-4 h-4" />
              Users
            </TabsTrigger>
          </TabsList>

          <TabsContent value="health">
            <AdminPlatformHealthCards />
          </TabsContent>

          <TabsContent value="contractors">
            <ContractorApplicationsTab />
          </TabsContent>

          <TabsContent value="users">
            <UserManagementTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
