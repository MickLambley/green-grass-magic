import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Leaf, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { IdentityBusinessStep } from "@/components/contractor-onboarding/IdentityBusinessStep";
import { ServicesEquipmentStep } from "@/components/contractor-onboarding/ServicesEquipmentStep";
import { OperationalRulesStep } from "@/components/contractor-onboarding/OperationalRulesStep";
import { GeographicReachStep } from "@/components/contractor-onboarding/GeographicReachStep";
import { ExperienceStep } from "@/components/contractor-onboarding/ExperienceStep";
import { ReviewStep } from "@/components/contractor-onboarding/ReviewStep";

export interface IdentityBusinessData {
  businessName: string;
  fullName: string;
  mobileNumber: string;
  abn: string;
  businessAddress: string;
  businessAddressLat: number | null;
  businessAddressLng: number | null;
  mailingAddress: string;
  mailingAddressSameAsBusiness: boolean;
  confirmIndependentBusiness: boolean;
  insuranceCertificatePath: string | null;
  confirmInsuranceCoverage: boolean;
  insuranceExpiryDate: string;
}

export interface ServicesEquipmentData {
  mowerTypes: string[];
  offersGreenWasteRemoval: boolean | null;
}

export interface OperationalRulesData {
  agreePhotoUpload: boolean;
  agreeSafeWorksite: boolean;
  agreeCancellationPolicy: boolean;
  agreePromptCommunication: boolean;
  agreeProfessionalStandard: boolean;
  agreeEscrowPayment: boolean;
  agreeDisputeProcess: boolean;
}

export interface GeographicData {
  maxTravelDistanceKm: number;
  baseAddress: string;
  baseAddressLat: number | null;
  baseAddressLng: number | null;
  servicedSuburbs: string[];
}

export interface ExperienceData {
  yearsExperience: string;
  portfolioPhotoPaths: string[];
}

