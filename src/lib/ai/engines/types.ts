/** Input to the pricing engine */
export interface PricingInput {
  propertyId: string;
  listPrice: number;
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  propertyType: string;
  // Portal estimates (any may be absent)
  zestimate?: number;
  redfinEstimate?: number;
  realtorEstimate?: number;
  // Neighborhood context
  neighborhoodMedianPsf?: number;
  compAvgPsf?: number;
}

/** Single price point in the output */
export interface PricePoint {
  value: number;
  deltaVsListPrice: number; // percentage
  deltaVsConsensus: number; // percentage
  confidence: number; // 0-1
}

/** Full pricing engine output */
export interface PricingOutput {
  fairValue: PricePoint;
  likelyAccepted: PricePoint;
  strongOpener: PricePoint;
  walkAway: PricePoint;
  consensusEstimate: number;
  estimateSpread: number; // std dev / mean — high = low confidence
  estimateSources: string[]; // which estimates were available
  overallConfidence: number;
}

// ═══ Comps Engine Types ═══

/** Comparable property candidate from sold listings */
export interface CompCandidate {
  canonicalId: string;
  address: string;
  soldPrice: number;
  soldDate: string;
  listPrice?: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  lotSize?: number;
  propertyType: string;
  waterfront?: boolean;
  pool?: boolean;
  hoaFee?: number;
  subdivision?: string;
  zip: string;
  sourcePlatform: string;
  dom?: number;
}

/** Subject property for comps comparison */
export interface CompsSubject {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  lotSize?: number;
  propertyType: string;
  waterfront?: boolean;
  pool?: boolean;
  hoaFee?: number;
  subdivision?: string;
  zip: string;
  listPrice: number;
}

export interface CompsInput {
  subject: CompsSubject;
  candidates: CompCandidate[];
  maxComps?: number;
}

export interface CompResult {
  candidate: CompCandidate;
  similarityScore: number;
  explanation: string;
  sourceCitation: string;
}

export interface CompsAggregates {
  medianSoldPrice: number;
  medianPricePerSqft: number;
  medianDom: number;
  medianSaleToListRatio: number;
}

export interface CompsOutput {
  comps: CompResult[];
  aggregates: CompsAggregates;
  selectionBasis: "subdivision" | "zip" | "school_zone";
  selectionReason: string;
  totalCandidates: number;
  dedupedCandidates: number;
}

// ═══ Calibration ═══

/** Calibration record for accuracy tracking */
export interface CalibrationRecord {
  propertyId: string;
  engineOutputId: string;
  predictedFairValue: number;
  predictedLikelyAccepted: number;
  actualAcceptedPrice: number;
  errorFairValue: number; // percentage
  errorLikelyAccepted: number; // percentage
  promptVersion: string;
  modelId: string;
  recordedAt: string;
}
