export const portalPlatforms = [
  "zillow",
  "redfin",
  "realtor",
  "manual",
] as const;

export type SourcePlatform = (typeof portalPlatforms)[number];

export const dealStatuses = [
  "intake",
  "analysis",
  "tour_scheduled",
  "offer_prep",
  "offer_sent",
  "under_contract",
  "closing",
  "closed",
  "withdrawn",
] as const;

/** Status of a deal in the buyer-v2 pipeline */
export type DealStatus = (typeof dealStatuses)[number];

export const aiReviewStates = ["pending", "approved", "rejected"] as const;

export type AIReviewState = (typeof aiReviewStates)[number];

export interface PropertyAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
}

/** Normalized property record — system of record */
export interface PropertyRecord {
  id: string;
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  address: PropertyAddress;
  listPrice?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  mlsNumber?: string;
  extractedAt: string;
}

/** AI engine output metadata — every engine must include this */
export interface AIEngineOutput {
  confidence: number;
  citations: string[];
  reviewState: AIReviewState;
  generatedAt: string;
  modelId: string;
}
