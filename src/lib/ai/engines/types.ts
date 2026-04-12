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
