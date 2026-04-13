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

// ═══ Leverage Engine Types ═══

export interface LeverageInput {
  propertyId: string;
  listPrice: number;
  daysOnMarket: number;
  description?: string;
  priceReductions?: Array<{ amount: number; date: string }>;
  neighborhoodMedianDom?: number;
  neighborhoodMedianPsf?: number;
  sqft: number;
  wasRelisted?: boolean;
  wasWithdrawn?: boolean;
  wasPendingFellThrough?: boolean;
  listingAgentAvgDom?: number;
  listingAgentAvgSaleToList?: number;
}

export interface LeverageSignal {
  name: string;
  value: number | string;
  marketReference: number | string;
  delta: number;
  confidence: number;
  citation: string;
  direction: "bullish" | "bearish" | "neutral";
}

export interface LeverageOutput {
  score: number; // 0-100, higher = more seller pressure
  signals: LeverageSignal[];
  overallConfidence: number;
  signalCount: number;
}

// ═══ Cost Engine Types ═══

export interface CostAssumptions {
  interestRate: number;       // e.g., 0.065 for 6.5%
  downPaymentPct: number;     // e.g., 0.20 for 20%
  propertyTaxRate: number;    // e.g., 0.0185 for FL avg
  maintenancePct: number;     // e.g., 0.01 for 1% of value/yr
  pmiRate: number;            // e.g., 0.005 for 0.5%/yr
  closingCostPct: number;     // e.g., 0.03 for 3%
}

export interface CostInput {
  purchasePrice: number;
  taxAnnual?: number;
  taxAssessedValue?: number;
  hoaFee?: number;
  hoaFrequency?: string;
  roofYear?: number;
  yearBuilt: number;
  impactWindows?: boolean;
  stormShutters?: boolean;
  constructionType?: string;
  floodZone?: string;
  assumptions?: Partial<CostAssumptions>;
}

export interface CostLineItem {
  category: string;
  label: string;
  monthlyLow: number;
  monthlyMid: number;
  monthlyHigh: number;
  annualMid: number;
  source: "fact" | "assumption" | "estimate";
  notes: string;
}

export interface CostOutput {
  lineItems: CostLineItem[];
  totalMonthlyLow: number;
  totalMonthlyMid: number;
  totalMonthlyHigh: number;
  totalAnnual: number;
  upfrontCosts: {
    downPayment: number;
    closingCosts: number;
    total: number;
  };
  assumptions: CostAssumptions;
  disclaimers: string[];
}

// ═══ Offer Engine Types ═══

export interface OfferInput {
  listPrice: number;
  fairValue?: number;
  leverageScore?: number; // 0-100 from leverage engine
  buyerMaxBudget?: number;
  daysOnMarket?: number;
  competingOffers?: number;
  isNewConstruction?: boolean;
  sellerMotivated?: boolean;
}

export interface OfferScenario {
  name: string;
  price: number;
  priceVsListPct: number;
  earnestMoney: number;
  closingDays: number;
  contingencies: string[];
  competitivenessScore: number; // 0-100
  riskLevel: "low" | "medium" | "high";
  explanation: string;
}

export interface OfferOutput {
  scenarios: OfferScenario[];
  recommendedIndex: number;
  inputSummary: string;
  refreshable: boolean;
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

// ═══ Insights Engine Types ═══

export type InsightCategory =
  | "pricing"
  | "market_position"
  | "florida_risk"
  | "seller_motivation"
  | "hidden_cost"
  | "condition"
  | "negotiation";

export type InsightSeverity = "info" | "positive" | "warning" | "critical";

export interface Insight {
  category: InsightCategory;
  headline: string; // 1 line, <= 80 chars, specific and numeric
  body: string; // 1-3 sentences, cites specific numbers and WHY it matters
  severity: InsightSeverity;
  confidence: number; // 0-1
  // Premium insights stay gated on the anonymous /property teaser.
  // Public insights show publicly. Set based on how much raw data
  // went into producing it.
  premium: boolean;
  citations: string[]; // data field refs, e.g. ["property.listPrice", "comps.median"]
}

export interface InsightsInput {
  propertyId: string;
  property: {
    listPrice: number | null;
    address: { city: string; state: string; zip: string; formatted?: string };
    propertyType: string | null;
    beds: number | null;
    bathsFull: number | null;
    bathsHalf: number | null;
    sqftLiving: number | null;
    lotSize: number | null;
    yearBuilt: number | null;
    hoaFee: number | null;
    daysOnMarket: number | null;
    description: string | null;
    sourcePlatform: string;
  };
  // Outputs from earlier engines the orchestrator ran. ALL optional
  // — insights must produce something useful even with no comps.
  pricingOutput?: unknown;
  compsOutput?: unknown;
  leverageOutput?: unknown;
  offerOutput?: unknown;
  costOutput?: unknown;
}

export interface InsightsOutput {
  insights: Insight[];
  overallConfidence: number;
  generatedAt: string;
  tokensUsed: number;
}
