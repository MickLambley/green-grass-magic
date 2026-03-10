import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GeographicReachStep } from "@/components/contractor-onboarding/GeographicReachStep";
import type { GeographicData } from "@/components/contractor-onboarding/types";
import type { Tables } from "@/integrations/supabase/types";

type Contractor = Tables<"contractors">;

interface ServiceAreaSettingsCardProps {
  contractor: Contractor;
  onUpdate: (updated: Contractor) => void;
}

const ServiceAreaSettingsCard = ({ contractor, onUpdate }: ServiceAreaSettingsCardProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);

  const [geoData, setGeoData] = useState<GeographicData>({
    maxTravelDistanceKm: Number(contractor.service_radius_km) || 15,
    baseAddress: contractor.business_address || "",
    baseAddressLat: contractor.service_center_lat ? Number(contractor.service_center_lat) : null,
    baseAddressLng: contractor.service_center_lng ? Number(contractor.service_center_lng) : null,
    servicedSuburbs: [],
  });

  // Load existing suburbs on mount
  useEffect(() => {
    const loadExisting = async () => {
      const { data: suburbs } = await supabase
        .from("contractor_service_suburbs")
        .select("suburb, postcode")
        .eq("contractor_id", contractor.id);

      if (suburbs && suburbs.length > 0) {
        setGeoData((prev) => ({
          ...prev,
          servicedSuburbs: suburbs.map((s) => `${s.suburb}|${s.postcode}`),
        }));
      }
      setIsLoadingExisting(false);
    };
    loadExisting();
  }, [contractor.id]);

  const handleSave = async () => {
    if (!geoData.baseAddressLat || !geoData.baseAddressLng) {
      toast.error("Please set a base address first");
      return;
    }

    setIsSaving(true);
    try {
      // Save suburbs via edge function
      const suburbPayload = geoData.servicedSuburbs.map((s) => {
        const [suburb, postcode] = s.split("|");
        return { suburb, postcode: postcode || "" };
      });

      if (suburbPayload.length > 0) {
        await supabase.functions.invoke("update-service-areas", {
          body: { suburbs: suburbPayload },
        });
      }

      // Update contractor with radius info
      const { data, error } = await supabase
        .from("contractors")
        .update({
          service_radius_km: geoData.maxTravelDistanceKm,
          service_center_lat: geoData.baseAddressLat,
          service_center_lng: geoData.baseAddressLng,
        })
        .eq("id", contractor.id)
        .select()
        .single();

      if (error) throw error;
      if (data) onUpdate(data);

      toast.success(`Saved ${geoData.servicedSuburbs.length} service suburbs!`);
    } catch (err) {
      console.error("Save service area error:", err);
      toast.error("Failed to save service areas");
    }
    setIsSaving(false);
  };

  if (isLoadingExisting) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <GeographicReachStep
        data={geoData}
        onChange={setGeoData}
        onNext={handleSave}
        onBack={() => {}}
        hideNavigation
      />
      <Button onClick={handleSave} disabled={isSaving || !geoData.baseAddressLat} className="w-full sm:w-auto">
        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Service Area
      </Button>
    </div>
  );
};

export default ServiceAreaSettingsCard;