const ContractorOnboarding = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  
  const [identityData, setIdentityData] = useState<IdentityBusinessData>({
    businessName: "",
    fullName: "",
    mobileNumber: "",
    abn: "",
    businessAddress: "",
    businessAddressLat: null,
    businessAddressLng: null,
    mailingAddress: "",
    mailingAddressSameAsBusiness: true,
    confirmIndependentBusiness: false,
    insuranceCertificatePath: null,
    confirmInsuranceCoverage: false,
    insuranceExpiryDate: "",
  });

  const [servicesData, setServicesData] = useState<ServicesEquipmentData>({
    mowerTypes: [],
    offersGreenWasteRemoval: null,
  });

  const [operationalRules, setOperationalRules] = useState<OperationalRulesData>({
    agreePhotoUpload: false,
    agreeSafeWorksite: false,
    agreeCancellationPolicy: false,
    agreePromptCommunication: false,
    agreeProfessionalStandard: false,
    agreeEscrowPayment: false,
    agreeDisputeProcess: false,
  });

  const [geographicData, setGeographicData] = useState<GeographicData>({
    maxTravelDistanceKm: 15,
    baseAddress: "",
    baseAddressLat: null,
    baseAddressLng: null,
    servicedSuburbs: [],
  });

  // Sync business address to geographic data when identity data changes
  useEffect(() => {
    if (identityData.businessAddress && !geographicData.baseAddress) {
      setGeographicData(prev => ({
        ...prev,
        baseAddress: identityData.businessAddress,
        baseAddressLat: identityData.businessAddressLat,
        baseAddressLng: identityData.businessAddressLng,
      }));
    }
  }, [identityData.businessAddress, identityData.businessAddressLat, identityData.businessAddressLng]);

  const [experienceData, setExperienceData] = useState<ExperienceData>({
    yearsExperience: "",
    portfolioPhotoPaths: [],
  });

  const totalSteps = 6;
  const progress = (currentStep / totalSteps) * 100;

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/contractor-auth?mode=signup");
      return;
    }

    setUser(user);

    // Pre-fill name from user metadata
    const fullName = user.user_metadata?.full_name || "";
    if (fullName) {
      setIdentityData(prev => ({ ...prev, fullName }));
    }

    // Check if contractor profile exists and is complete
    const { data: contractor } = await supabase
      .from("contractors")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (contractor && contractor.abn) {
      // Already completed onboarding
      navigate("/contractor");
      return;
    }

    // Check contractor role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "contractor");

    if (!roles || roles.length === 0) {
      // Add contractor role if not present
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: user.id,
        role: "contractor",
      });
      
      if (roleError) {
        console.error("Error adding contractor role:", roleError);
      }

      // Create contractor profile if not present
      if (!contractor) {
        const { error: contractorError } = await supabase.from("contractors").insert({
          user_id: user.id,
          service_areas: [],
          is_active: false,
          approval_status: "pending",
        });
        
        if (contractorError) {
          console.error("Error creating contractor profile:", contractorError);
        }
      }
    }

    setIsLoading(false);
  };

  const handleSubmit = async () => {
    if (!user) return;

    setIsLoading(true);

    try {
      // Build questionnaire responses object
      const questionnaireResponses = {
        identity: {
          businessName: identityData.businessName,
          fullName: identityData.fullName,
          mobileNumber: identityData.mobileNumber,
          confirmIndependentBusiness: identityData.confirmIndependentBusiness,
          confirmInsuranceCoverage: identityData.confirmInsuranceCoverage,
          businessAddress: identityData.businessAddress,
          mailingAddress: identityData.mailingAddressSameAsBusiness ? identityData.businessAddress : identityData.mailingAddress,
        },
        services: {
          mowerTypes: servicesData.mowerTypes,
          offersGreenWasteRemoval: servicesData.offersGreenWasteRemoval,
        },
        operationalRules: operationalRules,
        experience: {
          yearsExperience: experienceData.yearsExperience,
          portfolioPhotoPaths: experienceData.portfolioPhotoPaths,
        },
      };

      // Update contractor profile
      const { error } = await supabase
        .from("contractors")
        .update({
          business_name: identityData.businessName,
          abn: identityData.abn.replace(/\s/g, ""),
          phone: identityData.mobileNumber,
          insurance_certificate_url: identityData.insuranceCertificatePath,
          insurance_expiry_date: identityData.insuranceExpiryDate || null,
          insurance_uploaded_at: identityData.insuranceCertificatePath ? new Date().toISOString() : null,
          questionnaire_responses: JSON.parse(JSON.stringify(questionnaireResponses)),
          service_radius_km: geographicData.maxTravelDistanceKm,
          service_center_lat: geographicData.baseAddressLat,
          service_center_lng: geographicData.baseAddressLng,
          business_address: identityData.businessAddress,
          service_areas: geographicData.servicedSuburbs,
          approval_status: "pending",
          applied_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) throw error;

      // Update profile with full name
      await supabase
        .from("profiles")
        .update({
          full_name: identityData.fullName,
          phone: identityData.mobileNumber,
        })
        .eq("user_id", user.id);

      toast.success("Application submitted! We'll review your profile and get back to you soon.");
      navigate("/contractor");
    } catch (error) {
      console.error("Error submitting application:", error);
      toast.error("Failed to submit application. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/contractors");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl gradient-hero animate-pulse" />
      </div>
    );
  }

  const stepTitles = [
    "Identity & Business",
    "Services & Equipment",
    "Operational Rules",
    "Geographic Reach",
    "Experience (Optional)",
    "Review & Submit"
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-foreground">Lawnly</span>
              <span className="ml-2 text-sm text-muted-foreground">Contractor Application</span>
            </div>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              Step {currentStep} of {totalSteps}: {stepTitles[currentStep - 1]}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {Math.round(progress)}% complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Content */}
        {currentStep === 1 && (
          <IdentityBusinessStep
            data={identityData}
            onChange={setIdentityData}
            userId={user?.id || ""}
            onNext={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <ServicesEquipmentStep
            data={servicesData}
            onChange={setServicesData}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 3 && (
          <OperationalRulesStep
            data={operationalRules}
            onChange={setOperationalRules}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 4 && (
          <GeographicReachStep
            data={geographicData}
            onChange={setGeographicData}
            identityData={identityData}
            onNext={() => setCurrentStep(5)}
            onBack={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 5 && (
          <ExperienceStep
            data={experienceData}
            onChange={setExperienceData}
            userId={user?.id || ""}
            onNext={() => setCurrentStep(6)}
            onBack={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 6 && (
          <ReviewStep
            identityData={identityData}
            servicesData={servicesData}
            operationalRules={operationalRules}
            geographicData={geographicData}
            experienceData={experienceData}
            onSubmit={handleSubmit}
            onBack={() => setCurrentStep(5)}
            isLoading={isLoading}
          />
        )}

        {/* Back button for middle steps */}
        {currentStep > 1 && currentStep < 6 && (
          <div className="mt-6">
            <Button
              variant="ghost"
              onClick={() => setCurrentStep(currentStep - 1)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default ContractorOnboarding;
