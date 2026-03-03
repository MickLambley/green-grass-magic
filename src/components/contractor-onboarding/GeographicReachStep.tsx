import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, MapPin, Loader2, Navigation, Plus, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { GeographicData } from "./types";

interface SuburbWithCoords {
  name: string;
  state: string;
  lat: number;
  lng: number;
  boundary?: google.maps.LatLngLiteral[][] | null;
}

interface GeographicReachStepProps {
  data: GeographicData;
  onChange: (data: GeographicData) => void;
  onNext: () => void;
  onBack: () => void;
}

// Fetch boundaries via edge function (server-side cache + Nominatim fallback)
async function fetchBoundariesBatch(
  suburbs: { name: string; lat: number; lng: number }[],
): Promise<Map<string, google.maps.LatLngLiteral[][] | null>> {
  const result = new Map<string, google.maps.LatLngLiteral[][] | null>();
  if (suburbs.length === 0) return result;

  try {
    const { data, error } = await supabase.functions.invoke("get-suburb-boundaries", {
      body: { suburbs: suburbs.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng })) },
    });

    if (error) {
      console.error("Edge function error:", error);
      return result;
    }

    if (data?.results) {
      for (const r of data.results) {
        const boundary = r.boundary && Array.isArray(r.boundary) && r.boundary.length > 0 ? r.boundary : null;
        result.set(r.name, boundary);
      }
    }
  } catch (err) {
    console.error("Failed to fetch boundaries:", err);
  }

  return result;
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
  const [manualSuburbSearch, setManualSuburbSearch] = useState("");
  const [manualSuburbResults, setManualSuburbResults] = useState<{ suburb: string; lat: number; lng: number }[]>([]);
  const [isSearchingSuburbs, setIsSearchingSuburbs] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const isInitialLoadRef = useRef(true);

  const isValid = data.maxTravelDistanceKm >= 5 && data.baseAddress && data.baseAddressLat !== null;

  // Keep refs in sync
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Load Google Maps script
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key not found");
      return;
    }
    if (window.google?.maps) {
      setMapLoaded(true);
      return;
    }

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
    const center =
      data.baseAddressLat && data.baseAddressLng
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
    geocoder.geocode({ address: data.baseAddress, componentRestrictions: { country: "au" } }, (results, status) => {
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
    const circle = new google.maps.Circle({
      center,
      radius: dataRef.current.maxTravelDistanceKm * 1000,
    });
    const bounds = circle.getBounds();
    if (bounds) googleMapRef.current.fitBounds(bounds);
  };

// Fetch boundaries via server-side cache (batched for speed)
  const fetchBoundaries = useCallback(async (suburbs: SuburbWithCoords[]): Promise<SuburbWithCoords[]> => {
    setIsLoadingBoundaries(true);

    // Check local cache first, identify uncached
    const uncached: { name: string; lat: number; lng: number }[] = [];
    const results: SuburbWithCoords[] = suburbs.map((suburb) => {
      if (boundaryCache.current.has(suburb.name)) {
        return { ...suburb, boundary: boundaryCache.current.get(suburb.name) };
      }
      uncached.push({ name: suburb.name, lat: suburb.lat, lng: suburb.lng });
      return suburb;
    });

    if (uncached.length > 0) {
      // Split into batches of 15 for parallel processing
      const BATCH_SIZE = 15;
      const batches: typeof uncached[] = [];
      for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
        batches.push(uncached.slice(i, i + BATCH_SIZE));
      }

      // Fire all batches in parallel
      const batchResults = await Promise.all(batches.map((batch) => fetchBoundariesBatch(batch)));
      
      // Merge all results
      const mergedMap = new Map<string, google.maps.LatLngLiteral[][] | null>();
      for (const batchMap of batchResults) {
        batchMap.forEach((v, k) => mergedMap.set(k, v));
      }

      for (let i = 0; i < results.length; i++) {
        if (mergedMap.has(results[i].name)) {
          const boundary = mergedMap.get(results[i].name)!;
          boundaryCache.current.set(results[i].name, boundary);
          results[i] = { ...results[i], boundary };
        }
      }
    }

    setIsLoadingBoundaries(false);
    return results;
  }, []);

  // Draw suburb polygons on map
  const drawSuburbPolygons = useCallback((suburbs: SuburbWithCoords[], selectedNames: string[], fitBounds = false) => {
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];
    if (!googleMapRef.current || suburbs.length === 0) return;

    const bounds = fitBounds ? new google.maps.LatLngBounds() : null;
    if (bounds && dataRef.current.baseAddressLat && dataRef.current.baseAddressLng) {
      bounds.extend({
        lat: dataRef.current.baseAddressLat,
        lng: dataRef.current.baseAddressLng,
      });
    }

    for (const suburb of suburbs) {
      const isSelected = selectedNames.includes(suburb.name);

      if (suburb.boundary && suburb.boundary.length > 0) {
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
          if (bounds) ring.forEach((p) => bounds.extend(p));
        }
      } else {
        const fallbackCircle = new google.maps.Circle({
          center: { lat: suburb.lat, lng: suburb.lng },
          radius: 800,
          map: googleMapRef.current,
          fillColor: isSelected ? "#22c55e" : "#94a3b8",
          fillOpacity: isSelected ? 0.3 : 0.1,
          strokeColor: isSelected ? "#16a34a" : "#94a3b8",
          strokeWeight: isSelected ? 1.5 : 0.5,
        });
        polygonsRef.current.push(fallbackCircle as any);
        if (bounds) bounds.extend({ lat: suburb.lat, lng: suburb.lng });
      }
    }

    if (bounds) googleMapRef.current.fitBounds(bounds, 40);
  }, []);

  // Redraw when selection changes (no zoom reset)
  useEffect(() => {
    if (allDiscoveredSuburbs.length > 0) {
      drawSuburbPolygons(allDiscoveredSuburbs, data.servicedSuburbs, false);
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

  // Suburb discovery via australian_postcodes database table
  const fetchSuburbsInRadius = useCallback(
    async (lat: number, lng: number, radiusKm: number) => {
      setIsLoadingSuburbs(true);
      setLoadingProgress(10);

      try {
        setLoadingProgress(30);
        const { data: result, error } = await supabase.functions.invoke("get-suburbs-in-radius", {
          body: { lat, lng, radius_km: radiusKm },
        });

        if (error) {
          console.error("Error fetching suburbs:", error);
          return;
        }

        setLoadingProgress(50);
        const suburbsArray: SuburbWithCoords[] = [];
        const seen = new Set<string>();

        for (const s of result?.suburbs || []) {
          if (!seen.has(s.suburb)) {
            seen.add(s.suburb);
            suburbsArray.push({ name: s.suburb, lat: 0, lng: 0 });
          }
        }

        const suburbNames = suburbsArray.map((s) => s.name);
        const { data: postcodeData } = await supabase
          .from("australian_postcodes")
          .select("suburb, lat, lng")
          .in("suburb", suburbNames);

        setLoadingProgress(70);
        if (postcodeData) {
          const coordMap = new Map<string, { lat: number; lng: number }>();
          for (const p of postcodeData) {
            if (!coordMap.has(p.suburb)) {
              coordMap.set(p.suburb, { lat: Number(p.lat), lng: Number(p.lng) });
            }
          }
          for (const s of suburbsArray) {
            const coords = coordMap.get(s.name);
            if (coords) { s.lat = coords.lat; s.lng = coords.lng; }
          }
        }

        suburbsArray.sort((a, b) => a.name.localeCompare(b.name));
        setLoadingProgress(85);

        const suburbsWithBoundaries = await fetchBoundaries(suburbsArray);
        setLoadingProgress(100);
        setAllDiscoveredSuburbs(suburbsWithBoundaries);
        
        // Fit bounds on initial load / radius change
        isInitialLoadRef.current = true;
        setTimeout(() => {
          drawSuburbPolygons(suburbsWithBoundaries, suburbsWithBoundaries.map((s) => s.name), true);
          isInitialLoadRef.current = false;
        }, 50);

        onChangeRef.current({
          ...dataRef.current,
          servicedSuburbs: suburbsWithBoundaries.map((s) => s.name),
        });
      } catch (error) {
        console.error("Error fetching suburbs:", error);
      } finally {
        setIsLoadingSuburbs(false);
        setTimeout(() => setLoadingProgress(0), 500);
      }
    },
    [fetchBoundaries, drawSuburbPolygons],
  );

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
  const deselectAllSuburbs = () => onChange({ ...data, servicedSuburbs: [] });

  // Manual suburb search with autocomplete
  useEffect(() => {
    if (manualSuburbSearch.length < 2) {
      setManualSuburbResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingSuburbs(true);
      try {
        const { data: results } = await supabase
          .from("australian_postcodes")
          .select("suburb, lat, lng")
          .ilike("suburb", `${manualSuburbSearch}%`)
          .limit(20);
        
        if (results) {
          // Deduplicate and exclude already-discovered suburbs
          const seen = new Set<string>();
          const filtered: { suburb: string; lat: number; lng: number }[] = [];
          for (const r of results) {
            if (!seen.has(r.suburb)) {
              seen.add(r.suburb);
              filtered.push({ suburb: r.suburb, lat: Number(r.lat), lng: Number(r.lng) });
            }
          }
          setManualSuburbResults(filtered);
        }
      } catch (err) {
        console.error("Suburb search error:", err);
      } finally {
        setIsSearchingSuburbs(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [manualSuburbSearch]);

  const addManualSuburb = async (suburb: { suburb: string; lat: number; lng: number }) => {
    const alreadyExists = allDiscoveredSuburbs.some((s) => s.name === suburb.suburb);
    if (!alreadyExists) {
      const newSuburb: SuburbWithCoords = { name: suburb.suburb, lat: suburb.lat, lng: suburb.lng };
      const withBoundaries = await fetchBoundaries([newSuburb]);
      const updated = [...allDiscoveredSuburbs, ...withBoundaries].sort((a, b) => a.name.localeCompare(b.name));
      setAllDiscoveredSuburbs(updated);
    }
    if (!data.servicedSuburbs.includes(suburb.suburb)) {
      onChange({ ...data, servicedSuburbs: [...data.servicedSuburbs, suburb.suburb].sort() });
    }
    setManualSuburbSearch("");
    setManualSuburbResults([]);
  };

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
          <p className="text-sm text-muted-foreground">This is where you'll travel from to reach jobs.</p>
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
              {(isLoadingSuburbs || isLoadingBoundaries) && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {isLoadingSuburbs ? "Finding suburbs..." : "Loading boundaries..."}
                </span>
              )}
            </div>

            {/* Progress bar */}
            {loadingProgress > 0 && (
              <div className="space-y-1">
                <Progress value={loadingProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {loadingProgress < 50 ? "Discovering suburbs..." : loadingProgress < 85 ? "Fetching coordinates..." : "Loading boundaries..."}
                </p>
              </div>
            )}

            {allDiscoveredSuburbs.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllSuburbs}
                    disabled={data.servicedSuburbs.length === allDiscoveredSuburbs.length}
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
                          <span
                            className={`text-sm truncate ${
                              isSelected ? "text-foreground font-medium" : "text-muted-foreground"
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

            {/* Manual suburb entry */}
            <div className="space-y-2">
              <Label className="text-sm">Add a suburb outside your radius</Label>
              <div className="relative">
                <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Type suburb name..."
                  value={manualSuburbSearch}
                  onChange={(e) => setManualSuburbSearch(e.target.value)}
                  className="pl-10"
                />
                {isSearchingSuburbs && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {manualSuburbResults.length > 0 && (
                <div className="rounded-lg border border-border bg-background shadow-md max-h-48 overflow-y-auto">
                  {manualSuburbResults.map((r) => {
                    const alreadySelected = data.servicedSuburbs.includes(r.suburb);
                    return (
                      <button
                        key={r.suburb}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
                        onClick={() => addManualSuburb(r)}
                        disabled={alreadySelected}
                      >
                        <span className={alreadySelected ? "text-muted-foreground" : "text-foreground"}>
                          {r.suburb}
                        </span>
                        {alreadySelected ? (
                          <span className="text-xs text-muted-foreground">Already added</span>
                        ) : (
                          <Plus className="w-3 h-3 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Click to deselect any suburbs you don't want to service. Customers will only be able to complete online
              bookings for selected suburbs.
            </p>
          </div>
        )}

        {/* Tip */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Tip:</strong> A larger radius means more job opportunities, but consider fuel costs and travel time
            when setting your maximum distance.
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
