import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRight, ArrowLeft, Award, Upload, X, Loader2, Image } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ExperienceData } from "@/pages/ContractorOnboarding";

interface ExperienceStepProps {
  data: ExperienceData;
  onChange: (data: ExperienceData) => void;
  userId: string;
  onNext: () => void;
  onBack: () => void;
}

const EXPERIENCE_OPTIONS = [
  { value: "less-than-1", label: "Less than 1 year" },
  { value: "1-3", label: "1–3 years" },
  { value: "3+", label: "3+ years" },
];

export const ExperienceStep = ({ data, onChange, userId, onNext, onBack }: ExperienceStepProps) => {
  const [isUploading, setIsUploading] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Limit to 5 photos
    if (data.portfolioPhotoPaths.length + files.length > 5) {
      toast.error("You can upload a maximum of 5 portfolio photos");
      return;
    }

    setIsUploading(true);

    try {
      const newPaths: string[] = [];

      for (const file of Array.from(files)) {
        // Validate file type
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image file`);
          continue;
        }

        // Validate file size (max 5MB per image)
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 5MB)`);
          continue;
        }

        const fileExt = file.name.split(".").pop();
        const fileName = `${userId}/portfolio/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("contractor-documents")
          .upload(fileName, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }

        newPaths.push(fileName);
      }

      if (newPaths.length > 0) {
        onChange({
          ...data,
          portfolioPhotoPaths: [...data.portfolioPhotoPaths, ...newPaths],
        });
        toast.success(`${newPaths.length} photo(s) uploaded successfully`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload photos");
    } finally {
      setIsUploading(false);
    }
  };

  const removePhoto = async (path: string) => {
    try {
      await supabase.storage.from("contractor-documents").remove([path]);
      onChange({
        ...data,
        portfolioPhotoPaths: data.portfolioPhotoPaths.filter(p => p !== path),
      });
      toast.success("Photo removed");
    } catch (error) {
      console.error("Error removing photo:", error);
      toast.error("Failed to remove photo");
    }
  };

  // This step is optional, so always valid
  const isValid = true;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Award className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Profile & Experience</CardTitle>
            <CardDescription>
              Optional information to enhance your profile
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Years of Experience */}
        <div className="space-y-4">
          <Label>How long have you been providing paid lawn care services?</Label>
          <RadioGroup
            value={data.yearsExperience}
            onValueChange={(value) => onChange({ ...data, yearsExperience: value })}
            className="grid gap-3"
          >
            {EXPERIENCE_OPTIONS.map((option) => (
              <div
                key={option.value}
                className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  data.yearsExperience === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value={option.value} id={option.value} />
                <label htmlFor={option.value} className="text-sm font-medium cursor-pointer flex-1">
                  {option.label}
                </label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Portfolio Photos */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Upload photos of previous lawn mowing or edging work (optional)</Label>
            <p className="text-sm text-muted-foreground">
              Showcase your work quality to potential customers. Maximum 5 photos.
            </p>
          </div>

          {/* Photo Grid */}
          {data.portfolioPhotoPaths.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {data.portfolioPhotoPaths.map((path, index) => (
                <div key={path} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Image className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div className="absolute top-1 right-1">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removePhoto(path)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                    Photo {index + 1}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upload Button */}
          {data.portfolioPhotoPaths.length < 5 && (
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                JPG, PNG, or WebP up to 5MB each
              </p>
              <Button variant="outline" disabled={isUploading} asChild>
                <label className="cursor-pointer">
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    "Choose Photos"
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={isUploading}
                  />
                </label>
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                {5 - data.portfolioPhotoPaths.length} photo(s) remaining
              </p>
            </div>
          )}
        </div>

        {/* Skip Note */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> This step is optional. You can skip it and add this information later from your dashboard.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button onClick={onNext} className="gap-2">
            {data.yearsExperience || data.portfolioPhotoPaths.length > 0 ? "Continue" : "Skip & Continue"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
