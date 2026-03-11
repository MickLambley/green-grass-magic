import { useState } from "react";
import { Plus, Users, Calendar, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileFABProps {
  onNavigate: (tab: string) => void;
}

const MobileFAB = ({ onNavigate }: MobileFABProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    { key: "jobs", label: "New Job", icon: Calendar },
    { key: "clients", label: "New Client", icon: Users },
    { key: "invoices", label: "New Invoice", icon: Receipt },
  ];

  const handleAction = (key: string) => {
    setIsOpen(false);
    onNavigate(key);
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 md:hidden flex flex-col items-end gap-2">
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="relative z-50 flex flex-col items-end gap-2 mb-2">
            {actions.map((action) => (
              <button
                key={action.key}
                onClick={() => handleAction(action.key)}
                className="flex items-center gap-2 bg-card border border-border rounded-full shadow-medium pl-4 pr-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                {action.label}
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <action.icon className="w-4 h-4 text-primary" />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full shadow-large relative z-50"
        size="icon"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </Button>
    </div>
  );
};

export default MobileFAB;
