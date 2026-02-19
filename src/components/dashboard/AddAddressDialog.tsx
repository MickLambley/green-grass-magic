import { useState, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import AddressAutocompleteInput from "./AddressAutocompleteInput";
import LawnDrawingMap, { LawnDrawingMapRef } from "./LawnDrawingMap";

const addressSchema = z.object({
  street_address: z
    .string()
    .trim()
    .min(5, "Street address is required")
    .max(200, "Address must be less than 200 characters"),
  city: z
    .string()
    .trim()
    .min(2, "City is required")
    .max(100, "City must be less than 100 characters"),
  state: z
    .string()
    .trim()
    .min(2, "State is required")
    .max(100, "State must be less than 100 characters"),
  postal_code: z
    .string()
    .trim()
    .min(3, "Postal code is required")
    .max(20, "Postal code must be less than 20 characters"),
  country: z
    .string()
    .trim()
    .min(2, "Country is required")
    .max(100, "Country must be less than 100 characters"),
  slope: z.enum(["flat", "mild", "steep"]),
  tier_count: z.number().min(1).max(10),
  square_meters: z.number().min(0).optional(),
});

type AddressFormData = z.infer<typeof addressSchema>;

interface AddAddressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = "address" | "map" | "details";

const AddAddressDialog = ({ open, onOpenChange, onSuccess }: AddAddressDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("address");
  const [calculatedArea, setCalculatedArea] = useState(0);
  const lawnMapRef = useRef<LawnDrawingMapRef>(null);

  const form = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      street_address: "",
      city: "",
      state: "",
      postal_code: "",
      country: "Australia",
      slope: "flat",
      tier_count: 1,
      square_meters: 0,
    },
  });

  const handleAddressSelect = (address: {
    street_address: string;
    city: string;
    state: string;
    postal_code: string;
  }) => {
    form.setValue("street_address", address.street_address, { shouldValidate: true, shouldDirty: true });
    form.setValue("city", address.city, { shouldValidate: true, shouldDirty: true });
    form.setValue("state", address.state, { shouldValidate: true, shouldDirty: true });
    form.setValue("postal_code", address.postal_code, { shouldValidate: true, shouldDirty: true });
  };

  const handleAreaCalculated = (areaInSqm: number) => {
    setCalculatedArea(areaInSqm);
    form.setValue("square_meters", areaInSqm);
  };

  const watchedStreet = form.watch("street_address");
  const watchedCity = form.watch("city");
  const watchedState = form.watch("state");
  const watchedPostal = form.watch("postal_code");

  const canProceedToMap = watchedStreet.length >= 5 && 
         watchedCity.length >= 2 && 
         watchedState.length >= 2 && 
         watchedPostal.length >= 3;

  const getFullAddress = () => {
    const values = form.getValues();
    return `${values.street_address}, ${values.city}, ${values.state} ${values.postal_code}`;
  };

  const uploadLawnImage = async (userId: string): Promise<string | null> => {
    if (!lawnMapRef.current) return null;

    try {
      const blob = await lawnMapRef.current.captureImage();
      if (!blob) {
        console.warn("Could not capture lawn image");
        return null;
      }

      const fileName = `${userId}/${Date.now()}-lawn.png`;
      const { data, error } = await supabase.storage
        .from("lawn-images")
        .upload(fileName, blob, {
          contentType: "image/png",
          upsert: false,
        });

      if (error) {
        console.error("Error uploading lawn image:", error);
        return null;
      }

      // Return the storage path (not public URL - bucket is private)
      return data.path;
    } catch (error) {
      console.error("Error in uploadLawnImage:", error);
      return null;
    }
  };

  const onSubmit = async (data: AddressFormData) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("You must be logged in to add an address.");
        return;
      }

      // Capture and upload the lawn image
      const lawnImageUrl = await uploadLawnImage(user.id);

      const { error } = await supabase.from("addresses").insert({
        user_id: user.id,
        street_address: data.street_address,
        city: data.city,
        state: data.state,
        postal_code: data.postal_code,
        country: data.country,
        slope: data.slope,
        tier_count: data.tier_count,
        square_meters: calculatedArea > 0 ? calculatedArea : null,
        lawn_image_url: lawnImageUrl,
      });

      if (error) {
        console.error("Error adding address:", error);
        toast.error("Failed to submit address. Please try again.");
        return;
      }

      toast.success("Address submitted for verification!", {
        description: "We'll verify your property and notify you once it's approved.",
      });
      form.reset();
      setCurrentStep("address");
      setCalculatedArea(0);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error("Failed to submit address. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCurrentStep("address");
      setCalculatedArea(0);
      form.reset();
    }
    onOpenChange(open);
  };

  const renderAddressStep = () => (
    <>
      <FormField
        control={form.control}
        name="street_address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Street Address</FormLabel>
            <FormControl>
              <AddressAutocompleteInput
                value={field.value}
                onChange={field.onChange}
                onSelectAddress={handleAddressSelect}
                placeholder="Start typing your address..."
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Suburb</FormLabel>
              <FormControl>
                <Input placeholder="Sydney" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>State</FormLabel>
              <FormControl>
                <Input placeholder="NSW" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="postal_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Postal Code</FormLabel>
              <FormControl>
                <Input placeholder="2000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country</FormLabel>
              <FormControl>
                <Input {...field} disabled />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => handleOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={() => setCurrentStep("map")}
          disabled={!canProceedToMap}
        >
          Next: Mark Lawn Areas
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </>
  );

  const renderMapStep = () => (
    <>
      <div className="mb-4 p-3 bg-muted rounded-lg">
        <p className="text-sm font-medium">{getFullAddress()}</p>
      </div>

      <LawnDrawingMap
        ref={lawnMapRef}
        address={getFullAddress()}
        onAreaCalculated={handleAreaCalculated}
      />

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setCurrentStep("address")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={() => setCurrentStep("details")}
        >
          Next: Property Details
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </>
  );

  const renderDetailsStep = () => (
    <>
      <div className="mb-4 p-3 bg-muted rounded-lg space-y-1">
        <p className="text-sm font-medium">{getFullAddress()}</p>
        <p className="text-sm text-primary">
          Lawn area: {calculatedArea > 0 ? `${calculatedArea} m²` : "Not specified"}
        </p>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">Additional Property Details</h4>
        <p className="text-xs text-muted-foreground mb-4">
          This helps us calculate accurate pricing for your property.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="slope"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Land Slope</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select slope" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="mild">Mild slope</SelectItem>
                    <SelectItem value="steep">Steep slope</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tier_count"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Tiers</FormLabel>
                <Select 
                  onValueChange={(val) => field.onChange(parseInt(val))} 
                  defaultValue={field.value.toString()}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tiers" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? "tier" : "tiers"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setCurrentStep("map")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit for Verification"
          )}
        </Button>
      </div>
    </>
  );

  const getStepTitle = () => {
    switch (currentStep) {
      case "address":
        return "Add New Address";
      case "map":
        return "Mark Your Lawn Areas";
      case "details":
        return "Property Details";
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case "address":
        return "Enter your property address.";
      case "map":
        return "Draw the outline of your lawn areas on the satellite map.";
      case "details":
        return "Add additional details about your property.";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={`${currentStep === "map" ? "sm:max-w-[700px]" : "sm:max-w-[500px]"} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="font-display">{getStepTitle()}</DialogTitle>
              <DialogDescription>
                {getStepDescription()}
              </DialogDescription>
            </div>
          </div>
          
          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-2">
            {["address", "map", "details"].map((step, index) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    currentStep === step
                      ? "bg-primary text-primary-foreground"
                      : index < ["address", "map", "details"].indexOf(currentStep)
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {index + 1}
                </div>
                {index < 2 && (
                  <div
                    className={`w-8 h-0.5 mx-1 ${
                      index < ["address", "map", "details"].indexOf(currentStep)
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {currentStep === "address" && renderAddressStep()}
            {currentStep === "map" && renderMapStep()}
            {currentStep === "details" && renderDetailsStep()}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddAddressDialog;