/* eslint-disable @typescript-eslint/no-explicit-any */
declare const google: any;
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, MapPin, Loader2, Navigation, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import type { GeographicData } from "./types";

interface SuburbWithCoords {
  name: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
}

interface GeographicReachStepProps {
  data: GeographicData;
  onChange: (data: GeographicData) => void;
  onNext: () => void;
  onBack: () => void;
  hideNavigation?: boolean;
  /** When true, preserve existing suburb selections instead of auto-selecting all on fetch */
  persistSelections?: boolean;
}

export const GeographicReachStep = ({ data, onChange, onNext, onBack, hideNavigation, persistSelections }: GeographicReachStepProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const radiusCircleRef = useRef<any>(null);
  const autocompleteRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  const onChangeRef = useRef(onChange);
  const hasAutoGeocodedRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const manualSuburbsRef = useRef<SuburbWithCoords[]>([]);

  const [isLoadingSuburbs, setIsLoadingSuburbs] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [allDiscoveredSuburbs, setAllDiscoveredSuburbs] = useState<SuburbWithCoords[]>([]);
  const [manualSuburbSearch, setManualSuburbSearch] = useState("");
  const [manualSuburbResults, setManualSuburbResults] = useState<{ suburb: string; state: string; postcode: string; lat: number; lng: number }[]>([]);
  const [isSearchingSuburbs, setIsSearchingSuburbs] = useState(false);

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
      center, zoom: 10, mapTypeId: "roadmap",
      disableDefaultUI: true, zoomControl: true,
      styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
    });

    if (data.baseAddressLat && data.baseAddressLng) {
      updateMapView({ lat: data.baseAddressLat, lng: data.baseAddressLng }, data.maxTravelDistanceKm);
    }
  }, [mapLoaded]);

  // Auto-geocode pre-filled address on mount
  useEffect(() => {
    if (!mapLoaded || hasAutoGeocodedRef.current) return;
    if (!data.baseAddress) return;
    if (data.baseAddressLat && data.baseAddressLng) { hasAutoGeocodedRef.current = true; return; }

    hasAutoGeocodedRef.current = true;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: data.baseAddress, componentRestrictions: { country: "au" } }, (results, status) => {
      if (status === "OK" && results?.[0]?.geometry?.location) {
        const lat = results[0].geometry.location.lat();
        const lng = results[0].geometry.location.lng();
        const address = results[0].formatted_address || data.baseAddress;
        onChangeRef.current({ ...dataRef.current, baseAddress: address, baseAddressLat: lat, baseAddressLng: lng });
        updateMapView({ lat, lng }, dataRef.current.maxTravelDistanceKm);
      }
    });
  }, [mapLoaded, data.baseAddress]);

  const updateMapView = (center: { lat: number; lng: number }, radiusKm: number) => {
    if (!googleMapRef.current) return;

    // Marker
    if (markerRef.current) markerRef.current.setMap(null);
    markerRef.current = new google.maps.Marker({
      map: googleMapRef.current, position: center,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#16a34a", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 },
    });

    // Radius circle
    if (radiusCircleRef.current) radiusCircleRef.current.setMap(null);
    radiusCircleRef.current = new google.maps.Circle({
      map: googleMapRef.current, center, radius: radiusKm * 1000,
      fillColor: "#22c55e", fillOpacity: 0.1,
      strokeColor: "#16a34a", strokeWeight: 2, strokeOpacity: 0.6,
    });

    const bounds = radiusCircleRef.current.getBounds();
    if (bounds) googleMapRef.current.fitBounds(bounds);
  };

  // Update radius circle when slider changes
  useEffect(() => {
    if (!data.baseAddressLat || !data.baseAddressLng) return;
    updateMapView({ lat: data.baseAddressLat, lng: data.baseAddressLng }, data.maxTravelDistanceKm);
  }, [data.maxTravelDistanceKm, data.baseAddressLat, data.baseAddressLng]);

  // Initialize autocomplete
  useEffect(() => {
    if (!mapLoaded || !inputRef.current || autocompleteRef.current) return;
    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "au" }, types: ["address"],
    });
    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current?.getPlace();
      if (place?.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address || "";
        onChangeRef.current({ ...dataRef.current, baseAddress: address, baseAddressLat: lat, baseAddressLng: lng });
        updateMapView({ lat, lng }, dataRef.current.maxTravelDistanceKm);
      }
    });
  }, [mapLoaded]);

  // Suburb discovery via australian_postcodes database table
  const fetchSuburbsInRadius = useCallback(async (lat: number, lng: number, radiusKm: number) => {
    setIsLoadingSuburbs(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("get-suburbs-in-radius", {
        body: { lat, lng, radius_km: radiusKm },
      });
      if (error) { console.error("Error fetching suburbs:", error); return; }

      const suburbsArray: SuburbWithCoords[] = [];
      const seen = new Set<string>();
      for (const s of result?.suburbs || []) {
        const key = `${s.suburb}|${s.postcode}`;
        if (!seen.has(key)) {
          seen.add(key);
          suburbsArray.push({ name: s.suburb, state: s.state || "NSW", postcode: s.postcode || "", lat: 0, lng: 0 });
        }
      }

      const suburbNames = suburbsArray.map((s) => s.name);
      const { data: postcodeData } = await supabase
        .from("australian_postcodes")
        .select("suburb, state, postcode, lat, lng")
        .in("suburb", suburbNames);

      if (postcodeData) {
        const coordMap = new Map<string, { lat: number; lng: number }>();
        for (const p of postcodeData) {
          const key = `${p.suburb}|${p.postcode}`;
          if (!coordMap.has(key)) coordMap.set(key, { lat: Number(p.lat), lng: Number(p.lng) });
        }
        for (const s of suburbsArray) {
          const coords = coordMap.get(`${s.name}|${s.postcode}`);
          if (coords) { s.lat = coords.lat; s.lng = coords.lng; }
        }
      }

      // Merge manually added suburbs that aren't in the radius results
      for (const manual of manualSuburbsRef.current) {
        const key = `${manual.name}|${manual.postcode}`;
        if (!seen.has(key)) {
          seen.add(key);
          suburbsArray.push(manual);
        }
      }

      suburbsArray.sort((a, b) => a.name.localeCompare(b.name));
      setAllDiscoveredSuburbs(suburbsArray);

      const currentData = dataRef.current;

      if (persistSelections && (initialLoadDoneRef.current || currentData.servicedSuburbs.length > 0)) {
        // Preserve existing selections: keep currently selected suburbs that still exist
        // in the new discovered list, and DON'T auto-add newly discovered ones
        const newSuburbIds = new Set(suburbsArray.map((s) => `${s.name}|${s.postcode}`));
        const preserved = currentData.servicedSuburbs.filter((id) => newSuburbIds.has(id));
        onChangeRef.current({
          ...currentData,
          servicedSuburbs: preserved,
        });
      } else {
        // First load or onboarding: select all
        onChangeRef.current({
          ...currentData,
          servicedSuburbs: suburbsArray.map((s) => `${s.name}|${s.postcode}`),
        });
      }
      initialLoadDoneRef.current = true;
    } catch (error) {
      console.error("Error fetching suburbs:", error);
    } finally {
      setIsLoadingSuburbs(false);
    }
  }, [persistSelections]);

  // Debounced suburb fetch
  useEffect(() => {
    if (!data.baseAddressLat || !data.baseAddressLng) return;
    const timer = setTimeout(() => {
      fetchSuburbsInRadius(data.baseAddressLat!, data.baseAddressLng!, data.maxTravelDistanceKm);
    }, 500);
    return () => clearTimeout(timer);
  }, [data.baseAddressLat, data.baseAddressLng, data.maxTravelDistanceKm, fetchSuburbsInRadius]);

  const toggleSuburb = useCallback((suburbId: string) => {
    const isSelected = dataRef.current.servicedSuburbs.includes(suburbId);
    if (isSelected) {
      onChangeRef.current({ ...dataRef.current, servicedSuburbs: dataRef.current.servicedSuburbs.filter((s) => s !== suburbId) });
    } else {
      onChangeRef.current({ ...dataRef.current, servicedSuburbs: [...dataRef.current.servicedSuburbs, suburbId].sort() });
    }
  }, []);

  const selectAllSuburbs = () =>
    onChange({ ...data, servicedSuburbs: allDiscoveredSuburbs.map((s) => `${s.name}|${s.postcode}`) });
  const deselectAllSuburbs = () => onChange({ ...data, servicedSuburbs: [] });

  // Manual suburb search
  useEffect(() => {
    if (manualSuburbSearch.length < 2) { setManualSuburbResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearchingSuburbs(true);
      try {
        const { data: results } = await supabase
          .from("australian_postcodes")
          .select("suburb, state, postcode, lat, lng")
          .ilike("suburb", `${manualSuburbSearch}%`)
          .limit(20);
        if (results) {
          const seen = new Set<string>();
          const filtered: { suburb: string; state: string; postcode: string; lat: number; lng: number }[] = [];
          for (const r of results) {
            const key = `${r.suburb}|${r.postcode}`;
            if (!seen.has(key)) {
              seen.add(key);
              filtered.push({ suburb: r.suburb, state: r.state, postcode: r.postcode, lat: Number(r.lat), lng: Number(r.lng) });
            }
          }
          setManualSuburbResults(filtered);
        }
      } catch (err) { console.error("Suburb search error:", err); }
      finally { setIsSearchingSuburbs(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [manualSuburbSearch]);

  const addManualSuburb = (suburb: { suburb: string; state: string; postcode: string; lat: number; lng: number }) => {
    const newSuburb: SuburbWithCoords = { name: suburb.suburb, state: suburb.state, postcode: suburb.postcode, lat: suburb.lat, lng: suburb.lng };
    const alreadyExists = allDiscoveredSuburbs.some((s) => s.name === suburb.suburb && s.postcode === suburb.postcode);
    if (!alreadyExists) {
      const updated = [...allDiscoveredSuburbs, newSuburb].sort((a, b) => a.name.localeCompare(b.name));
      setAllDiscoveredSuburbs(updated);
    }
    // Track manually added suburbs so they survive radius re-fetches
    if (!manualSuburbsRef.current.some((s) => s.name === suburb.suburb && s.postcode === suburb.postcode)) {
      manualSuburbsRef.current = [...manualSuburbsRef.current, newSuburb];
    }
    const suburbId = `${suburb.suburb}|${suburb.postcode}`;
    if (!data.servicedSuburbs.includes(suburbId)) {
      onChange({ ...data, servicedSuburbs: [...data.servicedSuburbs, suburbId].sort() });
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
            <Input ref={inputRef} id="base-address" placeholder="Start typing your address..." defaultValue={data.baseAddress} className="pl-10" />
          </div>
          {data.baseAddress && data.baseAddressLat && (
            <p className="text-sm text-primary flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {data.baseAddress}
            </p>
          )}
        </div>

        {/* Map */}
        <div className="space-y-3">
          <Label>Service Area Preview</Label>
          <div ref={mapRef} className="w-full h-64 md:h-80 rounded-lg border border-border bg-muted" style={{ minHeight: "256px" }}>
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
            min={5} max={50} step={5} className="w-full"
          />
        </div>

        {/* Suburbs */}
        {data.baseAddressLat && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Select suburbs to service</Label>
              {isLoadingSuburbs && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Finding suburbs...
                </span>
              )}
            </div>

            {allDiscoveredSuburbs.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllSuburbs} disabled={data.servicedSuburbs.length === allDiscoveredSuburbs.length}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={deselectAllSuburbs} disabled={data.servicedSuburbs.length === 0}>Deselect All</Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {data.servicedSuburbs.length} of {allDiscoveredSuburbs.length} selected
                  </span>
                </div>
                <ScrollArea className="h-48 md:h-56 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
                    {allDiscoveredSuburbs.map((suburb) => {
                      const suburbId = `${suburb.name}|${suburb.postcode}`;
                      const isSelected = data.servicedSuburbs.includes(suburbId);
                      const hasDuplicateName = allDiscoveredSuburbs.filter((s) => s.name === suburb.name).length > 1;
                      return (
                        <div
                          key={suburbId}
                          className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded-md"
                          onClick={() => toggleSuburb(suburbId)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSuburb(suburbId)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className={`text-sm truncate ${isSelected ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                            {suburb.name}
                            {hasDuplicateName && <span className="text-xs text-muted-foreground ml-1">({suburb.postcode})</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="h-20 rounded-lg border border-dashed border-border flex items-center justify-center">
                <p className="text-sm text-muted-foreground">{isLoadingSuburbs ? "Loading..." : "No suburbs found yet"}</p>
              </div>
            )}

            {/* Manual suburb entry */}
            <div className="space-y-2">
              <Label className="text-sm">Add a suburb outside your radius</Label>
              <div className="relative">
                <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Type suburb name..." value={manualSuburbSearch} onChange={(e) => setManualSuburbSearch(e.target.value)} className="pl-10" />
                {isSearchingSuburbs && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {manualSuburbResults.length > 0 && (
                <div className="rounded-lg border border-border bg-background shadow-md max-h-48 overflow-y-auto">
                  {manualSuburbResults.map((r) => {
                    const alreadySelected = data.servicedSuburbs.includes(`${r.suburb}|${r.postcode}`);
                    return (
                      <button
                        key={`${r.suburb}|${r.postcode}`}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
                        onClick={() => addManualSuburb(r)}
                        disabled={alreadySelected}
                      >
                        <span className={alreadySelected ? "text-muted-foreground" : "text-foreground"}>
                          {r.suburb} <span className="text-xs text-muted-foreground">({r.state} {r.postcode})</span>
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
        {!hideNavigation && (
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={onBack} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={onNext} disabled={!isValid} className="gap-2">
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
