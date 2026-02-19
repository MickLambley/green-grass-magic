import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, PenTool, Save } from "lucide-react";
import html2canvas from "html2canvas";

interface AdminLawnEditorMapProps {
  address: string;
  initialPolygons?: Array<Array<{ lat: number; lng: number }>>;
  onPolygonsChange: (polygons: Array<Array<{ lat: number; lng: number }>>, areaInSqm: number) => void;
}

export interface AdminLawnEditorMapRef {
  captureImage: () => Promise<Blob | null>;
  getPolygonData: () => Array<Array<{ lat: number; lng: number }>>;
}

declare global {
  interface Window {
    google: typeof google;
  }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const AdminLawnEditorMap = forwardRef<AdminLawnEditorMapRef, AdminLawnEditorMapProps>(
  ({ address, initialPolygons, onPolygonsChange }, ref) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
    const polygonsRef = useRef<google.maps.Polygon[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [totalArea, setTotalArea] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);

    const onPolygonsChangeRef = useRef(onPolygonsChange);
    onPolygonsChangeRef.current = onPolygonsChange;

    // Get polygon data as serializable format
    const getPolygonData = useCallback((): Array<Array<{ lat: number; lng: number }>> => {
      return polygonsRef.current.map(polygon => {
        const path = polygon.getPath();
        const coords: Array<{ lat: number; lng: number }> = [];
        for (let i = 0; i < path.getLength(); i++) {
          const point = path.getAt(i);
          coords.push({ lat: point.lat(), lng: point.lng() });
        }
        return coords;
      });
    }, []);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      captureImage: async (): Promise<Blob | null> => {
        if (!mapRef.current) return null;

        try {
          // Hide drawing controls temporarily
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setOptions({ drawingControl: false });
          }

          await new Promise(resolve => setTimeout(resolve, 100));

          const canvas = await html2canvas(mapRef.current, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            scale: 2,
            logging: false,
          });

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
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setOptions({ drawingControl: true });
          }
          return null;
        }
      },
      getPolygonData,
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
      onPolygonsChangeRef.current(getPolygonData(), roundedTotal);
    }, [calculatePolygonArea, getPolygonData]);

    const clearAllDrawings = useCallback(() => {
      polygonsRef.current.forEach((polygon) => {
        polygon.setMap(null);
      });
      polygonsRef.current = [];
      setTotalArea(0);
      onPolygonsChangeRef.current([], 0);
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
      script.onerror = () => setError("Failed to load Google Maps.");
      document.head.appendChild(script);
    }, []);

    // Initialize map when script is loaded
    useEffect(() => {
      if (!isScriptLoaded || !mapRef.current) return;
      if (mapInstanceRef.current) return;

      const map = new google.maps.Map(mapRef.current, {
        center: { lat: -33.8688, lng: 151.2093 },
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

      const drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: true,
        drawingControlOptions: {
          position: google.maps.ControlPosition.TOP_CENTER,
          drawingModes: [google.maps.drawing.OverlayType.POLYGON],
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

      // Load initial polygons if provided
      if (initialPolygons && initialPolygons.length > 0) {
        initialPolygons.forEach(coords => {
          const polygon = new google.maps.Polygon({
            paths: coords,
            fillColor: "#22c55e",
            fillOpacity: 0.3,
            strokeColor: "#22c55e",
            strokeWeight: 3,
            editable: true,
            draggable: true,
            map: map,
          });

          polygonsRef.current.push(polygon);

          // Add edit listeners
          google.maps.event.addListener(polygon.getPath(), "set_at", recalculateTotalArea);
          google.maps.event.addListener(polygon.getPath(), "insert_at", recalculateTotalArea);
          google.maps.event.addListener(polygon.getPath(), "remove_at", recalculateTotalArea);
          google.maps.event.addListener(polygon, "dragend", recalculateTotalArea);
        });

        // Calculate initial area
        setTimeout(recalculateTotalArea, 100);
      }

      google.maps.event.addListener(drawingManager, "polygoncomplete", (polygon: google.maps.Polygon) => {
        polygonsRef.current.push(polygon);
        recalculateTotalArea();

        google.maps.event.addListener(polygon.getPath(), "set_at", recalculateTotalArea);
        google.maps.event.addListener(polygon.getPath(), "insert_at", recalculateTotalArea);
        google.maps.event.addListener(polygon.getPath(), "remove_at", recalculateTotalArea);
        google.maps.event.addListener(polygon, "dragend", recalculateTotalArea);

        drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      });

      setIsLoading(false);
    }, [isScriptLoaded, initialPolygons, recalculateTotalArea]);

    // Geocode the address
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

    // Cleanup
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

        {error && <p className="text-sm text-amber-600">{error}</p>}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">
              Total lawn area: <span className="text-primary">{totalArea} m²</span>
            </span>
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

AdminLawnEditorMap.displayName = "AdminLawnEditorMap";

export default AdminLawnEditorMap;