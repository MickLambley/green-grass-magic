import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, MapPin, Loader2, Navigation, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import type { GeographicData, IdentityBusinessData } from "./types";

interface GeographicReachStepProps {
  data: GeographicData;
  onChange: (data: GeographicData) => void;
  onNext: () => void;
  onBack: () => void;
}

 export const GeographicReachStep = ({ data, onChange, onNext, onBack }: GeographicReachStepProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  
  const [isLoadingSuburbs, setIsLoadingSuburbs] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [allDiscoveredSuburbs, setAllDiscoveredSuburbs] = useState<string[]>([]);

  const isValid = data.maxTravelDistanceKm >= 5 && data.baseAddress && data.baseAddressLat !== null;

  // Keep ref in sync with latest data
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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

    return () => {
      // Don't remove the script on cleanup as it may be used elsewhere
    };
  }, []);

  // Initialize map once loaded
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || googleMapRef.current) return;

    const defaultCenter = { lat: -33.8688, lng: 151.2093 }; // Sydney default
    const center = data.baseAddressLat && data.baseAddressLng 
      ? { lat: data.baseAddressLat, lng: data.baseAddressLng }
      : defaultCenter;

    googleMapRef.current = new google.maps.Map(mapRef.current, {
      center,
      zoom: 10,
      mapTypeId: "roadmap",
      disableDefaultUI: true,
      zoomControl: true,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    // Create circle for service radius
    circleRef.current = new google.maps.Circle({
      map: googleMapRef.current,
      center,
      radius: data.maxTravelDistanceKm * 1000,
      fillColor: "#22c55e",
      fillOpacity: 0.15,
      strokeColor: "#16a34a",
      strokeWeight: 2,
    });

    // Create marker for base location
    if (data.baseAddressLat && data.baseAddressLng) {
      markerRef.current = new google.maps.Marker({
        map: googleMapRef.current,
        position: center,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#16a34a",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
    }

    // Fit bounds to circle
    if (data.baseAddressLat && data.baseAddressLng) {
      const bounds = circleRef.current.getBounds();
      if (bounds) {
        googleMapRef.current.fitBounds(bounds);
      }
    }
  }, [mapLoaded]);

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

        onChange({
          ...data,
          baseAddress: address,
          baseAddressLat: lat,
          baseAddressLng: lng,
        });

        // Update map
        if (googleMapRef.current && circleRef.current) {
          const newCenter = { lat, lng };
          googleMapRef.current.setCenter(newCenter);
          circleRef.current.setCenter(newCenter);

          // Update or create marker
          if (markerRef.current) {
            markerRef.current.setPosition(newCenter);
          } else {
            markerRef.current = new google.maps.Marker({
              map: googleMapRef.current,
              position: newCenter,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: "#16a34a",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
              },
            });
          }

          // Fit bounds
          const bounds = circleRef.current.getBounds();
          if (bounds) {
            googleMapRef.current.fitBounds(bounds);
          }
        }
      }
    });
  }, [mapLoaded, data, onChange]);

  // Update circle radius when slider changes
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(data.maxTravelDistanceKm * 1000);
    }
  }, [data.maxTravelDistanceKm, data.baseAddressLat, data.baseAddressLng]);

  // Fetch suburbs within radius using reverse geocoding
  const fetchSuburbsInRadius = useCallback(async (lat: number, lng: number, radiusKm: number) => {
    if (!mapLoaded) return;

    setIsLoadingSuburbs(true);
    
    try {
      // Generate points around the circle to find suburbs
      const suburbs = new Set<string>();
      const center = { lat, lng };
      
      // Sample points at different distances and angles
      const distances = [0, radiusKm * 0.25, radiusKm * 0.5, radiusKm * 0.75, radiusKm];
      const angles = [0, 45, 90, 135, 180, 225, 270, 315];
      
      const geocoder = new google.maps.Geocoder();
      
      const geocodePoint = (lat: number, lng: number): Promise<string | null> => {
        return new Promise((resolve) => {
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === "OK" && results?.[0]) {
              // Find suburb/locality from address components
              const suburbComponent = results[0].address_components.find(
                (c) => c.types.includes("locality") || c.types.includes("sublocality")
              );
              resolve(suburbComponent?.long_name || null);
            } else {
              resolve(null);
            }
          });
        });
      };

      // Get suburb at center
      const centerSuburb = await geocodePoint(center.lat, center.lng);
      if (centerSuburb) suburbs.add(centerSuburb);

      // Sample points around the circle
      for (const distance of distances) {
        for (const angle of angles) {
          if (distance === 0) continue; // Skip center for each angle
          
          // Calculate point at distance km and angle degrees from center
          const radians = (angle * Math.PI) / 180;
          const earthRadiusKm = 6371;
          const lat1 = (center.lat * Math.PI) / 180;
          const lng1 = (center.lng * Math.PI) / 180;
          
          const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(distance / earthRadiusKm) +
            Math.cos(lat1) * Math.sin(distance / earthRadiusKm) * Math.cos(radians)
          );
          const lng2 = lng1 + Math.atan2(
            Math.sin(radians) * Math.sin(distance / earthRadiusKm) * Math.cos(lat1),
            Math.cos(distance / earthRadiusKm) - Math.sin(lat1) * Math.sin(lat2)
          );
          
          const newLat = (lat2 * 180) / Math.PI;
          const newLng = (lng2 * 180) / Math.PI;
          
          // Add a small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 50));
          const suburb = await geocodePoint(newLat, newLng);
          if (suburb) suburbs.add(suburb);
        }
      }

      const suburbsArray = Array.from(suburbs).sort();
      setAllDiscoveredSuburbs(suburbsArray);
      // All suburbs selected by default
      onChange({ ...dataRef.current, servicedSuburbs: suburbsArray });
    } catch (error) {
      console.error("Error fetching suburbs:", error);
    } finally {
      setIsLoadingSuburbs(false);
    }
  }, [mapLoaded, onChange]);

  // Debounced suburb fetch when radius or location changes
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

  const selectAllSuburbs = () => {
    onChange({ ...data, servicedSuburbs: [...allDiscoveredSuburbs] });
  };

  const deselectAllSuburbs = () => {
    onChange({ ...data, servicedSuburbs: [] });
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
            Base address for service area <span className="text-destructive">*</span>
          </Label>
          <p className="text-sm text-muted-foreground">
            This is where you'll travel from to reach jobs. It defaults to your business address but can be changed.
          </p>
          <div className="relative">
            <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              id="base-address"
              placeholder={identityData?.businessAddress || "Start typing your address..."}
              defaultValue={data.baseAddress}
              className="pl-10"
            />
          </div>
          {identityData?.businessAddress && !data.baseAddress && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onChange({
                  ...data,
                  baseAddress: identityData.businessAddress,
                  baseAddressLat: identityData.businessAddressLat,
                  baseAddressLng: identityData.businessAddressLng,
                });
                // Trigger map update
                if (inputRef.current) {
                  inputRef.current.value = identityData.businessAddress;
                }
                if (googleMapRef.current && circleRef.current && identityData.businessAddressLat && identityData.businessAddressLng) {
                  const newCenter = { lat: identityData.businessAddressLat, lng: identityData.businessAddressLng };
                  googleMapRef.current.setCenter(newCenter);
                  circleRef.current.setCenter(newCenter);
                  
                  if (markerRef.current) {
                    markerRef.current.setPosition(newCenter);
                  } else {
                    markerRef.current = new google.maps.Marker({
                      map: googleMapRef.current,
                      position: newCenter,
                      icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: "#16a34a",
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 3,
                      },
                    });
                  }
                  
                  const bounds = circleRef.current.getBounds();
                  if (bounds) {
                    googleMapRef.current.fitBounds(bounds);
                  }
                }
              }}
              className="gap-2"
            >
              <MapPin className="w-3 h-3" />
              Use business address
            </Button>
          )}
          {data.baseAddress && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {data.baseAddress}
            </p>
          )}
        </div>

        {/* Map with Radius */}
        <div className="space-y-3">
          <Label>Service Area Preview</Label>
          <div 
            ref={mapRef} 
            className="w-full h-64 rounded-lg border border-border bg-muted"
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
          <div className="space-y-2">
            <Label>Maximum travel distance from your base</Label>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">5 km</span>
            <span className="text-2xl font-bold text-primary">{data.maxTravelDistanceKm} km</span>
            <span className="text-sm text-muted-foreground">50 km</span>
          </div>
          
          <Slider
            value={[data.maxTravelDistanceKm]}
            onValueChange={([value]) => {
              onChange({ ...data, maxTravelDistanceKm: value });
            }}
            min={5}
            max={50}
            step={5}
            className="w-full"
          />
        </div>

        {/* Serviced Suburbs */}
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
                <ScrollArea className="h-48 rounded-lg border border-border p-3">
                  <div className="space-y-2">
                    {allDiscoveredSuburbs.map((suburb) => {
                      const isSelected = data.servicedSuburbs.includes(suburb);
                      return (
                        <div 
                          key={suburb} 
                          className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded-md -mx-1.5"
                          onClick={() => toggleSuburb(suburb)}
                        >
                          <Checkbox 
                            checked={isSelected}
                            onCheckedChange={() => toggleSuburb(suburb)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className={`text-sm ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {suburb}
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
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button onClick={onNext} disabled={!isValid} className="gap-2">
            Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
