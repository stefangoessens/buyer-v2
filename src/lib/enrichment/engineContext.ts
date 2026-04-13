import type {
  CompCandidate,
  LeverageInput,
  PricingInput,
} from "../ai/engines/types";
import type {
  ListingAgentProfile,
  NeighborhoodContext,
  PortalEstimate,
  RecentComparableSale,
} from "./types";

export interface EngineContextPropertyInput {
  propertyId: string;
  listPrice?: number;
  address: {
    formatted?: string;
    zip: string;
  };
  beds?: number;
  bathsFull?: number;
  bathsHalf?: number;
  sqftLiving?: number;
  yearBuilt?: number;
  lotSize?: number;
  propertyType?: string;
  waterfrontType?: string;
  pool?: boolean;
  hoaFee?: number;
  subdivision?: string;
  daysOnMarket?: number;
  description?: string;
  zestimate?: number;
  redfinEstimate?: number;
  realtorEstimate?: number;
  wasRelisted?: boolean;
  wasWithdrawn?: boolean;
  wasPendingFellThrough?: boolean;
  priceReductions?: Array<{ amount: number; date: string }>;
}

export function pickNeighborhoodContext(
  contexts: NeighborhoodContext[],
  preferredWindowDays: number,
): NeighborhoodContext | null {
  if (contexts.length === 0) return null;

  const exact = contexts.find((context) => context.windowDays === preferredWindowDays);
  if (exact) return exact;

  const sorted = [...contexts].sort(
    (a, b) =>
      Math.abs(a.windowDays - preferredWindowDays) -
      Math.abs(b.windowDays - preferredWindowDays),
  );
  return sorted[0] ?? null;
}

export function buildPricingInputFromEnrichment(args: {
  property: EngineContextPropertyInput;
  estimates: PortalEstimate[];
  contexts: NeighborhoodContext[];
  recentSales?: RecentComparableSale[];
}): PricingInput {
  const neighborhood = pickNeighborhoodContext(args.contexts, 90);
  const latestEstimates = latestPortalEstimates(args.estimates);

  return {
    propertyId: args.property.propertyId,
    listPrice: args.property.listPrice ?? 0,
    address: args.property.address.formatted ?? "Unknown",
    beds: args.property.beds ?? 0,
    baths:
      (args.property.bathsFull ?? 0) + (args.property.bathsHalf ?? 0) * 0.5,
    sqft: args.property.sqftLiving ?? 0,
    yearBuilt: args.property.yearBuilt ?? 0,
    propertyType: args.property.propertyType ?? "Unknown",
    zestimate:
      latestEstimates.zillow ?? args.property.zestimate,
    redfinEstimate:
      latestEstimates.redfin ?? args.property.redfinEstimate,
    realtorEstimate:
      latestEstimates.realtor ?? args.property.realtorEstimate,
    neighborhoodMedianPsf: neighborhood?.medianPricePerSqft,
    compAvgPsf: computeAverageComparablePsf(args.recentSales ?? []),
  };
}

export function buildLeverageInputFromEnrichment(args: {
  property: EngineContextPropertyInput;
  contexts: NeighborhoodContext[];
  listingAgent: ListingAgentProfile | null;
}): LeverageInput {
  const neighborhood = pickNeighborhoodContext(args.contexts, 30)
    ?? pickNeighborhoodContext(args.contexts, 90);

  return {
    propertyId: args.property.propertyId,
    listPrice: args.property.listPrice ?? 0,
    daysOnMarket: args.property.daysOnMarket ?? 0,
    description: args.property.description,
    priceReductions: args.property.priceReductions,
    neighborhoodMedianDom: neighborhood?.medianDom,
    neighborhoodMedianPsf: neighborhood?.medianPricePerSqft,
    sqft: args.property.sqftLiving ?? 0,
    wasRelisted: args.property.wasRelisted,
    wasWithdrawn: args.property.wasWithdrawn,
    wasPendingFellThrough: args.property.wasPendingFellThrough,
    listingAgentAvgDom: args.listingAgent?.avgDaysOnMarket,
    listingAgentAvgSaleToList: args.listingAgent?.medianListToSellRatio,
  };
}

export function buildCompCandidatesFromRecentSales(
  sales: RecentComparableSale[],
): CompCandidate[] {
  return sales.map((sale) => ({
    canonicalId: sale.canonicalId,
    address: sale.address,
    soldPrice: sale.soldPrice,
    soldDate: sale.soldDate,
    listPrice: sale.listPrice,
    beds: sale.beds ?? 0,
    baths: sale.baths ?? 0,
    sqft: sale.sqft ?? 0,
    yearBuilt: sale.yearBuilt ?? 0,
    lotSize: sale.lotSize,
    propertyType: sale.propertyType ?? "Unknown",
    waterfront: sale.waterfront,
    pool: sale.pool,
    hoaFee: sale.hoaFee,
    subdivision: sale.subdivision,
    zip: sale.zip ?? "",
    sourcePlatform: sale.portal,
    dom: sale.dom,
  }));
}

function latestPortalEstimates(
  estimates: PortalEstimate[],
): Partial<Record<PortalEstimate["portal"], number>> {
  const latest: Partial<Record<PortalEstimate["portal"], PortalEstimate>> = {};
  for (const estimate of estimates) {
    const current = latest[estimate.portal];
    if (!current || estimate.capturedAt > current.capturedAt) {
      latest[estimate.portal] = estimate;
    }
  }

  return {
    zillow: latest.zillow?.estimateValue,
    redfin: latest.redfin?.estimateValue,
    realtor: latest.realtor?.estimateValue,
  };
}

function computeAverageComparablePsf(
  sales: RecentComparableSale[],
): number | undefined {
  const psfs = sales
    .filter((sale) => typeof sale.sqft === "number" && sale.sqft > 0)
    .map((sale) => sale.soldPrice / sale.sqft!);

  if (psfs.length === 0) return undefined;
  const total = psfs.reduce((sum, psf) => sum + psf, 0);
  return Number((total / psfs.length).toFixed(2));
}
