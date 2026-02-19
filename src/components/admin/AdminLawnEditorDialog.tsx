import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, History, PenTool, MapPin, Eye } from "lucide-react";
import AdminLawnEditorMap, { AdminLawnEditorMapRef } from "./AdminLawnEditorMap";
import type { Database } from "@/integrations/supabase/types";
import { getLawnImageSignedUrl } from "@/lib/storage";

type Address = Database["public"]["Tables"]["addresses"]["Row"];

interface LawnRevision {
  id: string;
  address_id: string;
  revision_number: number;
  square_meters: number | null;
  lawn_image_url: string | null;
  polygon_data: Array<Array<{ lat: number; lng: number }>> | null;
  is_current: boolean;
  created_at: string;
  created_by: string;
  notes: string | null;
}

interface AdminLawnEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: Address | null;
  onSaved?: () => void;
}

// Helper component to load signed URLs for revision images
const RevisionImage = ({ lawnImageUrl, revisionNumber }: { lawnImageUrl: string | null; revisionNumber: number }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lawnImageUrl) {
      setLoading(true);
      getLawnImageSignedUrl(lawnImageUrl)
        .then(setSignedUrl)
        .finally(() => setLoading(false));
    }
  }, [lawnImageUrl]);

  if (!lawnImageUrl) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground bg-muted/50">
        No lawn image (manual entry)
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return signedUrl ? (
    <div className="rounded-lg overflow-hidden border">
      <img
        src={signedUrl}
        alt={`Revision ${revisionNumber}`}
        className="w-full h-48 object-cover"
      />
    </div>
  ) : (
    <div className="rounded-lg border p-8 text-center text-muted-foreground bg-muted/50">
      Image unavailable
    </div>
  );
};

