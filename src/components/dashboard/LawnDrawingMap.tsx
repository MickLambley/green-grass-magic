import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, PenTool, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import html2canvas from "html2canvas";

interface LawnDrawingMapProps {
  address: string;
  onAreaCalculated: (areaInSqm: number) => void;
}

export interface LawnDrawingMapRef {
  captureImage: () => Promise<Blob | null>;
}

declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const LawnDrawingMap = forwardRef<LawnDrawingMapRef, LawnDrawingMapProps>(
  ({ address, onAreaCalculated }, ref) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
    const polygonsRef = useRef<google.maps.Polygon[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [totalArea, setTotalArea] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);

    const onAreaCalculatedRef = useRef(onAreaCalculated);
    onAreaCalculatedRef.current = onAreaCalculated;

    // Expose captureImage method to parent
    useImperativeHandle(ref, () => ({
      captureImage: async (): Promise<Blob | null> => {
        if (!mapRef.current) return null;

        try {
          // Hide drawing controls temporarily for cleaner capture
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setOptions({ drawingControl: false });
          }

          // Wait a bit for UI to update
          await new Promise(resolve => setTimeout(resolve, 100));

          const canvas = await html2canvas(mapRef.current, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            scale: 2, // Higher quality
            logging: false,
          });

          // Restore drawing controls
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setOptions({ drawingControl: true });
          }

          return new Promise((resolve) => {
            canvas.toBlob((blob) => {
              resolve(blob);
            }, "image/png", 0.9);
          });
        } catch (error) {
          console.error("Error capturing map image:", error);
          // Restore drawing controls on error
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setOptions({ drawingControl: true });
          }
          return null;
        }
      },
    }));

    const calculatePolygonArea = useCallback((polygon: google.maps.Polygon): number => {
      const path = polygon.getPath();
      if (path.getLength() < 3) return 0;
      return google.maps.geometry.spherical.computeArea(path);
    }, []);

    const recalculateTotalArea = useCallback(() => {
      let total = 0;
      polygonsRef.current.forEach((polygon) => {
        total += calculatePolygonArea(polygon);
      });
      const roundedTotal = Math.round(total);
      setTotalArea(roundedTotal);
      onAreaCalculatedRef.current(roundedTotal);
    }, [calculatePolygonArea]);

    const clearAllDrawings = useCallback(() => {
      polygonsRef.current.forEach((polygon) => {
        polygon.setMap(null);
      });
      polygonsRef.current = [];
      setTotalArea(0);
      onAreaCalculatedRef.current(0);
    }, []);

    // Load Google Maps script
    useEffect(() => {
      if (window.google && window.google.maps) {
        setIsScriptLoaded(true);
        return;
      }

      const existingScript = document.getElementById("google-maps-script");
      if (existingScript) {
        existingScript.addEventListener("load", () => setIsScriptLoaded(true));
        return;
      }

      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=drawing,geometry,places`;
      script.async = true;
      script.defer = true;
      script.onload = () => setIsScriptLoaded(true);
      script.onerror = () => setError("Failed to load Google Maps. Please check your API key.");
      document.head.appendChild(script);
    }, []);

    // Initialize map when script is loaded
    useEffect(() => {
      if (!isScriptLoaded || !mapRef.current) return;
      
      // Prevent re-initialization
      if (mapInstanceRef.current) return;

      const map = new google.maps.Map(mapRef.current, {
        center: { lat: -33.8688, lng: 151.2093 }, // Default to Sydney
        zoom: 19,
        mapTypeId: google.maps.MapTypeId.SATELLITE,
        tilt: 0,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      });

      mapInstanceRef.current = map;

      // Initialize drawing manager
      const drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: true,
        drawingControlOptions: {
          position: google.maps.ControlPosition.TOP_CENTER,
          drawingModes: [
            google.maps.drawing.OverlayType.POLYGON,
          ],
        },
        polygonOptions: {
          fillColor: "#22c55e",
          fillOpacity: 0.3,
          strokeColor: "#22c55e",
          strokeWeight: 3,
          editable: true,
          draggable: true,
        },
      });

      drawingManager.setMap(map);
      drawingManagerRef.current = drawingManager;

      // Handle polygon completion
      google.maps.event.addListener(drawingManager, "polygoncomplete", (polygon: google.maps.Polygon) => {
        polygonsRef.current.push(polygon);
        recalculateTotalArea();

        // Add listeners for polygon edits
        google.maps.event.addListener(polygon.getPath(), "set_at", recalculateTotalArea);
        google.maps.event.addListener(polygon.getPath(), "insert_at", recalculateTotalArea);
        google.maps.event.addListener(polygon.getPath(), "remove_at", recalculateTotalArea);
        google.maps.event.addListener(polygon, "dragend", recalculateTotalArea);

        // Keep drawing mode active for multiple polygons
        drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      });

      setIsLoading(false);
    }, [isScriptLoaded, recalculateTotalArea]);

    // Geocode the address separately
    useEffect(() => {
      if (!isScriptLoaded || !mapInstanceRef.current || !address) return;

      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: address + ", Australia" }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          mapInstanceRef.current?.setCenter(results[0].geometry.location);
          mapInstanceRef.current?.setZoom(20);
          setError(null);
        } else {
          setError("Could not find address location. Please adjust the map manually.");
        }
      });
    }, [isScriptLoaded, address]);

    // Cleanup on unmount only
    useEffect(() => {
      return () => {
        if (drawingManagerRef.current) {
          drawingManagerRef.current.setMap(null);
        }
        polygonsRef.current.forEach((polygon) => polygon.setMap(null));
        polygonsRef.current = [];
      };
    }, []);

    return (
      <div className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Use the polygon tool to draw the outline of your lawn areas. 
            Click to add points, and close the shape by clicking the first point. 
            You can drag to edit after drawing.
          </AlertDescription>
        </Alert>

        <div className="relative">
          <div
            ref={mapRef}
            className="w-full h-[400px] rounded-lg border overflow-hidden"
            style={{ zIndex: 0 }}
          />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Loading satellite view...</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-amber-600">{error}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <PenTool className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                Total lawn area: <span className="text-primary">{totalArea} m²</span>
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearAllDrawings}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Clear All
          </Button>
        </div>
      </div>
    );
  }
);

LawnDrawingMap.displayName = "LawnDrawingMap";

export default LawnDrawingMap;
