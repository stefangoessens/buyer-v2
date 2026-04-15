import type { OfferOutput, OfferScenario } from "@/lib/ai/engines/types";

export type BrokerReviewState =
  | "not_submitted"
  | "pending_review"
  | "approved"
  | "rejected";

export type OfferCockpitStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "submitted"
  | "countered"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "expired";

export interface OfferTerms {
  offerPrice: number;
  earnestMoney: number;
  closingDays: number;
  contingencies: string[];
  buyerCredits: number;
  sellerCredits: number;
}

export interface OfferCockpitDraft {
  draftId: string | null;
  dealRoomId: string;
  propertyId: string;
  status: OfferCockpitStatus;
  terms: OfferTerms;
  selectedScenarioName: string | null;
  brokerReviewState: BrokerReviewState;
  brokerNote: string | null;
  lastSavedAt: string | null;
  version: number;
}

export interface OfferCockpitValidationError {
  field: keyof OfferTerms | "global";
  code: string;
  message: string;
}

export interface OfferCockpitValidation {
  ok: boolean;
  errors: OfferCockpitValidationError[];
  warnings: OfferCockpitValidationError[];
}

export interface OfferEligibilitySnapshot {
  isEligible: boolean;
  blockingReasonCode?: string;
  blockingReasonMessage?: string;
  requiredAction?: string;
  currentAgreementType?: string;
}

export type BrokerageCallStage = "none" | "requested" | "completed";

export interface BrokerageCallState {
  requestedAt: string | null;
  phone: string | null;
  completedAt: string | null;
  completedBy: string | null;
  stage: BrokerageCallStage;
}

export interface OfferCockpitData {
  draft: OfferCockpitDraft;
  scenarios: OfferOutput | null;
  eligibility: OfferEligibilitySnapshot;
  listPrice: number;
  propertyAddress: string;
}

export interface OfferCockpitEditSession {
  draft: OfferCockpitDraft;
  pristine: OfferTerms;
  dirty: boolean;
  validation: OfferCockpitValidation;
}

export const AVAILABLE_CONTINGENCIES: ReadonlyArray<{
  value: string;
  label: string;
  description: string;
}> = [
  {
    value: "inspection",
    label: "Inspection",
    description: "Right to inspect and request repairs or credits.",
  },
  {
    value: "financing",
    label: "Financing",
    description: "Offer contingent on mortgage approval.",
  },
  {
    value: "appraisal",
    label: "Appraisal",
    description: "Offer contingent on appraisal meeting offer price.",
  },
  {
    value: "sale_of_home",
    label: "Sale of current home",
    description: "Offer contingent on selling buyer's existing home.",
  },
  {
    value: "title",
    label: "Title review",
    description: "Right to review title and HOA documents.",
  },
  {
    value: "insurance",
    label: "Insurance",
    description: "Ability to obtain homeowners insurance at reasonable cost.",
  },
];

export function scenarioToTerms(
  scenario: OfferScenario,
  listPrice: number,
): OfferTerms {
  return {
    offerPrice: scenario.price,
    earnestMoney: scenario.earnestMoney,
    closingDays: scenario.closingDays,
    contingencies: [...scenario.contingencies],
    buyerCredits: 0,
    sellerCredits: 0,
  };
}

export function emptyTerms(listPrice: number): OfferTerms {
  return {
    offerPrice: listPrice,
    earnestMoney: Math.round(listPrice * 0.02),
    closingDays: 35,
    contingencies: ["inspection", "financing"],
    buyerCredits: 0,
    sellerCredits: 0,
  };
}
