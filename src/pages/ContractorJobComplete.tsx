import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Leaf,
  Camera,
  X,
  Check,
  Loader2,
  ArrowLeft,
  MapPin,
  Calendar,
  Clock,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { photoLogger } from "@/lib/photoDebugLogger";
import { Download } from "lucide-react";

interface PhotoItem {
  id?: string;
  fileName: string;
  fileSize: number;
  photoUrl?: string;
  thumbnailUrl?: string;
  uploading?: boolean;
  uploaded?: boolean;
}

const ISSUE_CATEGORIES: { key: string; label: string; requiresPhoto: boolean; requiresText?: boolean }[] = [
  { key: "partial_access", label: "Partial Access (e.g., locked gate)", requiresPhoto: true },
  { key: "dog_in_yard", label: "Dog in Yard", requiresPhoto: true },
  { key: "weather_interruption", label: "Weather Interruption", requiresPhoto: false },
  { key: "equipment_failure", label: "Equipment Failure", requiresPhoto: false },
  { key: "unexpected_condition", label: "Unexpected Property Condition (e.g., excessive debris)", requiresPhoto: true },
  { key: "incorrect_property_info", label: "Incorrect Property Information (size, slope, etc.)", requiresPhoto: true },
  { key: "pricing_error", label: "Error in Pricing", requiresPhoto: false, requiresText: true },
  { key: "other", label: "Other", requiresPhoto: false, requiresText: true },
];

