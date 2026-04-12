export const onboardingSteps = [
  "account",
  "buyer_basics",
  "property_linkage",
] as const;

export type OnboardingStep = (typeof onboardingSteps)[number];

export type BuyerTimeline =
  | "asap"
  | "30_60_days"
  | "90_plus_days"
  | "just_researching";

export type FinancingType =
  | "cash"
  | "conventional"
  | "fha_va"
  | "exploring";

export type ListingPortal = "zillow" | "redfin" | "realtor";

export type SearchStatus = "analysis_ready" | "watching" | "needs_review";

export interface AccountStepState {
  fullName: string;
  email: string;
  phone: string;
}

export interface BuyerBasicsStepState {
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: BuyerTimeline;
  financing: FinancingType;
  preferredAreas: string;
}

export interface SearchRecord {
  id: string;
  propertyId: string;
  listingUrl: string;
  portal: ListingPortal;
  address: string;
  city: string;
  price: number;
  score: number;
  lastActivity: string;
  imageUrl: string;
  status: SearchStatus;
  summary: string;
}

export interface PropertyLinkageStepState {
  listingUrl: string;
  linkedSearch: SearchRecord | null;
}

export interface BuyerOnboardingState {
  version: 1;
  status: "draft" | "completed";
  currentStep: OnboardingStep;
  account: AccountStepState;
  buyerBasics: BuyerBasicsStepState;
  propertyLinkage: PropertyLinkageStepState;
  updatedAt: string;
  completedAt?: string;
}

export interface BuyerSession {
  version: 1;
  status: "registered";
  registeredAt: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerBasics: BuyerBasicsStepState;
  firstSearch: SearchRecord;
  searches: SearchRecord[];
}

export interface BuyerSessionCookie {
  version: 1;
  status: "registered";
  buyerName: string;
  buyerEmail: string;
  firstPropertyId: string;
}

export type ValidationErrorCode =
  | "required"
  | "invalid_email"
  | "invalid_phone"
  | "budget_range"
  | "invalid_listing_url"
  | "missing_linked_search";

export interface ValidationIssue {
  field: string;
  code: ValidationErrorCode;
  message: string;
}

export type StepValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

export const ONBOARDING_STORAGE_KEY = "buyer-v2:onboarding-draft";
export const BUYER_SESSION_STORAGE_KEY = "buyer-v2:buyer-session";
export const BUYER_SESSION_COOKIE = "buyer_v2_session";
