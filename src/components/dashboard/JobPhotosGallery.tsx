import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageIcon, Loader2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Photo {
  id: string;
  photo_type: string;
  photo_url: string;
  signedUrl?: string;
}

interface JobPhotosGalleryProps {
  bookingId: string;
}

const JobPhotosGallery = ({ bookingId }: JobPhotosGalleryProps) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    fetchPhotos();
  }, [bookingId]);

  const fetchPhotos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job_photos")
      .select("id, photo_type, photo_url")
      .eq("booking_id", bookingId)
      .order("uploaded_at", { ascending: true });

    if (error || !data || data.length === 0) {
      setLoading(false);
      return;
    }

    // Get signed URLs for all photos
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (photos.length === 0) return null;

  const PhotoGrid = ({ items, label }: { items: Photo[]; label: string }) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <ImageIcon className="w-4 h-4" />
        {label} ({items.length})
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((photo) => (
          <button
            key={photo.id}
            onClick={() => openLightbox(photo)}
            className="aspect-square rounded-lg overflow-hidden border border-border hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer"
          >
            <img
              src={photo.signedUrl}
              alt={`${label} photo`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {beforePhotos.length > 0 && <PhotoGrid items={beforePhotos} label="Before" />}
          {afterPhotos.length > 0 && <PhotoGrid items={afterPhotos} label="After" />}
        </div>
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none overflow-hidden">
          <div className="relative flex items-center justify-center min-h-[60vh]">
            {/* Close */}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Navigation */}
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

            {/* Image */}
            {allPhotos[lightboxIndex] && (
              <img
                src={allPhotos[lightboxIndex].signedUrl}
                alt="Job photo"
                className="max-h-[80vh] max-w-full object-contain"
              />
            )}

            {/* Caption */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-white/10 text-white text-sm">
              {allPhotos[lightboxIndex]?.photo_type === "before" ? "Before" : "After"} •{" "}
              {lightboxIndex + 1} / {allPhotos.length}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JobPhotosGallery;