const ContractorJobComplete = () => {
  const { id: bookingId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any>(null);
  const [address, setAddress] = useState<any>(null);
  const [contractor, setContractor] = useState<any>(null);
  const [contractorTier, setContractorTier] = useState<string>("standard");

  const [beforePhotos, setBeforePhotos] = useState<PhotoItem[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<PhotoItem[]>([]);

  const [checkPhotosCorrect, setCheckPhotosCorrect] = useState(false);
  const [checkQuality, setCheckQuality] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Issue reporting state
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [issueNotes, setIssueNotes] = useState<Record<string, string>>({});
  const [issuePhotos, setIssuePhotos] = useState<PhotoItem[]>([]);
  const issuePhotoInputRef = useRef<HTMLInputElement>(null);

  const [uploadProgress, setUploadProgress] = useState<{
    active: boolean;
    type: "before" | "after" | "issue";
    current: number;
    total: number;
  } | null>(null);

  const beforeCameraRef = useRef<HTMLInputElement>(null);
  const beforeGalleryRef = useRef<HTMLInputElement>(null);
  const afterCameraRef = useRef<HTMLInputElement>(null);
  const afterGalleryRef = useRef<HTMLInputElement>(null);

  const minPhotos = 4;

  useEffect(() => {
    photoLogger.installGlobalHandlers();
    photoLogger.info("ContractorJobComplete MOUNTED", { bookingId });
    fetchBookingData();
  }, [bookingId]);

  const fetchBookingData = async () => {
    if (!bookingId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/contractor-auth");
      return;
    }

    // Get contractor profile
    const { data: contractorData } = await supabase
      .from("contractors")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!contractorData) {
      toast.error("Contractor profile not found");
      navigate("/contractor");
      return;
    }

    setContractor(contractorData);

    // Determine tier from questionnaire_responses or default
    const responses = contractorData.questionnaire_responses as Record<string, any> | null;
    const tier = responses?.contractor_tier || "standard";
    setContractorTier(tier);

    // Get booking
    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .eq("contractor_id", contractorData.id)
      .single();

    if (bookingError || !bookingData) {
      toast.error("Booking not found or you don't have access");
      navigate("/contractor");
      return;
    }

    setBooking(bookingData);

    // Get address
    const { data: addressData } = await supabase
      .from("addresses")
      .select("*")
      .eq("id", bookingData.address_id)
      .single();

    setAddress(addressData);

    // Load existing photos
    const { data: existingPhotos } = await supabase
      .from("job_photos")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("contractor_id", contractorData.id);

    if (existingPhotos) {
      const befores: PhotoItem[] = [];
      const afters: PhotoItem[] = [];

      for (const photo of existingPhotos) {
        const fileName = photo.photo_url.split("/").pop() || "photo.jpg";
        const { data: signedData } = await supabase.storage.from("job-photos").createSignedUrl(photo.photo_url, 3600);
        const item: PhotoItem = {
          id: photo.id,
          fileName,
          fileSize: 0,
          photoUrl: photo.photo_url,
          thumbnailUrl: signedData?.signedUrl || undefined,
          uploaded: true,
        };

        if (photo.photo_type === "before") befores.push(item);
        else afters.push(item);
      }

      setBeforePhotos(befores);
      setAfterPhotos(afters);
    }

    setLoading(false);
  };

  /**
   * Ultra-low-memory image compression.
   * Strategy 1: createImageBitmap with resizeWidth — browser decodes at reduced
   *   resolution so the full-res pixels never enter JS heap memory.
   * Strategy 2 (fallback): <img> element + canvas for browsers without resize support.
   */
  const compressImage = (file: File, maxWidth = 600, quality = 0.5): Promise<Blob> => {
    const startTime = performance.now();
    photoLogger.info("compressImage START", {
      fileName: file.name,
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
      fileType: file.type,
      maxWidth,
      quality,
    });

    return compressWithBitmapResize(file, maxWidth, quality, startTime)
      .catch((bitmapErr) => {
        photoLogger.warn("createImageBitmap resize failed, falling back to <img>", {
          error: bitmapErr?.message || String(bitmapErr),
        });
        return compressWithImgElement(file, maxWidth, quality, startTime);
      });
  };

  /** Strategy 1: createImageBitmap with resizeWidth (lowest memory) */
  const compressWithBitmapResize = async (
    file: File,
    maxWidth: number,
    quality: number,
    startTime: number
  ): Promise<Blob> => {
    // First get natural dimensions without decoding full pixels
    const probeBitmap = await createImageBitmap(file);
    const natW = probeBitmap.width;
    const natH = probeBitmap.height;
    probeBitmap.close(); // free immediately
    photoLogger.info("Probe bitmap dimensions (closed)", { natW, natH });

    const scale = Math.min(1, maxWidth / natW);
    const targetW = Math.round(natW * scale);
    const targetH = Math.round(natH * scale);
    photoLogger.info("createImageBitmap resize target", { targetW, targetH, scale });

    // Decode at target resolution — browser never holds full-res pixels
    const bitmap = await createImageBitmap(file, {
      resizeWidth: targetW,
      resizeHeight: targetH,
      resizeQuality: "low",
    });
    photoLogger.info("Resized bitmap created", { w: bitmap.width, h: bitmap.height });

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("Canvas not supported");
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close(); // free decoded pixels
    photoLogger.info("Bitmap drawn to canvas and closed");

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          if (blob) {
            photoLogger.info("compressImage DONE (bitmap path)", {
              outputSize: `${(blob.size / 1024).toFixed(1)}KB`,
              elapsed: `${(performance.now() - startTime).toFixed(0)}ms`,
            });
            resolve(blob);
          } else {
            photoLogger.error("canvas.toBlob returned null (bitmap path)");
            reject(new Error("Compression failed"));
          }
        },
        "image/jpeg",
        quality
      );
    });
  };

  /** Strategy 2 (fallback): <img> + canvas */
  const compressWithImgElement = (
    file: File,
    maxWidth: number,
    quality: number,
    startTime: number
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        photoLogger.info("Image loaded via <img> (fallback)", {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });

        try {
          const scale = Math.min(1, maxWidth / img.naturalWidth);
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          photoLogger.info("Drawing to canvas (fallback)", { targetW: w, targetH: h, scale });

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Canvas not supported"));
            return;
          }

          ctx.drawImage(img, 0, 0, w, h);

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);
              canvas.width = 0;
              canvas.height = 0;
              if (blob) {
                photoLogger.info("compressImage DONE (fallback)", {
                  outputSize: `${(blob.size / 1024).toFixed(1)}KB`,
                  elapsed: `${(performance.now() - startTime).toFixed(0)}ms`,
                });
                resolve(blob);
              } else {
                photoLogger.error("canvas.toBlob returned null (fallback)");
                reject(new Error("Compression failed"));
              }
            },
            "image/jpeg",
            quality
          );
        } catch (err: any) {
          URL.revokeObjectURL(objectUrl);
          photoLogger.error("compressImage error in onload (fallback)", {
            error: err?.message || String(err),
          });
          reject(err);
        }
      };

      img.onerror = (e) => {
        URL.revokeObjectURL(objectUrl);
        photoLogger.error("Image load FAILED via <img> (fallback)", {
          error: String(e),
          fileName: file.name,
        });
        reject(new Error("Image load failed"));
      };

      img.src = objectUrl;
    });
  };

  /**
   * Deferred file handler — uses setTimeout(0) to let the browser
   * finish the camera intent before we touch the file data.
   * This prevents OOM crashes on mobile where the browser is still
   * holding camera resources when onChange fires.
   */
  const handleFileSelect = (
    files: FileList | null,
    type: "before" | "after" | "issue"
  ) => {
    photoLogger.info("onChange FIRED", { type, hasFiles: !!files, fileCount: files?.length ?? 0 });

    if (!files || !bookingId || !contractor || files.length === 0) {
      photoLogger.warn("handleFileSelect: no files or missing context");
      return;
    }

    const fileArray: File[] = [];
    for (let i = 0; i < files.length; i++) {
      fileArray.push(files[i]);
    }

    photoLogger.info("Files copied from FileList", {
      count: fileArray.length,
      files: fileArray.map((f) => ({
        name: f.name,
        size: `${(f.size / 1024 / 1024).toFixed(2)}MB`,
        type: f.type,
      })),
    });

    [beforeCameraRef, beforeGalleryRef, afterCameraRef, afterGalleryRef, issuePhotoInputRef].forEach(ref => {
      if (ref.current) ref.current.value = "";
    });
    photoLogger.info("File inputs cleared");

    setTimeout(() => {
      processFiles(fileArray, type);
    }, 100);
  };

  const processFiles = async (fileArray: File[], type: "before" | "after" | "issue") => {
    const setPhotos = type === "before" ? setBeforePhotos : type === "after" ? setAfterPhotos : setIssuePhotos;
    const total = fileArray.length;

    photoLogger.info("processFiles START (deferred)", {
      type,
      total,
      deviceMemory: (navigator as any).deviceMemory || "unknown",
      hardwareConcurrency: navigator.hardwareConcurrency || "unknown",
    });
    setUploadProgress({ active: true, type, current: 0, total });

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      if (!file) continue; // may have been nulled

      photoLogger.info(`Processing file ${i + 1}/${total}`, {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
      });
      setUploadProgress({ active: true, type, current: i + 1, total });

      // Longer delay between files to let GC reclaim memory
      if (i > 0) {
        await new Promise(r => setTimeout(r, 500));
        photoLogger.info("Inter-file GC pause done (500ms)");
      }

      let compressed: Blob;
      try {
        compressed = await compressImage(file);
      } catch (err: any) {
        photoLogger.error(`Compression failed for file ${i + 1}/${total}`, {
          error: err?.message || String(err),
          stack: err?.stack?.slice(0, 300),
          fileName: file.name,
        });
        toast.error(`Failed to process photo ${i + 1} of ${total}. Skipping.`);
        continue;
      }

      // Release reference to original file ASAP
      (fileArray as any)[i] = null;

      const item: PhotoItem = {
        fileName: file.name,
        fileSize: compressed.size,
        uploading: true,
      };

      setPhotos((prev) => [...prev, item]);

      const timestamp = Date.now();
      const filePath = `${bookingId}/${type}-${timestamp}-${Math.random().toString(36).slice(2, 8)}.jpg`;

      photoLogger.info("Uploading to storage...", {
        filePath,
        compressedSize: `${(compressed.size / 1024).toFixed(1)}KB`,
      });

      const { error: uploadError } = await supabase.storage
        .from("job-photos")
        .upload(filePath, compressed, { contentType: "image/jpeg" });

      // Release compressed blob reference
      compressed = null as any;

      if (uploadError) {
        photoLogger.error("Storage upload failed", { error: uploadError.message, filePath });
        toast.error(`Photo ${i + 1} of ${total} failed: ${uploadError.message}`);
        setPhotos((prev) => prev.filter((p) => p !== item));
        continue;
      }

      photoLogger.info("Inserting DB record...");
      const { error: dbError } = await supabase.from("job_photos").insert({
        booking_id: bookingId,
        contractor_id: contractor.id,
        photo_type: type,
        photo_url: filePath,
      });

      if (dbError) {
        photoLogger.error("DB insert failed", { error: dbError.message });
        toast.error(`Photo ${i + 1} record failed: ${dbError.message}`);
        continue;
      }

      const { data: signedData } = await supabase.storage
        .from("job-photos")
        .createSignedUrl(filePath, 3600);

      setPhotos((prev) =>
        prev.map((p) =>
          p === item
            ? { ...p, uploading: false, uploaded: true, photoUrl: filePath, thumbnailUrl: signedData?.signedUrl || undefined }
            : p
        )
      );
      photoLogger.info(`File ${i + 1}/${total} complete`);
    }

    photoLogger.info("processFiles DONE", { type, totalProcessed: total });
    setUploadProgress(null);
  };

  const handleRemovePhoto = async (
    photo: PhotoItem,
    type: "before" | "after" | "issue"
  ) => {
    const setPhotos = type === "before" ? setBeforePhotos : type === "after" ? setAfterPhotos : setIssuePhotos;

    if (photo.photoUrl) {
      await supabase.storage.from("job-photos").remove([photo.photoUrl]);
      if (photo.id) {
        await supabase.from("job_photos").delete().eq("id", photo.id);
      }
    }

    setPhotos((prev) => prev.filter((p) => p !== photo));
  };

  const handleMarkComplete = async () => {
    if (!bookingId || !contractor) return;

    // Validate issue-specific requirements
    const hasIssues = selectedIssues.length > 0;
    if (hasIssues) {
      // Check mandatory text fields
      for (const issueKey of selectedIssues) {
        const cat = ISSUE_CATEGORIES.find(c => c.key === issueKey);
        if (cat?.requiresText && (!issueNotes[issueKey] || issueNotes[issueKey].trim().length < 10)) {
          toast.error(`Please provide details for "${cat.label}" (minimum 10 characters)`);
          return;
        }
      }
      // Check mandatory photo requirements
      const needsPhotos = selectedIssues.some(k => ISSUE_CATEGORIES.find(c => c.key === k)?.requiresPhoto);
      const issuePhotoCount = issuePhotos.filter(p => p.uploaded).length;
      if (needsPhotos && issuePhotoCount === 0) {
        toast.error("Please upload at least one photo as evidence for the reported issue(s)");
        return;
      }
    }

    setSubmitting(true);
    try {
      // Collect issue photo URLs
      const issuePhotoUrls = issuePhotos
        .filter(p => p.uploaded && p.photoUrl)
        .map(p => p.photoUrl!);

      const { data, error } = await supabase.functions.invoke("complete-job", {
        body: {
          bookingId,
          ...(hasIssues && {
            issues: selectedIssues,
            issueNotes: Object.fromEntries(
              Object.entries(issueNotes).filter(([k]) => selectedIssues.includes(k))
            ),
            issuePhotoUrls,
          }),
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Failed to complete job");
        return;
      }

      if (hasIssues) {
        toast.success("Job completed with reported issues. Admin has been notified.");
      } else {
        toast.success("Job marked as complete! The customer will be notified.");
      }
      navigate("/contractor");
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const beforeCount = beforePhotos.filter((p) => p.uploaded).length;
  const afterCount = afterPhotos.filter((p) => p.uploaded).length;
  const issuePhotoCount = issuePhotos.filter((p) => p.uploaded).length;
  const photosReady = beforeCount >= minPhotos && afterCount >= minPhotos;
  const hasIssues = selectedIssues.length > 0;
  
  // Validate issue requirements for canSubmit
  const issueRequiresPhoto = selectedIssues.some(k => ISSUE_CATEGORIES.find(c => c.key === k)?.requiresPhoto);
  const issuePhotosValid = !issueRequiresPhoto || issuePhotoCount > 0;
  const issueTextValid = selectedIssues.every(k => {
    const cat = ISSUE_CATEGORIES.find(c => c.key === k);
    return !cat?.requiresText || (issueNotes[k] && issueNotes[k].trim().length >= 10);
  });
  const canSubmit = photosReady && checkPhotosCorrect && checkQuality && !submitting && issuePhotosValid && issueTextValid;

  const timeSlots: Record<string, string> = {
    "7am-10am": "7:00 AM - 10:00 AM",
    "10am-2pm": "10:00 AM - 2:00 PM",
    "2pm-5pm": "2:00 PM - 5:00 PM",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Booking not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/contractor")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-foreground">Complete Job</span>
              <Badge variant="outline" className="ml-2">Contractor</Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        {/* Debug Log Download */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => photoLogger.downloadLogs()}
          >
            <Download className="w-3 h-3 mr-1" />
            Download Debug Logs
          </Button>
        </div>
        {/* Job Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Job Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-1 text-muted-foreground" />
              <div>
                <p className="font-medium">{address?.street_address}</p>
                <p className="text-sm text-muted-foreground">
                  {address?.city}, {address?.state} {address?.postal_code}
                </p>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {new Date(booking.scheduled_date).toLocaleDateString("en-AU", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{timeSlots[booking.time_slot] || booking.time_slot}</span>
              </div>
            </div>
            <div className="pt-2 border-t">
              <span className="font-semibold text-lg text-primary">
                ${Number(booking.total_price).toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Before Photos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Before Photos
              </CardTitle>
              <Badge variant={beforeCount >= minPhotos ? "default" : "secondary"}>
                {beforeCount >= minPhotos ? (
                  <Check className="w-3 h-3 mr-1" />
                ) : null}
                {beforeCount}/{minPhotos}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Take photos of the lawn <strong>before</strong> you start mowing.
            </p>

            {/* Photo thumbnails */}
            <div className="grid grid-cols-3 gap-2">
              {beforePhotos.map((photo, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg border bg-muted/30 overflow-hidden">
                  {photo.uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : photo.thumbnailUrl ? (
                    <img
                      src={photo.thumbnailUrl}
                      alt={photo.fileName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  {photo.uploaded && (
                    <CheckCircle2 className="absolute top-1 left-1 w-4 h-4 text-primary drop-shadow" />
                  )}
                  <button
                    onClick={() => handleRemovePhoto(photo, "before")}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  photoLogger.info("BUTTON CLICK: Before - Take Photo (camera)", { timestamp: Date.now() });
                  beforeCameraRef.current?.click();
                }}
              >
                <Camera className="w-4 h-4 mr-2" />
                Take Photo
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  photoLogger.info("BUTTON CLICK: Before - Gallery", { timestamp: Date.now() });
                  beforeGalleryRef.current?.click();
                }}
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                Gallery
              </Button>
            </div>

            {uploadProgress?.active && uploadProgress.type === "before" && (
              <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Uploading photo {uploadProgress.current} of {uploadProgress.total}...</span>
                </div>
                <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="h-2" />
              </div>
            )}

            <input
              ref={beforeCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files, "before")}
            />
            <input
              ref={beforeGalleryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files, "before")}
            />
          </CardContent>
        </Card>

        {/* After Photos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                After Photos
              </CardTitle>
              <Badge variant={afterCount >= minPhotos ? "default" : "secondary"}>
                {afterCount >= minPhotos ? (
                  <Check className="w-3 h-3 mr-1" />
                ) : null}
                {afterCount}/{minPhotos}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Take photos of the lawn <strong>after</strong> mowing is complete.
            </p>

            <div className="grid grid-cols-3 gap-2">
              {afterPhotos.map((photo, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg border bg-muted/30 overflow-hidden">
                  {photo.uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : photo.thumbnailUrl ? (
                    <img
                      src={photo.thumbnailUrl}
                      alt={photo.fileName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  {photo.uploaded && (
                    <CheckCircle2 className="absolute top-1 left-1 w-4 h-4 text-primary drop-shadow" />
                  )}
                  <button
                    onClick={() => handleRemovePhoto(photo, "after")}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  photoLogger.info("BUTTON CLICK: After - Take Photo (camera)", { timestamp: Date.now() });
                  afterCameraRef.current?.click();
                }}
              >
                <Camera className="w-4 h-4 mr-2" />
                Take Photo
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  photoLogger.info("BUTTON CLICK: After - Gallery", { timestamp: Date.now() });
                  afterGalleryRef.current?.click();
                }}
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                Gallery
              </Button>
            </div>

            {uploadProgress?.active && uploadProgress.type === "after" && (
              <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Uploading photo {uploadProgress.current} of {uploadProgress.total}...</span>
                </div>
                <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="h-2" />
              </div>
            )}

            <input
              ref={afterCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files, "after")}
            />
            <input
              ref={afterGalleryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files, "after")}
            />
          </CardContent>
        </Card>

        {/* Job Issues / Notes (optional) */}
        <Card className={hasIssues ? "border-yellow-500/50" : ""}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Job Issues / Notes
              <Badge variant="outline" className="ml-auto text-xs">Optional</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Report any issues that prevented full completion or impacted quality. This will trigger admin review.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {ISSUE_CATEGORIES.map((cat) => (
              <div key={cat.key} className="space-y-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`issue-${cat.key}`}
                    checked={selectedIssues.includes(cat.key)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIssues(prev => [...prev, cat.key]);
                      } else {
                        setSelectedIssues(prev => prev.filter(k => k !== cat.key));
                        setIssueNotes(prev => {
                          const copy = { ...prev };
                          delete copy[cat.key];
                          return copy;
                        });
                      }
                    }}
                  />
                  <label htmlFor={`issue-${cat.key}`} className="text-sm leading-relaxed cursor-pointer">
                    {cat.label}
                    {cat.requiresPhoto && (
                      <span className="text-xs text-muted-foreground ml-1">(photo evidence required)</span>
                    )}
                    {cat.requiresText && (
                      <span className="text-xs text-muted-foreground ml-1">(details required)</span>
                    )}
                  </label>
                </div>
                {selectedIssues.includes(cat.key) && cat.requiresText && (
                  <div className="ml-8">
                    <Textarea
                      placeholder={`Describe the ${cat.label.toLowerCase()} issue (min 10 characters)...`}
                      value={issueNotes[cat.key] || ""}
                      onChange={(e) => setIssueNotes(prev => ({ ...prev, [cat.key]: e.target.value }))}
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {(issueNotes[cat.key] || "").length}/10 characters minimum
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Issue photos section - shown when any issue is selected */}
            {hasIssues && (
              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Evidence Photos {issueRequiresPhoto ? "*" : "(optional)"}
                  </p>
                  <Badge variant={issueRequiresPhoto && issuePhotoCount === 0 ? "destructive" : "secondary"}>
                    {issuePhotoCount} uploaded
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {issuePhotos.map((photo, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg border bg-muted/30 overflow-hidden">
                      {photo.uploading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                      ) : photo.thumbnailUrl ? (
                        <img src={photo.thumbnailUrl} alt={photo.fileName} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      {photo.uploaded && (
                        <CheckCircle2 className="absolute top-1 left-1 w-4 h-4 text-primary drop-shadow" />
                      )}
                      <button
                        onClick={() => handleRemovePhoto(photo, "issue")}
                        className="absolute top-1 right-1 p-0.5 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => issuePhotoInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Add Issue Photos
                </Button>

                {uploadProgress?.active && uploadProgress.type === "issue" && (
                  <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span>Uploading photo {uploadProgress.current} of {uploadProgress.total}...</span>
                    </div>
                    <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="h-2" />
                  </div>
                )}

                <input
                  ref={issuePhotoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files, "issue")}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Quality Checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="photos-correct"
                checked={checkPhotosCorrect}
                onCheckedChange={(v) => setCheckPhotosCorrect(v === true)}
              />
              <label htmlFor="photos-correct" className="text-sm leading-relaxed cursor-pointer">
                The photos I have uploaded are from today and from the correct property
              </label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="quality"
                checked={checkQuality}
                onCheckedChange={(v) => setCheckQuality(v === true)}
              />
              <label htmlFor="quality" className="text-sm leading-relaxed cursor-pointer">
                The photos accurately represent the quality of my work
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Validation messages */}
        {!photosReady && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              You need at least {minPhotos} before photos and {minPhotos} after photos to complete this job.
            </span>
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full"
          size="lg"
          disabled={!canSubmit}
          onClick={handleMarkComplete}
        >
          {submitting ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <Check className="w-5 h-5 mr-2" />
          )}
          {submitting ? "Completing Job..." : hasIssues ? "Complete Job & Report Issues" : "Mark Job Complete"}
        </Button>
      </main>
    </div>
  );
};

export default ContractorJobComplete;
