import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRight, ArrowLeft, Wrench } from "lucide-react";
import type { ServicesEquipmentData } from "./types";

interface ServicesEquipmentStepProps {
  data: ServicesEquipmentData;
  onChange: (data: ServicesEquipmentData) => void;
  onNext: () => void;
  onBack: () => void;
}

const MOWER_TYPES = [
  { id: "push", label: "Push Mower", description: "Manual push mower" },
  { id: "self-propelled", label: "Self-propelled Mower", description: "Motorized self-propelled mower" },
  { id: "ride-on", label: "Ride-on Mower", description: "Sit-on riding mower for larger properties" },
];

export const ServicesEquipmentStep = ({ data, onChange, onNext, onBack }: ServicesEquipmentStepProps) => {
  const toggleMowerType = (mowerType: string) => {
    const currentTypes = data.mowerTypes;
    const newTypes = currentTypes.includes(mowerType)
      ? currentTypes.filter(t => t !== mowerType)
      : [...currentTypes, mowerType];
    onChange({ ...data, mowerTypes: newTypes });
  };

  const isValid = data.mowerTypes.length > 0 && data.offersGreenWasteRemoval !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wrench className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Services & Equipment</CardTitle>
            <CardDescription>
              This information is used for job matching
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mower Types */}
        <div className="space-y-4">
          <Label>What type of mower do you have? * (Select all that apply)</Label>
          <div className="grid gap-3">
            {MOWER_TYPES.map((mower) => (
              <div
                key={mower.id}
                className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  data.mowerTypes.includes(mower.id)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => toggleMowerType(mower.id)}
              >
                <Checkbox
                  id={mower.id}
                  checked={data.mowerTypes.includes(mower.id)}
                  onCheckedChange={() => toggleMowerType(mower.id)}
                />
                <div className="flex-1">
                  <label
                    htmlFor={mower.id}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {mower.label}
                  </label>
                  <p className="text-xs text-muted-foreground">{mower.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Green Waste Removal */}
        <div className="space-y-4">
          <Label>Do you offer green waste removal services? *</Label>
          <RadioGroup
            value={data.offersGreenWasteRemoval === null ? undefined : data.offersGreenWasteRemoval.toString()}
            onValueChange={(value) => onChange({ ...data, offersGreenWasteRemoval: value === "true" })}
            className="grid gap-3"
          >
            <div
              className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                data.offersGreenWasteRemoval === true
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <RadioGroupItem value="true" id="waste-yes" />
              <label htmlFor="waste-yes" className="text-sm font-medium cursor-pointer flex-1">
                Yes, I offer green waste removal
              </label>
            </div>
            <div
              className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                data.offersGreenWasteRemoval === false
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <RadioGroupItem value="false" id="waste-no" />
              <label htmlFor="waste-no" className="text-sm font-medium cursor-pointer flex-1">
                No, I don't offer green waste removal
              </label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            Green waste removal includes taking grass clippings and garden waste from the property
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
