import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ImageIcon,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Flag,
  Clock,
  MapPin,
  Columns2,
} from "lucide-react";
import { toast } from "sonner";

interface Photo {
  id: string;
  photo_type: string;
  photo_url: string;
  uploaded_at: string;
  exif_timestamp: string | null;
  signedUrl?: string;
}

interface AdminBookingPhotosSectionProps {
  bookingId: string;
  contractorId: string | null;
}

const AdminBookingPhotosSection = ({
  bookingId,
  contractorId,
}: AdminBookingPhotosSectionProps) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [flagging, setFlagging] = useState(false);

  useEffect(() => {
    fetchPhotos();
  }, [bookingId]);

  const fetchPhotos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job_photos")
      .select("id, photo_type, photo_url, uploaded_at, exif_timestamp")
      .eq("booking_id", bookingId)
      .order("uploaded_at", { ascending: true });

    if (error || !data || data.length === 0) {
      setPhotos([]);
      setLoading(false);
      return;
    }

    const withUrls = await Promise.all(
      data.map(async (photo) => {
        const { data: signedData } = await supabase.storage
          .from("job-photos")
          .createSignedUrl(photo.photo_url, 3600);
        return { ...photo, signedUrl: signedData?.signedUrl || "" };
      })
    );

    setPhotos(withUrls);
    setLoading(false);
  };

  const beforePhotos = photos.filter((p) => p.photo_type === "before");
  const afterPhotos = photos.filter((p) => p.photo_type === "after");

  const openLightbox = (photo: Photo) => {
    const all = [...beforePhotos, ...afterPhotos];
    setAllPhotos(all);
    setLightboxIndex(all.findIndex((p) => p.id === photo.id));
    setLightboxOpen(true);
  };

  const navigateLightbox = (direction: number) => {
    setLightboxIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return allPhotos.length - 1;
      if (next >= allPhotos.length) return 0;
      return next;
    });
  };

  const handleFlagPhotos = async () => {
    if (!contractorId) return;
    setFlagging(true);
    try {
      // Find the contractor's user_id to send notification
      const { data: contractor } = await supabase
        .from("contractors")
        .select("user_id")
        .eq("id", contractorId)
        .single();

      if (contractor) {
        await supabase.from("notifications").insert({
          user_id: contractor.user_id,
          title: "Photo Re-upload Required",
          message:
            "An admin has flagged the photos for this job as insufficient quality. Please re-upload clearer before and after photos.",
          type: "warning",
          booking_id: bookingId,
        });
        toast.success("Contractor notified to re-upload photos.");
      }
    } catch {
      toast.error("Failed to send flag notification.");
    } finally {
      setFlagging(false);
    }
  };

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        No job photos uploaded yet.
      </div>
    );
  }

  const PhotoThumbnail = ({ photo }: { photo: Photo }) => (
    <div className="space-y-1">
      <button
        onClick={() => openLightbox(photo)}
        className="aspect-square rounded-lg overflow-hidden border border-border hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer w-full"
      >
        <img
          src={photo.signedUrl}
          alt={`${photo.photo_type} photo`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>
      <div className="text-[10px] text-muted-foreground space-y-0.5 px-0.5">
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{formatTimestamp(photo.uploaded_at)}</span>
        </div>
        {photo.exif_timestamp && (
          <div className="flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">
              EXIF: {formatTimestamp(photo.exif_timestamp)}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const PhotoGrid = ({
    items,
    label,
  }: {
    items: Photo[];
    label: string;
  }) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <ImageIcon className="w-4 h-4" />
        {label} ({items.length})
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {items.map((photo) => (
          <PhotoThumbnail key={photo.id} photo={photo} />
        ))}
      </div>
    </div>
  );

  const pairCount = Math.max(beforePhotos.length, afterPhotos.length);

  return (
    <>
      <div className="space-y-4 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Job Photos</h3>
          <div className="flex gap-2">
            <Button
              variant={comparisonMode ? "default" : "outline"}
              size="sm"
              onClick={() => setComparisonMode(!comparisonMode)}
              disabled={beforePhotos.length === 0 || afterPhotos.length === 0}
            >
              <Columns2 className="w-3.5 h-3.5 mr-1" />
              Compare
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFlagPhotos}
              disabled={flagging || !contractorId}
              className="text-destructive hover:text-destructive"
            >
              <Flag className="w-3.5 h-3.5 mr-1" />
              {flagging ? "Flagging..." : "Flag Photos"}
            </Button>
          </div>
        </div>

        {comparisonMode ? (
          /* Side-by-side comparison */
          <div className="space-y-3">
            {Array.from({ length: pairCount }).map((_, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  {i === 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      Before
                    </Badge>
                  )}
                  {beforePhotos[i] ? (
                    <button
                      onClick={() => openLightbox(beforePhotos[i])}
                      className="aspect-[4/3] rounded-lg overflow-hidden border border-border hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer w-full"
                    >
                      <img
                        src={beforePhotos[i].signedUrl}
                        alt="Before"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="aspect-[4/3] rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground text-xs">
                      No photo
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  {i === 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      After
                    </Badge>
                  )}
                  {afterPhotos[i] ? (
                    <button
                      onClick={() => openLightbox(afterPhotos[i])}
                      className="aspect-[4/3] rounded-lg overflow-hidden border border-border hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer w-full"
                    >
                      <img
                        src={afterPhotos[i].signedUrl}
                        alt="After"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="aspect-[4/3] rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground text-xs">
                      No photo
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Standard grid view */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {beforePhotos.length > 0 && (
              <PhotoGrid items={beforePhotos} label="Before" />
            )}
            {afterPhotos.length > 0 && (
              <PhotoGrid items={afterPhotos} label="After" />
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none overflow-hidden">
          <div className="relative flex items-center justify-center min-h-[60vh]">
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {allPhotos.length > 1 && (
              <>
                <button
                  onClick={() => navigateLightbox(-1)}
                  className="absolute left-3 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={() => navigateLightbox(1)}
                  className="absolute right-3 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            {allPhotos[lightboxIndex] && (
              <img
                src={allPhotos[lightboxIndex].signedUrl}
                alt="Job photo"
                className="max-h-[80vh] max-w-full object-contain"
              />
            )}

            {allPhotos[lightboxIndex] && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm space-y-0.5 text-center">
                <div>
                  {allPhotos[lightboxIndex].photo_type === "before"
                    ? "Before"
                    : "After"}{" "}
                  • {lightboxIndex + 1} / {allPhotos.length}
                </div>
                <div className="text-[10px] text-white/60">
                  Uploaded:{" "}
                  {formatTimestamp(allPhotos[lightboxIndex].uploaded_at)}
                  {allPhotos[lightboxIndex].exif_timestamp &&
                    ` • EXIF: ${formatTimestamp(allPhotos[lightboxIndex].exif_timestamp!)}`}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminBookingPhotosSection;
