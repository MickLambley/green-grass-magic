import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Loader2, User, Wrench, ClipboardCheck, MapPin, Award } from "lucide-react";
import type { 
  IdentityBusinessData, 
  ServicesEquipmentData, 
  OperationalRulesData, 
  GeographicData, 
  ExperienceData 
} from "./types";

interface ReviewStepProps {
  identityData: IdentityBusinessData;
  servicesData: ServicesEquipmentData;
  operationalRules: OperationalRulesData;
  geographicData: GeographicData;
  experienceData: ExperienceData;
  onSubmit: () => void;
  onBack: () => void;
  isLoading: boolean;
}

const getMowerTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    push: "Push Mower",
    "self-propelled": "Self-propelled Mower",
    "ride-on": "Ride-on Mower",
  };
  return labels[type] || type;
};

const getExperienceLabel = (value: string) => {
  const labels: Record<string, string> = {
    "less-than-1": "Less than 1 year",
    "1-3": "1–3 years",
    "3+": "3+ years",
  };
  return labels[value] || "Not specified";
};

export const ReviewStep = ({
  identityData,
  servicesData,
  operationalRules,
  geographicData,
  experienceData,
  onSubmit,
  onBack,
  isLoading,
}: ReviewStepProps) => {
  const allAgreementsAccepted = Object.values(operationalRules).every(Boolean);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <CardTitle>Review Your Application</CardTitle>
            <CardDescription>
              Please review your information before submitting
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Identity & Business */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4" />
            Identity & Business
          </h3>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Full Name:</span>
              <span className="font-medium">{identityData.fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mobile:</span>
              <span className="font-medium">{identityData.mobileNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ABN:</span>
              <span className="font-medium">{identityData.abn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Insurance Certificate:</span>
              <span className="font-medium text-green-600">✓ Uploaded</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Insurance Expiry:</span>
              <span className="font-medium">
                {identityData.insuranceExpiryDate 
                  ? new Date(identityData.insuranceExpiryDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                  : "Not set"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Business Confirmation:</span>
              <span className="font-medium text-green-600">✓ Confirmed</span>
            </div>
          </div>
        </div>

        {/* Services & Equipment */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            Services & Equipment
          </h3>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mower Types:</span>
              <span className="font-medium text-right">
                {servicesData.mowerTypes.map(getMowerTypeLabel).join(", ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Green Waste Removal:</span>
              <span className="font-medium">
                {servicesData.offersGreenWasteRemoval ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>

        {/* Operational Rules */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            Agreements
          </h3>
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">All Operational Rules:</span>
              <span className={`font-medium ${allAgreementsAccepted ? "text-green-600" : "text-amber-600"}`}>
                {allAgreementsAccepted ? "✓ Accepted" : "Incomplete"}
              </span>
            </div>
          </div>
        </div>

        {/* Geographic Reach */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Geographic Reach
          </h3>
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Maximum Travel Distance:</span>
              <span className="font-medium">{geographicData.maxTravelDistanceKm} km</span>
            </div>
            {geographicData.baseAddress && (
              <div className="flex justify-between mt-2">
                <span className="text-muted-foreground">Base Address:</span>
                <span className="font-medium text-right max-w-[60%]">{geographicData.baseAddress}</span>
              </div>
            )}
            {geographicData.servicedSuburbs && geographicData.servicedSuburbs.length > 0 && (
              <div className="flex justify-between mt-2">
                <span className="text-muted-foreground">Serviced Suburbs:</span>
                <span className="font-medium">{geographicData.servicedSuburbs.length} suburbs</span>
              </div>
            )}
          </div>
        </div>

        {/* Experience (Optional) */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Award className="w-4 h-4" />
            Experience (Optional)
          </h3>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Years of Experience:</span>
              <span className="font-medium">
                {experienceData.yearsExperience 
                  ? getExperienceLabel(experienceData.yearsExperience) 
                  : "Not specified"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Portfolio Photos:</span>
              <span className="font-medium">
                {experienceData.portfolioPhotoPaths.length > 0 
                  ? `${experienceData.portfolioPhotoPaths.length} uploaded` 
                  : "None"}
              </span>
            </div>
          </div>
        </div>

        {/* What happens next */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">What happens next?</h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• Our team will review your application within 1-2 business days</li>
            <li>• We'll verify your ABN and insurance documentation</li>
            <li>• Once approved, you'll be able to start accepting jobs</li>
            <li>• You'll receive an email notification when your application is reviewed</li>
          </ul>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button 
            onClick={onSubmit} 
            disabled={isLoading} 
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Submit Application
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