const AdminLawnEditorDialog = ({
  open,
  onOpenChange,
  address,
  onSaved,
}: AdminLawnEditorDialogProps) => {
  const [activeTab, setActiveTab] = useState<"draw" | "manual" | "history">("draw");
  const [manualArea, setManualArea] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [revisions, setRevisions] = useState<LawnRevision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<LawnRevision | null>(null);
  const [polygonData, setPolygonData] = useState<Array<Array<{ lat: number; lng: number }>>>([]);
  const [calculatedArea, setCalculatedArea] = useState(0);
  const [currentRevision, setCurrentRevision] = useState<LawnRevision | null>(null);
  const mapRef = useRef<AdminLawnEditorMapRef>(null);

  useEffect(() => {
    if (open && address) {
      fetchRevisions();
      setManualArea(address.square_meters?.toString() || "");
      setNotes("");
    }
  }, [open, address]);

  const fetchRevisions = async () => {
    if (!address) return;

    const { data, error } = await supabase
      .from("lawn_area_revisions")
      .select("*")
      .eq("address_id", address.id)
      .order("revision_number", { ascending: false });

    if (error) {
      console.error("Error fetching revisions:", error);
      return;
    }

    // Cast the data to our type with proper polygon_data handling
    const typedRevisions: LawnRevision[] = (data || []).map(rev => ({
      ...rev,
      polygon_data: rev.polygon_data as Array<Array<{ lat: number; lng: number }>> | null,
    }));

    setRevisions(typedRevisions);
    const current = typedRevisions.find(r => r.is_current);
    setCurrentRevision(current || null);

    // Load current revision's polygons into editor
    if (current?.polygon_data) {
      setPolygonData(current.polygon_data);
    }
  };

  const handlePolygonsChange = (
    polygons: Array<Array<{ lat: number; lng: number }>>,
    areaInSqm: number
  ) => {
    setPolygonData(polygons);
    setCalculatedArea(areaInSqm);
  };

  const uploadLawnImage = async (userId: string): Promise<string | null> => {
    if (!mapRef.current) return null;

    try {
      const blob = await mapRef.current.captureImage();
      if (!blob) return null;

      const fileName = `admin/${address?.id}/${Date.now()}-lawn.png`;
      const { data, error } = await supabase.storage
        .from("lawn-images")
        .upload(fileName, blob, {
          contentType: "image/png",
          upsert: false,
        });

      if (error) {
        console.error("Error uploading image:", error);
        return null;
      }

      // Return the storage path (not public URL - bucket is private)
      return data.path;
    } catch (error) {
      console.error("Error in uploadLawnImage:", error);
      return null;
    }
  };

  const handleSaveDrawing = async () => {
    if (!address) return;

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      // Capture the map image
      const imageUrl = await uploadLawnImage(user.id);

      // Get next revision number
      const nextRevisionNumber = revisions.length > 0 
        ? Math.max(...revisions.map(r => r.revision_number)) + 1 
        : 1;

      // Mark all existing revisions as not current
      if (revisions.length > 0) {
        await supabase
          .from("lawn_area_revisions")
          .update({ is_current: false })
          .eq("address_id", address.id);
      }

      // Insert new revision
      const { error: insertError } = await supabase
        .from("lawn_area_revisions")
        .insert({
          address_id: address.id,
          revision_number: nextRevisionNumber,
          square_meters: calculatedArea,
          lawn_image_url: imageUrl,
          polygon_data: polygonData as unknown as Database["public"]["Tables"]["lawn_area_revisions"]["Insert"]["polygon_data"],
          is_current: true,
          created_by: user.id,
          notes: notes || null,
        });

      if (insertError) {
        throw insertError;
      }

      // Update the address with new values
      await supabase
        .from("addresses")
        .update({
          square_meters: calculatedArea,
          lawn_image_url: imageUrl,
        })
        .eq("id", address.id);

      toast.success("Lawn area saved as new revision");
      fetchRevisions();
      onSaved?.();
    } catch (error) {
      console.error("Error saving lawn area:", error);
      toast.error("Failed to save lawn area");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveManual = async () => {
    if (!address || !manualArea) return;

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      const area = parseFloat(manualArea);
      if (isNaN(area) || area <= 0) {
        toast.error("Please enter a valid area");
        return;
      }

      // Get next revision number
      const nextRevisionNumber = revisions.length > 0 
        ? Math.max(...revisions.map(r => r.revision_number)) + 1 
        : 1;

      // Mark all existing revisions as not current
      if (revisions.length > 0) {
        await supabase
          .from("lawn_area_revisions")
          .update({ is_current: false })
          .eq("address_id", address.id);
      }

      // Insert new revision (manual entry - no image or polygon)
      const { error: insertError } = await supabase
        .from("lawn_area_revisions")
        .insert({
          address_id: address.id,
          revision_number: nextRevisionNumber,
          square_meters: area,
          lawn_image_url: null,
          polygon_data: null,
          is_current: true,
          created_by: user.id,
          notes: notes ? `[Manual entry] ${notes}` : "[Manual entry]",
        });

      if (insertError) {
        throw insertError;
      }

      // Update the address
      await supabase
        .from("addresses")
        .update({
          square_meters: area,
          lawn_image_url: null, // Clear image for manual entries
        })
        .eq("id", address.id);

      toast.success("Manual area saved as new revision");
      fetchRevisions();
      onSaved?.();
    } catch (error) {
      console.error("Error saving manual area:", error);
      toast.error("Failed to save area");
    } finally {
      setIsSaving(false);
    }
  };

  const getFullAddress = () => {
    if (!address) return "";
    return `${address.street_address}, ${address.city}, ${address.state} ${address.postal_code}`;
  };

  if (!address) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Edit Lawn Area
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{getFullAddress()}</p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draw" className="flex items-center gap-2">
              <PenTool className="w-4 h-4" />
              Draw
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              Manual Entry
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              History
              {revisions.length > 0 && (
                <Badge variant="secondary" className="ml-1">{revisions.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto mt-4">
            <TabsContent value="draw" className="mt-0 h-full">
              <AdminLawnEditorMap
                ref={mapRef}
                address={getFullAddress()}
                initialPolygons={currentRevision?.polygon_data || undefined}
                onPolygonsChange={handlePolygonsChange}
              />

              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Revision Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about this revision..."
                    rows={2}
                  />
                </div>

                <Button
                  onClick={handleSaveDrawing}
                  disabled={isSaving || polygonData.length === 0}
                  className="w-full"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save as New Revision
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="mt-0 space-y-4">
              <div className="p-4 border rounded-lg space-y-4">
                <div className="space-y-2">
                  <Label>Square Meters</Label>
                  <Input
                    type="number"
                    value={manualArea}
                    onChange={(e) => setManualArea(e.target.value)}
                    placeholder="Enter lawn area in m²"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about this measurement..."
                    rows={2}
                  />
                </div>

                <Button
                  onClick={handleSaveManual}
                  disabled={isSaving || !manualArea}
                  className="w-full"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Manual Entry
                    </>
                  )}
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                Note: Manual entries do not include a lawn image or polygon data.
              </p>
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              {revisions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No revision history yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Revision List */}
                  <ScrollArea className="h-[200px] border rounded-lg">
                    <div className="p-2 space-y-2">
                      {revisions.map((rev) => (
                        <div
                          key={rev.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedRevision?.id === rev.id
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted"
                          }`}
                          onClick={() => setSelectedRevision(rev)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Revision {rev.revision_number}</span>
                              {rev.is_current && (
                                <Badge variant="default" className="text-xs">Current</Badge>
                              )}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {rev.square_meters ? `${rev.square_meters} m²` : "No area"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(rev.created_at).toLocaleString()}
                          </p>
                          {rev.notes && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {rev.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Selected Revision Preview */}
                  {selectedRevision && (
                    <div className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2">
                          <Eye className="w-4 h-4" />
                          Revision {selectedRevision.revision_number} Preview
                          {selectedRevision.is_current && (
                            <Badge variant="default" className="text-xs">Current</Badge>
                          )}
                        </h4>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Area:</span>
                          <p className="font-medium">
                            {selectedRevision.square_meters 
                              ? `${selectedRevision.square_meters} m²` 
                              : "Not specified"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Created:</span>
                          <p className="font-medium">
                            {new Date(selectedRevision.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {selectedRevision.notes && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Notes:</span>
                          <p>{selectedRevision.notes}</p>
                        </div>
                      )}

                      <RevisionImage
                        lawnImageUrl={selectedRevision.lawn_image_url}
                        revisionNumber={selectedRevision.revision_number}
                      />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AdminLawnEditorDialog;