import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, MapPin, Loader2, Navigation } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import type { GeographicData } from "./types";

interface SuburbWithCoords {
  name: string;
  lat: number;
  lng: number;
}

interface GeographicReachStepProps {
  data: GeographicData;
  onChange: (data: GeographicData) => void;
  onNext: () => void;
  onBack: () => void;
}

export const GeographicReachStep = ({ data, onChange, onNext, onBack }: GeographicReachStepProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const hasAutoGeocodedRef = useRef(false);

  const [isLoadingSuburbs, setIsLoadingSuburbs] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [allDiscoveredSuburbs, setAllDiscoveredSuburbs] = useState<SuburbWithCoords[]>([]);

  const isValid = data.maxTravelDistanceKm >= 5 && data.baseAddress && data.baseAddressLat !== null;

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Load Google Maps script
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { console.error("Google Maps API key not found"); return; }
    if (window.google?.maps) { setMapLoaded(true); return; }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || googleMapRef.current) return;

    const defaultCenter = { lat: -33.8688, lng: 151.2093 };
    const center = data.baseAddressLat && data.baseAddressLng
      ? { lat: data.baseAddressLat, lng: data.baseAddressLng }
      : defaultCenter;

    googleMapRef.current = new google.maps.Map(mapRef.current, {
      center,
      zoom: 10,
      mapTypeId: "roadmap",
      disableDefaultUI: true,
      zoomControl: true,
      styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
    });

    if (data.baseAddressLat && data.baseAddressLng) {
      createMarker({ lat: data.baseAddressLat, lng: data.baseAddressLng });
    }
  }, [mapLoaded]);

  // Auto-geocode pre-filled address on mount
  useEffect(() => {
    if (!mapLoaded || hasAutoGeocodedRef.current) return;
    if (!data.baseAddress) return;

    // If we already have coords, just ensure map is centered
    if (data.baseAddressLat && data.baseAddressLng) {
      hasAutoGeocodedRef.current = true;
      return;
    }

    // Geocode the pre-filled address
    hasAutoGeocodedRef.current = true;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: data.baseAddress, componentRestrictions: { country: "au" } }, (results, status) => {
      if (status === "OK" && results?.[0]?.geometry?.location) {
        const lat = results[0].geometry.location.lat();
        const lng = results[0].geometry.location.lng();
        const address = results[0].formatted_address || data.baseAddress;
        onChange({ ...dataRef.current, baseAddress: address, baseAddressLat: lat, baseAddressLng: lng });
        updateMapCenter({ lat, lng });
      }
    });
  }, [mapLoaded, data.baseAddress]);

  const createMarker = (position: google.maps.LatLngLiteral) => {
    if (markerRef.current) markerRef.current.setMap(null);
    if (!googleMapRef.current) return;
    markerRef.current = new google.maps.Marker({
      map: googleMapRef.current,
      position,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#16a34a",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
    });
  };

  const updateMapCenter = (center: google.maps.LatLngLiteral) => {
    if (!googleMapRef.current) return;
    googleMapRef.current.setCenter(center);
    createMarker(center);
    // Fit to radius bounds
    const circle = new google.maps.Circle({ center, radius: dataRef.current.maxTravelDistanceKm * 1000 });
    const bounds = circle.getBounds();
    if (bounds) googleMapRef.current.fitBounds(bounds);
  };

  // Draw suburb outlines on map
  const drawSuburbOutlines = useCallback((suburbs: SuburbWithCoords[], selectedNames: string[]) => {
    // Clear existing polygons
    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current = [];
    if (!googleMapRef.current || suburbs.length === 0) return;

    const selected = suburbs.filter(s => selectedNames.includes(s.name));
    const deselected = suburbs.filter(s => !selectedNames.includes(s.name));

    // Draw approximate suburb areas as circles converted to polygons
    const drawSuburbArea = (suburb: SuburbWithCoords, isSelected: boolean) => {
      // Create a small polygon circle around each suburb point (~2km radius, 12 sides)
      const points: google.maps.LatLngLiteral[] = [];
      const radiusKm = Math.max(1.5, dataRef.current.maxTravelDistanceKm * 0.06);
      for (let i = 0; i < 12; i++) {
        const angle = (i * 360) / 12;
        const point = google.maps.geometry.spherical.computeOffset(
          new google.maps.LatLng(suburb.lat, suburb.lng),
          radiusKm * 1000,
          angle
        );
        points.push({ lat: point.lat(), lng: point.lng() });
      }

      const polygon = new google.maps.Polygon({
        paths: points,
        map: googleMapRef.current,
        fillColor: isSelected ? "#22c55e" : "#94a3b8",
        fillOpacity: isSelected ? 0.25 : 0.08,
        strokeColor: isSelected ? "#16a34a" : "#94a3b8",
        strokeWeight: isSelected ? 1.5 : 0.5,
        strokeOpacity: isSelected ? 0.8 : 0.3,
      });
      polygonsRef.current.push(polygon);
    };

    deselected.forEach(s => drawSuburbArea(s, false));
    selected.forEach(s => drawSuburbArea(s, true));

    // If we have selected suburbs, also draw an outer boundary (convex hull)
    if (selected.length >= 3) {
      const outerPoints = computeConvexHull(selected.map(s => ({ lat: s.lat, lng: s.lng })));
      // Expand the hull slightly
      if (outerPoints.length >= 3) {
        const center = {
          lat: outerPoints.reduce((s, p) => s + p.lat, 0) / outerPoints.length,
          lng: outerPoints.reduce((s, p) => s + p.lng, 0) / outerPoints.length,
        };
        const expanded = outerPoints.map(p => {
          const dlat = p.lat - center.lat;
          const dlng = p.lng - center.lng;
          return { lat: center.lat + dlat * 1.15, lng: center.lng + dlng * 1.15 };
        });
        const boundary = new google.maps.Polygon({
          paths: expanded,
          map: googleMapRef.current,
          fillColor: "#22c55e",
          fillOpacity: 0.05,
          strokeColor: "#16a34a",
          strokeWeight: 2,
          strokeOpacity: 0.6,
        });
        polygonsRef.current.push(boundary);
      }
    }

    // Fit map to show all suburbs
    if (suburbs.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      suburbs.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
      if (data.baseAddressLat && data.baseAddressLng) {
        bounds.extend({ lat: data.baseAddressLat, lng: data.baseAddressLng });
      }
      googleMapRef.current.fitBounds(bounds, 40);
    }
  }, [data.baseAddressLat, data.baseAddressLng]);

  // Redraw outlines when selection changes
  useEffect(() => {
    if (allDiscoveredSuburbs.length > 0) {
      drawSuburbOutlines(allDiscoveredSuburbs, data.servicedSuburbs);
    }
  }, [data.servicedSuburbs, allDiscoveredSuburbs, drawSuburbOutlines]);

  // Initialize autocomplete
  useEffect(() => {
    if (!mapLoaded || !inputRef.current || autocompleteRef.current) return;

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "au" },
      types: ["address"],
    });

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current?.getPlace();
      if (place?.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address || "";
        onChange({ ...dataRef.current, baseAddress: address, baseAddressLat: lat, baseAddressLng: lng });
        updateMapCenter({ lat, lng });
      }
    });
  }, [mapLoaded]);

  // Suburb discovery via reverse geocoding
  const fetchSuburbsInRadius = useCallback(async (lat: number, lng: number, radiusKm: number) => {
    if (!mapLoaded) return;
    setIsLoadingSuburbs(true);

    try {
      const suburbMap = new Map<string, SuburbWithCoords>();
      const center = new google.maps.LatLng(lat, lng);
      const distances = [0, 0.25, 0.5, 0.75, 1];
      const angles = [0, 45, 90, 135, 180, 225, 270, 315];
      const geocoder = new google.maps.Geocoder();

      const geocodePoint = (latP: number, lngP: number): Promise<SuburbWithCoords | null> => {
        return new Promise((resolve) => {
          geocoder.geocode({ location: { lat: latP, lng: lngP } }, (results, status) => {
            if (status === "OK" && results?.[0]) {
              const comp = results[0].address_components.find(
                c => c.types.includes("locality") || c.types.includes("sublocality")
              );
              if (comp) {
                resolve({ name: comp.long_name, lat: latP, lng: lngP });
              } else {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          });
        });
      };

      // Center point
      const centerResult = await geocodePoint(lat, lng);
      if (centerResult) suburbMap.set(centerResult.name, centerResult);

      for (const distFrac of distances) {
        for (const angle of angles) {
          if (distFrac === 0) continue;
          const point = google.maps.geometry.spherical.computeOffset(center, radiusKm * 1000 * distFrac, angle);
          await new Promise(r => setTimeout(r, 50));
          const result = await geocodePoint(point.lat(), point.lng());
          if (result && !suburbMap.has(result.name)) {
            suburbMap.set(result.name, result);
          }
        }
      }

      const suburbsArray = Array.from(suburbMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setAllDiscoveredSuburbs(suburbsArray);
      onChange({ ...dataRef.current, servicedSuburbs: suburbsArray.map(s => s.name) });
    } catch (error) {
      console.error("Error fetching suburbs:", error);
    } finally {
      setIsLoadingSuburbs(false);
    }
  }, [mapLoaded, onChange]);

  // Debounced suburb fetch
  useEffect(() => {
    if (!data.baseAddressLat || !data.baseAddressLng) return;
    const timer = setTimeout(() => {
      fetchSuburbsInRadius(data.baseAddressLat!, data.baseAddressLng!, data.maxTravelDistanceKm);
    }, 500);
    return () => clearTimeout(timer);
  }, [data.baseAddressLat, data.baseAddressLng, data.maxTravelDistanceKm, fetchSuburbsInRadius]);

  const toggleSuburb = (suburb: string) => {
    const isSelected = data.servicedSuburbs.includes(suburb);
    if (isSelected) {
      onChange({ ...data, servicedSuburbs: data.servicedSuburbs.filter(s => s !== suburb) });
    } else {
      onChange({ ...data, servicedSuburbs: [...data.servicedSuburbs, suburb].sort() });
    }
  };

  const selectAllSuburbs = () => onChange({ ...data, servicedSuburbs: allDiscoveredSuburbs.map(s => s.name) });
  const deselectAllSuburbs = () => onChange({ ...data, servicedSuburbs: [] });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Geographic Reach</CardTitle>
            <CardDescription>Set your maximum travel distance for jobs</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Base Address */}
        <div className="space-y-3">
          <Label htmlFor="base-address">
            Base address for service area <span className="text-destructive">*</span>
          </Label>
          <p className="text-sm text-muted-foreground">
            This is where you'll travel from to reach jobs.
          </p>
          <div className="relative">
            <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              id="base-address"
              placeholder="Start typing your address..."
              defaultValue={data.baseAddress}
              className="pl-10"
            />
          </div>
          {data.baseAddress && data.baseAddressLat && (
            <p className="text-sm text-primary flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {data.baseAddress}
            </p>
          )}
        </div>

        {/* Map */}
        <div className="space-y-3">
          <Label>Service Area Preview</Label>
          <div
            ref={mapRef}
            className="w-full h-64 md:h-80 rounded-lg border border-border bg-muted"
            style={{ minHeight: "256px" }}
          >
            {!mapLoaded && (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* Radius Slider */}
        <div className="space-y-4">
          <Label>Maximum travel distance from your base</Label>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">5 km</span>
            <span className="text-2xl font-bold text-primary">{data.maxTravelDistanceKm} km</span>
            <span className="text-sm text-muted-foreground">50 km</span>
          </div>
          <Slider
            value={[data.maxTravelDistanceKm]}
            onValueChange={([value]) => onChange({ ...data, maxTravelDistanceKm: value })}
            min={5}
            max={50}
            step={5}
            className="w-full"
          />
        </div>

        {/* Suburbs */}
        {data.baseAddressLat && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Select suburbs to service</Label>
              {isLoadingSuburbs && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Finding suburbs...
                </span>
              )}
            </div>

            {allDiscoveredSuburbs.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllSuburbs}
                    disabled={data.servicedSuburbs.length === allDiscoveredSuburbs.length}>
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAllSuburbs}
                    disabled={data.servicedSuburbs.length === 0}>
                    Deselect All
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {data.servicedSuburbs.length} of {allDiscoveredSuburbs.length} selected
                  </span>
                </div>
                <ScrollArea className="h-48 md:h-56 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
                    {allDiscoveredSuburbs.map((suburb) => {
                      const isSelected = data.servicedSuburbs.includes(suburb.name);
                      return (
                        <div
                          key={suburb.name}
                          className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded-md"
                          onClick={() => toggleSuburb(suburb.name)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSuburb(suburb.name)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className={`text-sm truncate ${isSelected ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                            {suburb.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="h-20 rounded-lg border border-dashed border-border flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {isLoadingSuburbs ? "Loading..." : "No suburbs found yet"}
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Click to deselect any suburbs you don't want to service. You'll only receive job notifications for selected suburbs.
            </p>
          </div>
        )}

        {/* Tip */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Tip:</strong> A larger radius means more job opportunities, but consider fuel costs and travel time when setting your maximum distance.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <Button onClick={onNext} disabled={!isValid} className="gap-2">
            Continue <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Convex hull (Graham scan)
function computeConvexHull(points: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.lng - b.lng || a.lat - b.lat);

  const cross = (o: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

  const lower: { lat: number; lng: number }[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }

  const upper: { lat: number; lng: number }[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
