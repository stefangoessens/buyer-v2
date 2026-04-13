import { describe, expect, it } from "vitest";
import {
  buildCompCandidatesFromRecentSales,
  buildLeverageInputFromEnrichment,
  buildPricingInputFromEnrichment,
  pickNeighborhoodContext,
} from "@/lib/enrichment/engineContext";

const property = {
  propertyId: "p1",
  listPrice: 900_000,
  address: {
    formatted: "100 Las Olas Blvd #1001, Fort Lauderdale, FL 33301",
    zip: "33301",
  },
  beds: 3,
  bathsFull: 2,
  bathsHalf: 1,
  sqftLiving: 1_850,
  yearBuilt: 2019,
  propertyType: "Condo",
  daysOnMarket: 44,
  description: "Seller motivated after recent price improvement.",
};

const contexts = [
  {
    geoKey: "33301",
    geoKind: "zip" as const,
    windowDays: 30,
    medianDom: 28,
    medianPricePerSqft: 505,
    medianListPrice: 880_000,
    inventoryCount: 12,
    pendingCount: 5,
    salesVelocity: 0.23,
    trajectory: "rising" as const,
    provenance: { source: "market://30", fetchedAt: "2026-04-12T12:00:00Z" },
    lastRefreshedAt: "2026-04-12T12:00:00Z",
  },
  {
    geoKey: "33301",
    geoKind: "zip" as const,
    windowDays: 90,
    medianDom: 31,
    medianPricePerSqft: 498,
    medianListPrice: 870_000,
    inventoryCount: 18,
    pendingCount: 6,
    salesVelocity: 0.17,
    trajectory: "flat" as const,
    provenance: { source: "market://90", fetchedAt: "2026-04-12T12:00:00Z" },
    lastRefreshedAt: "2026-04-12T12:00:00Z",
  },
];

const estimates = [
  {
    propertyId: "p1",
    portal: "zillow" as const,
    estimateValue: 915_000,
    provenance: { source: "zillow://estimate", fetchedAt: "2026-04-12T12:00:00Z" },
    capturedAt: "2026-04-12T12:00:00Z",
  },
  {
    propertyId: "p1",
    portal: "redfin" as const,
    estimateValue: 905_000,
    provenance: { source: "redfin://estimate", fetchedAt: "2026-04-12T12:00:00Z" },
    capturedAt: "2026-04-12T12:00:00Z",
  },
  {
    propertyId: "p1",
    portal: "realtor" as const,
    estimateValue: 895_000,
    provenance: { source: "realtor://estimate", fetchedAt: "2026-04-12T12:00:00Z" },
    capturedAt: "2026-04-12T12:00:00Z",
  },
];

const recentSales = [
  {
    propertyId: "p1",
    portal: "zillow" as const,
    canonicalId: "comp-1",
    address: "90 Las Olas Blvd #903, Fort Lauderdale, FL 33301",
    soldPrice: 880_000,
    soldDate: "2026-03-31",
    listPrice: 895_000,
    beds: 3,
    baths: 2.5,
    sqft: 1_780,
    yearBuilt: 2018,
    propertyType: "Condo",
    zip: "33301",
    dom: 21,
    provenance: { source: "zillow://comp-1", fetchedAt: "2026-04-12T12:00:00Z" },
    capturedAt: "2026-04-12T12:00:00Z",
  },
  {
    propertyId: "p1",
    portal: "redfin" as const,
    canonicalId: "comp-2",
    address: "120 Las Olas Blvd #1102, Fort Lauderdale, FL 33301",
    soldPrice: 920_000,
    soldDate: "2026-03-20",
    listPrice: 930_000,
    beds: 3,
    baths: 2.5,
    sqft: 1_900,
    yearBuilt: 2020,
    propertyType: "Condo",
    zip: "33301",
    dom: 18,
    provenance: { source: "redfin://comp-2", fetchedAt: "2026-04-12T12:00:00Z" },
    capturedAt: "2026-04-12T12:00:00Z",
  },
];

describe("enrichment/engineContext", () => {
  it("prefers the requested neighborhood window when available", () => {
    expect(pickNeighborhoodContext(contexts, 90)?.windowDays).toBe(90);
    expect(pickNeighborhoodContext(contexts, 60)?.windowDays).toBe(30);
  });

  it("builds pricing input from stored portal estimates + 90-day context", () => {
    const input = buildPricingInputFromEnrichment({
      property,
      estimates,
      contexts,
      recentSales,
    });

    expect(input.zestimate).toBe(915_000);
    expect(input.redfinEstimate).toBe(905_000);
    expect(input.realtorEstimate).toBe(895_000);
    expect(input.neighborhoodMedianPsf).toBe(498);
    expect(input.compAvgPsf).toBeCloseTo(489.3, 1);
  });

  it("builds leverage input from 30-day market context + listing-agent stats", () => {
    const input = buildLeverageInputFromEnrichment({
      property,
      contexts,
      listingAgent: {
        canonicalAgentId: "jane-smith::compass",
        name: "Jane Smith",
        brokerage: "Compass",
        avgDaysOnMarket: 46,
        medianListToSellRatio: 0.972,
        provenance: {},
        lastRefreshedAt: "2026-04-12T12:00:00Z",
      },
    });

    expect(input.neighborhoodMedianDom).toBe(28);
    expect(input.neighborhoodMedianPsf).toBe(505);
    expect(input.listingAgentAvgDom).toBe(46);
    expect(input.listingAgentAvgSaleToList).toBeCloseTo(0.972, 3);
  });

  it("maps recent comparable sales into comps-engine candidates", () => {
    const candidates = buildCompCandidatesFromRecentSales(recentSales);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      canonicalId: "comp-1",
      sourcePlatform: "zillow",
      soldPrice: 880_000,
      zip: "33301",
    });
  });
});
