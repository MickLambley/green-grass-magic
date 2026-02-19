import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, FileText, DollarSign, Loader2 } from "lucide-react";

interface DashboardOverviewProps {
  contractorId: string;
}

const DashboardOverview = ({ contractorId }: DashboardOverviewProps) => {
  const [stats, setStats] = useState({
    clientCount: 0,
    scheduledJobs: 0,
    unpaidInvoices: 0,
    revenue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [contractorId]);

  const fetchStats = async () => {
    const [clientsRes, jobsRes, invoicesRes, paidRes] = await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).eq("status", "scheduled"),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("contractor_id", contractorId).eq("status", "unpaid"),
      supabase.from("invoices").select("total").eq("contractor_id", contractorId).eq("status", "paid"),
    ]);

    const revenue = (paidRes.data || []).reduce((sum, inv) => sum + Number(inv.total), 0);

    setStats({
      clientCount: clientsRes.count || 0,
      scheduledJobs: jobsRes.count || 0,
      unpaidInvoices: invoicesRes.count || 0,
      revenue,
    });
    setIsLoading(false);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const cards = [
    { title: "Clients", value: stats.clientCount, icon: Users, color: "text-primary" },
    { title: "Upcoming Jobs", value: stats.scheduledJobs, icon: Calendar, color: "text-sky" },
    { title: "Unpaid Invoices", value: stats.unpaidInvoices, icon: FileText, color: "text-sunshine" },
    { title: "Revenue (Paid)", value: `$${stats.revenue.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`w-12 h-12 rounded-xl bg-muted flex items-center justify-center ${card.color}`}>
                <card.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-display font-bold text-foreground">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Welcome to Yardly 👋</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This is your business dashboard. Use the tabs above to manage your clients, schedule jobs, 
            create quotes, and send invoices. Get started by adding your first client!
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardOverview;
