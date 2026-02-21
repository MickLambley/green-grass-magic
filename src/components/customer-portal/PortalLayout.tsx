import { useState, useEffect, ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Leaf, Home, Calendar, LogOut, ExternalLink, Menu, X, Bell, AlertCircle } from "lucide-react";
import NotificationsPopover from "@/components/dashboard/NotificationsPopover";

export interface ContractorBrand {
  id: string;
  business_name: string;
  business_logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
}

interface PortalLayoutProps {
  contractor: ContractorBrand;
  user: User;
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
}

export const PortalLayout = ({ contractor, user, activeTab, onTabChange, children }: PortalLayoutProps) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const brandName = contractor.business_name || "Lawn Care Pro";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate(`/site/${slug}`);
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "jobs", label: "My Jobs", icon: Calendar },
    { id: "disputes", label: "Issues", icon: AlertCircle },
  ];

  const userName = user.user_metadata?.full_name || "there";

  // Dynamic branding CSS vars
  const brandStyle = {
    "--brand-primary": contractor.primary_color,
    "--brand-secondary": contractor.secondary_color,
    "--brand-accent": contractor.accent_color,
  } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-background" style={brandStyle}>
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {contractor.business_logo_url ? (
            <img src={contractor.business_logo_url} alt={brandName} className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: contractor.primary_color }}>
              <Leaf className="w-4 h-4 text-white" />
            </div>
          )}
          <span className="text-lg font-display font-bold text-foreground">{brandName}</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-muted transition-colors">
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-full w-64 bg-card border-r border-border p-6 flex flex-col z-50 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div className="flex items-center gap-2 mb-8 mt-12 md:mt-0">
          {contractor.business_logo_url ? (
            <img src={contractor.business_logo_url} alt={brandName} className="w-10 h-10 rounded-xl object-cover shadow-sm" />
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ backgroundColor: contractor.primary_color }}>
              <Leaf className="w-5 h-5 text-white" />
            </div>
          )}
          <span className="text-xl font-display font-bold text-foreground">{brandName}</span>
        </div>

        <nav className="flex-1 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { onTabChange(tab.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                activeTab === tab.id
                  ? "text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              style={activeTab === tab.id ? { backgroundColor: contractor.primary_color } : undefined}
            >
              <tab.icon className="w-5 h-5" />
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="space-y-2 pt-4 border-t border-border">
          <button
            onClick={() => navigate(`/site/${slug}`)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            <span className="font-medium">Back to website</span>
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
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Welcome back, {userName}!</h1>
            <p className="text-muted-foreground text-sm md:text-base">Manage your services with {brandName}</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsPopover userId={user.id} />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
};

export default PortalLayout;
