/**
 * Negotiation brief export pipeline types (KIN-839).
 *
 * A negotiation brief is a typed, deterministic export artifact composed from
 * the outputs of the pricing, comps, leverage, and offer engines plus a buyer
 * strength summary. It is generated on demand by broker/admin users and
 * persisted in Convex as an auditable artifact.
 *
 * Deterministic regeneration: given the same input versions, the brief builder
 * produces a byte-identical payload. Version identifiers travel with the brief
 * so stale detection is mechanical.
 */

import type {
  PricingOutput,
  CompsOutput,
  LeverageOutput,
  OfferOutput,
} from "@/lib/ai/engines/types";

// ───────────────────────────────────────────────────────────────────────────
// Input shape: everything the brief builder needs
// ───────────────────────────────────────────────────────────────────────────

/** Buyer strength facts that feed into the brief. Deterministic summary. */
export interface BuyerStrengthInput {
  /** Pre-approval amount in USD, if provided by the buyer. */
  preApprovalAmount?: number;
  /** Financing type: cash is strongest, conventional next, etc. */
  financingType?: "cash" | "conventional" | "fha" | "va" | "other";
  /** Target closing window in days (shorter = stronger for motivated sellers). */
  targetCloseDays?: number;
  /** Whether the buyer can waive common contingencies. */
  canWaiveInspection?: boolean;
  canWaiveAppraisal?: boolean;
  canWaiveFinancing?: boolean;
  /** Free-form notes from the broker — NOT used for deterministic scoring. */
  notes?: string;
}

/** Subject property identity — included for audit and display only. */
export interface BriefSubject {
  propertyId: string;
  address: string;
  listPrice: number;
}

/** The complete input envelope handed to `assembleNegotiationBrief`. */
export interface NegotiationBriefInputs {
  subject: BriefSubject;
  /** Output of the pricing panel engine, if available. */
  pricing?: { version: string; output: PricingOutput };
  /** Output of the comps selection engine, if available. */
  comps?: { version: string; output: CompsOutput };
  /** Output of the leverage engine, if available. */
  leverage?: { version: string; output: LeverageOutput };
  /** Output of the offer engine, if available. */
  offer?: { version: string; output: OfferOutput };
  /** Buyer strength facts (no version — this is broker-curated input). */
  buyerStrength?: BuyerStrengthInput;
  /** ISO timestamp captured at build time for display only. */
  generatedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Output shape: the structured brief payload
// ───────────────────────────────────────────────────────────────────────────

/**
 * Section status indicates why a section is present or missing.
 *
 * `complete` — all required inputs were present and the section rendered.
 * `partial`  — some inputs were missing but enough was available for a useful section.
 * `missing`  — required inputs were absent; the section is omitted from rendering.
 */
export type BriefSectionStatus = "complete" | "partial" | "missing";

/** Pricing section of the brief. */
export interface PricingSection {
  status: BriefSectionStatus;
  fairValue?: number;
  likelyAccepted?: number;
  strongOpener?: number;
  walkAway?: number;
  consensusEstimate?: number;
  overallConfidence?: number;
  /** Which portal sources contributed to the consensus. */
  sources: string[];
  /** One-sentence summary suitable for display. */
  summary: string;
}

/** Comps section of the brief. */
export interface CompsSection {
  status: BriefSectionStatus;
  medianSoldPrice?: number;
  medianPricePerSqft?: number;
  medianDom?: number;
  medianSaleToListRatio?: number;
  selectedCompCount: number;
  selectionBasis?: "subdivision" | "zip" | "school_zone";
  /** Top-N most similar comps with their similarity scores. */
  topComps: Array<{
    address: string;
    soldPrice: number;
    soldDate: string;
    similarityScore: number;
  }>;
  summary: string;
}

/** Leverage section of the brief. */
export interface LeverageSection {
  status: BriefSectionStatus;
  score?: number;
  overallConfidence?: number;
  signalCount: number;
  /** Top-N most material signals by absolute delta. */
  topSignals: Array<{
    name: string;
    delta: number;
    direction: "bullish" | "bearish" | "neutral";
    explanation: string;
  }>;
  summary: string;
}

/** Buyer strength section of the brief. */
export interface BuyerStrengthSection {
  status: BriefSectionStatus;
  /** 0-100 deterministic strength score. */
  score: number;
  /** The individual contributions to the score. */
  contributions: Array<{
    factor: string;
    points: number;
    explanation: string;
  }>;
  summary: string;
}

/** Recommended offer section of the brief. */
export interface RecommendedOfferSection {
  status: BriefSectionStatus;
  recommendedPrice?: number;
  recommendedScenarioName?: string;
  priceVsListPct?: number;
  riskLevel?: "low" | "medium" | "high";
  competitivenessScore?: number;
  contingencies: string[];
  summary: string;
}

/** Version fingerprint recorded on the brief for staleness checks. */
export interface BriefSourceVersions {
  pricingVersion?: string;
  compsVersion?: string;
  leverageVersion?: string;
  offerVersion?: string;
  /** Version of the brief builder logic itself. Bump when output shape changes. */
  builderVersion: string;
}

/** The full negotiation brief payload. */
export interface NegotiationBriefPayload {
  subject: BriefSubject;
  pricing: PricingSection;
  comps: CompsSection;
  leverage: LeverageSection;
  buyerStrength: BuyerStrengthSection;
  recommendedOffer: RecommendedOfferSection;
  sourceVersions: BriefSourceVersions;
  /** Overall coverage — number of sections with status !== "missing" / total sections. */
  coverage: number;
  /** Short two-sentence narrative summary of the entire brief. */
  narrative: string;
  generatedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Staleness + status types for the persistence layer
// ───────────────────────────────────────────────────────────────────────────

/** Lifecycle status of a stored brief document. */
export type BriefStatus =
  | "pending"
  | "ready"
  | "failed"
  | "stale";

/** Reasons a brief can become stale. */
export type StalenessReason =
  | "pricing_updated"
  | "comps_updated"
  | "leverage_updated"
  | "offer_updated"
  | "builder_version_changed";

export interface StalenessResult {
  stale: boolean;
  reasons: StalenessReason[];
}
