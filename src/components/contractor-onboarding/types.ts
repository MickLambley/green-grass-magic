// Legacy onboarding types – kept for backwards compatibility with old step components
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
