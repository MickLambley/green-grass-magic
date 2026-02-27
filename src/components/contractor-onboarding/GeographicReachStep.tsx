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
  boundary?: google.maps.LatLngLiteral[][] | null; // polygon rings
}

interface GeographicReachStepProps {
  data: GeographicData;
  onChange: (data: GeographicData) => void;
  onNext: () => void;
  onBack: () => void;
}

// Fetch suburb boundary from Nominatim (OpenStreetMap)
async function fetchSuburbBoundary(
  suburbName: string,
  nearLat: number,
  nearLng: number
): Promise<google.maps.LatLngLiteral[][] | null> {
  try {
    const query = encodeURIComponent(`${suburbName}, Australia`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&polygon_geojson=1&limit=3&countrycodes=au&viewbox=${nearLng - 0.5},${nearLat + 0.5},${nearLng + 0.5},${nearLat - 0.5}&bounded=0`;

    const res = await fetch(url, {
      headers: { "User-Agent": "YardlyApp/1.0" },
    });
    if (!res.ok) return null;

    const results = await res.json();
    if (!results || results.length === 0) return null;

    // Find the best match - prefer results that are suburbs/towns/villages
    const match =
      results.find(
        (r: any) =>
          r.geojson &&
          (r.type === "suburb" || r.type === "town" || r.type === "village" || r.type === "city" || r.type === "hamlet") &&
          (r.geojson.type === "Polygon" || r.geojson.type === "MultiPolygon")
      ) ||
      results.find(
        (r: any) =>
          r.geojson &&
          (r.geojson.type === "Polygon" || r.geojson.type === "MultiPolygon")
      );

    if (!match?.geojson) return null;

    const geojson = match.geojson;

    if (geojson.type === "Polygon") {
      // Polygon: array of rings, each ring is array of [lng, lat]
      return geojson.coordinates.map((ring: number[][]) =>
        ring.map((coord: number[]) => ({ lat: coord[1], lng: coord[0] }))
      );
    } else if (geojson.type === "MultiPolygon") {
      // MultiPolygon: flatten all polygons into rings
      const rings: google.maps.LatLngLiteral[][] = [];
      for (const polygon of geojson.coordinates) {
        for (const ring of polygon) {
          rings.push(
            ring.map((coord: number[]) => ({ lat: coord[1], lng: coord[0] }))
          );
        }
      }
      return rings;
    }

    return null;
  } catch (err) {
    console.warn(`Failed to fetch boundary for ${suburbName}:`, err);
    return null;
  }
}

export const GeographicReachStep = ({ data, onChange, onNext, onBack }: GeographicReachStepProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  const onChangeRef = useRef(onChange);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const hasAutoGeocodedRef = useRef(false);
  const boundaryCache = useRef<Map<string, google.maps.LatLngLiteral[][] | null>>(new Map());

  const [isLoadingSuburbs, setIsLoadingSuburbs] = useState(false);
  const [isLoadingBoundaries, setIsLoadingBoundaries] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [allDiscoveredSuburbs, setAllDiscoveredSuburbs] = useState<SuburbWithCoords[]>([]);

  const isValid = data.maxTravelDistanceKm >= 5 && data.baseAddress && data.baseAddressLat !== null;

  // Keep refs in sync
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

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

    if (data.baseAddressLat && data.baseAddressLng) {
      hasAutoGeocodedRef.current = true;
      return;
    }

    hasAutoGeocodedRef.current = true;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode(
      { address: data.baseAddress, componentRestrictions: { country: "au" } },
      (results, status) => {
        if (status === "OK" && results?.[0]?.geometry?.location) {
          const lat = results[0].geometry.location.lat();
          const lng = results[0].geometry.location.lng();
          const address = results[0].formatted_address || data.baseAddress;
          onChangeRef.current({
            ...dataRef.current,
            baseAddress: address,
            baseAddressLat: lat,
            baseAddressLng: lng,
          });
          updateMapCenter({ lat, lng });
        }
      }
    );
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
    const circle = new google.maps.Circle({
      center,
      radius: dataRef.current.maxTravelDistanceKm * 1000,
    });
    const bounds = circle.getBounds();
    if (bounds) googleMapRef.current.fitBounds(bounds);
  };

  // Fetch boundaries from Nominatim for all suburbs
  const fetchBoundaries = useCallback(
    async (suburbs: SuburbWithCoords[]): Promise<SuburbWithCoords[]> => {
      setIsLoadingBoundaries(true);
      const updated: SuburbWithCoords[] = [];
      const baseLat = dataRef.current.baseAddressLat || -33.87;
      const baseLng = dataRef.current.baseAddressLng || 151.21;

      for (const suburb of suburbs) {
        // Check cache first
        if (boundaryCache.current.has(suburb.name)) {
          updated.push({ ...suburb, boundary: boundaryCache.current.get(suburb.name) });
          continue;
        }

        // Rate limit: 1 req/sec for Nominatim
        await new Promise((r) => setTimeout(r, 1100));
        const boundary = await fetchSuburbBoundary(suburb.name, baseLat, baseLng);
        boundaryCache.current.set(suburb.name, boundary);
        updated.push({ ...suburb, boundary });
      }

      setIsLoadingBoundaries(false);
      return updated;
    },
    []
  );

  // Draw suburb polygons on map
  const drawSuburbPolygons = useCallback(
    (suburbs: SuburbWithCoords[], selectedNames: string[]) => {
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
      if (!googleMapRef.current || suburbs.length === 0) return;

      const bounds = new google.maps.LatLngBounds();
      if (dataRef.current.baseAddressLat && dataRef.current.baseAddressLng) {
        bounds.extend({
          lat: dataRef.current.baseAddressLat,
          lng: dataRef.current.baseAddressLng,
        });
      }

      for (const suburb of suburbs) {
        const isSelected = selectedNames.includes(suburb.name);

        if (suburb.boundary && suburb.boundary.length > 0) {
          // Draw real boundary polygon
          for (const ring of suburb.boundary) {
            const polygon = new google.maps.Polygon({
              paths: ring,
              map: googleMapRef.current,
              fillColor: isSelected ? "#22c55e" : "#94a3b8",
              fillOpacity: isSelected ? 0.25 : 0.06,
              strokeColor: isSelected ? "#16a34a" : "#94a3b8",
              strokeWeight: isSelected ? 2 : 0.5,
              strokeOpacity: isSelected ? 0.9 : 0.3,
            });
            polygonsRef.current.push(polygon);
            ring.forEach((p) => bounds.extend(p));
          }
        } else {
          // Fallback: draw a small circle marker for suburbs with no boundary data
          const fallbackCircle = new google.maps.Circle({
            center: { lat: suburb.lat, lng: suburb.lng },
            radius: 800,
            map: googleMapRef.current,
            fillColor: isSelected ? "#22c55e" : "#94a3b8",
            fillOpacity: isSelected ? 0.3 : 0.1,
            strokeColor: isSelected ? "#16a34a" : "#94a3b8",
            strokeWeight: isSelected ? 1.5 : 0.5,
          });
          // Store as polygon-like for cleanup (Circle has setMap too)
          polygonsRef.current.push(fallbackCircle as any);
          bounds.extend({ lat: suburb.lat, lng: suburb.lng });
        }
      }

      googleMapRef.current.fitBounds(bounds, 40);
    },
    []
  );

  // Redraw when selection changes
  useEffect(() => {
    if (allDiscoveredSuburbs.length > 0) {
      drawSuburbPolygons(allDiscoveredSuburbs, data.servicedSuburbs);
    }
  }, [data.servicedSuburbs, allDiscoveredSuburbs, drawSuburbPolygons]);

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
        onChangeRef.current({
          ...dataRef.current,
          baseAddress: address,
          baseAddressLat: lat,
          baseAddressLng: lng,
        });
        updateMapCenter({ lat, lng });
      }
    });
  }, [mapLoaded]);

  // Suburb discovery via reverse geocoding
  const fetchSuburbsInRadius = useCallback(
    async (lat: number, lng: number, radiusKm: number) => {
      if (!mapLoaded) return;
      setIsLoadingSuburbs(true);

      try {
        const suburbMap = new Map<string, SuburbWithCoords>();
        const center = new google.maps.LatLng(lat, lng);
        const distances = [0, 0.25, 0.5, 0.75, 1];
        const angles = [0, 45, 90, 135, 180, 225, 270, 315];
        const geocoder = new google.maps.Geocoder();

        const geocodePoint = (
          latP: number,
          lngP: number
        ): Promise<SuburbWithCoords | null> => {
          return new Promise((resolve) => {
            geocoder.geocode(
              { location: { lat: latP, lng: lngP } },
              (results, status) => {
                if (status === "OK" && results?.[0]) {
                  const comp = results[0].address_components.find(
                    (c) =>
                      c.types.includes("locality") ||
                      c.types.includes("sublocality")
                  );
                  if (comp) {
                    resolve({ name: comp.long_name, lat: latP, lng: lngP });
                  } else {
                    resolve(null);
                  }
                } else {
                  resolve(null);
                }
              }
            );
          });
        };

        const centerResult = await geocodePoint(lat, lng);
        if (centerResult) suburbMap.set(centerResult.name, centerResult);

        for (const distFrac of distances) {
          for (const angle of angles) {
            if (distFrac === 0) continue;
            const point = google.maps.geometry.spherical.computeOffset(
              center,
              radiusKm * 1000 * distFrac,
              angle
            );
            await new Promise((r) => setTimeout(r, 50));
            const result = await geocodePoint(point.lat(), point.lng());
            if (result && !suburbMap.has(result.name)) {
              suburbMap.set(result.name, result);
            }
          }
        }

        const suburbsArray = Array.from(suburbMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        // Now fetch real boundaries from Nominatim
        const suburbsWithBoundaries = await fetchBoundaries(suburbsArray);
        setAllDiscoveredSuburbs(suburbsWithBoundaries);
        onChangeRef.current({
          ...dataRef.current,
          servicedSuburbs: suburbsWithBoundaries.map((s) => s.name),
        });
      } catch (error) {
        console.error("Error fetching suburbs:", error);
      } finally {
        setIsLoadingSuburbs(false);
      }
    },
    [mapLoaded, fetchBoundaries]
  );

  // Debounced suburb fetch
  useEffect(() => {
    if (!data.baseAddressLat || !data.baseAddressLng) return;
    const timer = setTimeout(() => {
      fetchSuburbsInRadius(
        data.baseAddressLat!,
        data.baseAddressLng!,
        data.maxTravelDistanceKm
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [
    data.baseAddressLat,
    data.baseAddressLng,
    data.maxTravelDistanceKm,
    fetchSuburbsInRadius,
  ]);

  const toggleSuburb = (suburb: string) => {
    const isSelected = data.servicedSuburbs.includes(suburb);
    if (isSelected) {
      onChange({
        ...data,
        servicedSuburbs: data.servicedSuburbs.filter((s) => s !== suburb),
      });
    } else {
      onChange({
        ...data,
        servicedSuburbs: [...data.servicedSuburbs, suburb].sort(),
      });
    }
  };

  const selectAllSuburbs = () =>
    onChange({
      ...data,
      servicedSuburbs: allDiscoveredSuburbs.map((s) => s.name),
    });
  const deselectAllSuburbs = () =>
    onChange({ ...data, servicedSuburbs: [] });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Geographic Reach</CardTitle>
            <CardDescription>
              Set your maximum travel distance for jobs
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Base Address */}
        <div className="space-y-3">
          <Label htmlFor="base-address">
            Base address for service area{" "}
            <span className="text-destructive">*</span>
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
            <span className="text-2xl font-bold text-primary">
              {data.maxTravelDistanceKm} km
            </span>
            <span className="text-sm text-muted-foreground">50 km</span>
          </div>
          <Slider
            value={[data.maxTravelDistanceKm]}
            onValueChange={([value]) =>
              onChange({ ...data, maxTravelDistanceKm: value })
            }
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
              {(isLoadingSuburbs || isLoadingBoundaries) && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {isLoadingSuburbs
                    ? "Finding suburbs..."
                    : "Loading boundaries..."}
                </span>
              )}
            </div>

            {allDiscoveredSuburbs.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllSuburbs}
                    disabled={
                      data.servicedSuburbs.length ===
                      allDiscoveredSuburbs.length
                    }
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deselectAllSuburbs}
                    disabled={data.servicedSuburbs.length === 0}
                  >
                    Deselect All
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {data.servicedSuburbs.length} of{" "}
                    {allDiscoveredSuburbs.length} selected
                  </span>
                </div>
                <ScrollArea className="h-48 md:h-56 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
                    {allDiscoveredSuburbs.map((suburb) => {
                      const isSelected = data.servicedSuburbs.includes(
                        suburb.name
                      );
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
                          <span
                            className={`text-sm truncate ${
                              isSelected
                                ? "text-foreground font-medium"
                                : "text-muted-foreground"
                            }`}
                          >
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
              Click to deselect any suburbs you don't want to service. You'll
              only receive job notifications for selected suburbs.
            </p>
          </div>
        )}

        {/* Tip */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Tip:</strong> A larger radius means more job opportunities,
            but consider fuel costs and travel time when setting your maximum
            distance.
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
