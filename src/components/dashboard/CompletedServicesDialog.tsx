import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, Calendar, MapPin, Loader2, User } from "lucide-react";
import { format } from "date-fns";

interface CompletedBooking {
  id: string;
  scheduled_date: string;
  total_price: number | null;
  contractor_id: string | null;
  address: {
    street_address: string;
    city: string;
  } | null;
  contractor: {
    id: string;
    business_name: string | null;
    user_id: string;
    profile?: {
      full_name: string | null;
    };
  } | null;
}

interface CompletedServicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

const CompletedServicesDialog = ({ open, onOpenChange, userId }: CompletedServicesDialogProps) => {
  const [completedBookings, setCompletedBookings] = useState<CompletedBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, userId]);

  const fetchData = async () => {
    setLoading(true);
    
    const { data: bookingsData } = await supabase
      .from("bookings")
      .select(`id, scheduled_date, total_price, contractor_id, address_id`)
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("scheduled_date", { ascending: false });

    if (bookingsData) {
      const addressIds = [...new Set(bookingsData.map(b => b.address_id))];
      const contractorIds = [...new Set(bookingsData.filter(b => b.contractor_id).map(b => b.contractor_id!))] as string[];

      const [addressesResult, contractorsResult, profilesResult] = await Promise.all([
        supabase.from("addresses").select("id, street_address, city").in("id", addressIds),
        contractorIds.length > 0 
          ? supabase.from("contractors").select("id, business_name, user_id").in("id", contractorIds)
          : Promise.resolve({ data: [] as { id: string; business_name: string | null; user_id: string }[] }),
        contractorIds.length > 0
          ? supabase.from("profiles").select("user_id, full_name")
          : Promise.resolve({ data: [] as { user_id: string; full_name: string | null }[] })
      ]);

      const addressMap = new Map<string, { id: string; street_address: string; city: string }>();
      addressesResult.data?.forEach(a => addressMap.set(a.id, a));
      
      const contractorMap = new Map<string, { id: string; business_name: string | null; user_id: string }>();
      contractorsResult.data?.forEach(c => contractorMap.set(c.id, c));
      
      const profileMap = new Map<string, { user_id: string; full_name: string | null }>();
      profilesResult.data?.forEach(p => profileMap.set(p.user_id, p));

      const enrichedBookings: CompletedBooking[] = bookingsData.map(booking => {
        const contractor = booking.contractor_id ? contractorMap.get(booking.contractor_id) : null;
        return {
          id: booking.id,
          scheduled_date: booking.scheduled_date,
          total_price: booking.total_price,
          contractor_id: booking.contractor_id,
          address: addressMap.get(booking.address_id) || null,
          contractor: contractor ? {
            id: contractor.id,
            business_name: contractor.business_name,
            user_id: contractor.user_id,
            profile: profileMap.get(contractor.user_id)
          } : null
        };
      });

      setCompletedBookings(enrichedBookings);
    }

    setLoading(false);
  };

  const getContractorName = (contractor: CompletedBooking["contractor"]) => {
    if (!contractor) return "Unknown Contractor";
    return contractor.business_name || contractor.profile?.full_name || "Contractor";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-primary" />
            Completed Services
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : completedBookings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No completed services yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {completedBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-card border rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(booking.scheduled_date), "EEEE, MMMM d, yyyy")}
                      </div>
                      {booking.address && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="w-4 h-4" />
                          {booking.address.street_address}, {booking.address.city}
                        </div>
                      )}
                      {booking.contractor && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{getContractorName(booking.contractor)}</span>
                        </div>
                      )}
                    </div>
                    {booking.total_price && (
                      <span className="font-semibold text-primary">
                        ${booking.total_price.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CompletedServicesDialog;
