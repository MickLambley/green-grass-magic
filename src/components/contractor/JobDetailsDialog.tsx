import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  Phone, 
  User, 
  Ruler, 
  Trash2, 
  Check, 
  X, 
  ImageOff,
  Calendar,
  Clock,
  Loader2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Database } from "@/integrations/supabase/types";
import { getLawnImageSignedUrl } from "@/lib/storage";

type Address = Database["public"]["Tables"]["addresses"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface BookingWithDetails extends Partial<Booking> {
  id: string;
  status: Booking["status"];
  scheduled_date: string;
  time_slot: string;
  clippings_removal: boolean;
  grass_length: string;
  total_price: number | null;
  notes: string | null;
  address?: Address;
  customerProfile?: Profile;
}

interface JobDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: BookingWithDetails | null;
  showContactInfo?: boolean;
}

const timeSlots: Record<string, string> = {
  "7am-10am": "7:00 AM - 10:00 AM",
  "10am-2pm": "10:00 AM - 2:00 PM",
  "2pm-5pm": "2:00 PM - 5:00 PM",
};

const JobDetailsDialog = ({ 
  open, 
  onOpenChange, 
  job,
  showContactInfo = false 
}: JobDetailsDialogProps) => {
  const [lawnImageUrl, setLawnImageUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);

  useEffect(() => {
    if (open && job?.address?.lawn_image_url) {
      setLoadingImage(true);
      getLawnImageSignedUrl(job.address.lawn_image_url)
        .then(setLawnImageUrl)
        .finally(() => setLoadingImage(false));
    } else {
      setLawnImageUrl(null);
    }
  }, [open, job?.address?.lawn_image_url]);

  if (!job) return null;

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      confirmed: { variant: "default", label: "Confirmed" },
      completed: { variant: "outline", label: "Completed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const { variant, label } = config[status] || { variant: "secondary", label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display">Job Details</DialogTitle>
            {getStatusBadge(job.status)}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer Info - Only shown for accepted jobs */}
          {showContactInfo && job.customerProfile && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4" />
                Customer
              </h4>
              <p className="text-sm font-medium">
                {job.customerProfile.full_name || "Customer"}
              </p>
              {job.customerProfile.phone && (
                <a 
                  href={`tel:${job.customerProfile.phone}`}
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" />
                  {job.customerProfile.phone}
                </a>
              )}
            </div>
          )}

          {/* Address */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Address
            </h4>
            <p className="text-sm">
              {job.address?.street_address}<br />
              {job.address?.city}, {job.address?.state} {job.address?.postal_code}
            </p>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date
              </h4>
              <p className="text-sm">
                {new Date(job.scheduled_date).toLocaleDateString("en-AU", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric"
                })}
              </p>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time Slot
              </h4>
              <p className="text-sm">
                {timeSlots[job.time_slot] || job.time_slot}
              </p>
            </div>
          </div>

          {/* Lawn Image */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Lawn Area Map</h4>
            {loadingImage ? (
              <div className="rounded-lg border p-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : lawnImageUrl ? (
              <div className="rounded-lg overflow-hidden border">
                <img 
                  src={lawnImageUrl} 
                  alt="Lawn area" 
                  className="w-full h-48 object-cover"
                />
              </div>
            ) : (
              <Alert variant="destructive">
                <ImageOff className="h-4 w-4" />
                <AlertDescription>
                  No lawn image available for this property.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Job Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Ruler className="w-4 h-4" />
                Lawn Area
              </h4>
              <p className="text-sm">
                {job.address?.square_meters ? `${job.address.square_meters} m²` : "Not specified"}
              </p>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Clippings Removal
              </h4>
              <p className="text-sm flex items-center gap-1">
                {job.clippings_removal ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    Yes
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 text-muted-foreground" />
                    No
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Additional Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">Grass Length</h4>
              <p className="text-sm capitalize">{job.grass_length}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">Slope</h4>
              <p className="text-sm capitalize">{job.address?.slope || "Not specified"}</p>
            </div>
          </div>

          {/* Price */}
          {job.total_price && (
            <div className="pt-2 border-t">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total Price</span>
                <span className="text-xl font-bold text-primary">
                  ${Number(job.total_price).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          {job.notes && (
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">Customer Notes</h4>
              <p className="text-sm text-muted-foreground">{job.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JobDetailsDialog;
