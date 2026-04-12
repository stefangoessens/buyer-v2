/** Status of a deal in the buyer-v2 pipeline */
export type DealStatus =
  | "intake"
  | "analysis"
  | "tour_scheduled"
  | "offer_prep"
  | "offer_sent"
  | "under_contract"
  | "closing"
  | "closed"
  | "withdrawn";

/** Normalized property record — system of record */
export interface PropertyRecord {
  id: string;
  sourceUrl: string;
  sourcePlatform: "zillow" | "redfin" | "realtor" | "manual";
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    county?: string;
  };
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
  confidence: number; // 0-1
  citations: string[];
  reviewState: "pending" | "approved" | "rejected";
  generatedAt: string;
  modelId: string;
}
