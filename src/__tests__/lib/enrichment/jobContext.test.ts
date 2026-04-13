import { describe, expect, it } from "vitest";
import {
  buildEnrichmentContext,
  buildEnrichmentContexts,
  buildNeighborhoodRequests,
  buildPortalEstimateTargets,
  buildPortalTargets,
} from "@/lib/enrichment/jobContext";

const property = {
  canonicalId: "fl-33139-1200-ocean-dr-5a",
  folioNumber: "02-3234-000-1234",
  sourcePlatform: "zillow" as const,
  address: {
    city: "Miami Beach",
    formatted: "1200 Ocean Dr #5A, Miami Beach, FL 33139",
    zip: "33139",
  },
  coordinates: { lat: 25.7751, lng: -80.13 },
  zillowId: "zp-123",
  listingAgentName: "Jane Smith",
  listingBrokerage: "Compass",
  listingAgentPhone: "(305) 555-0110",
  subdivision: "Ocean House",
};

describe("enrichment/jobContext", () => {
  it("builds deterministic portal targets from property + cross-portal ids", () => {
    const targets = buildPortalTargets(property, {
      redfinId: "rf-456",
      realtorId: "rm-789",
    });

    expect(targets).toEqual([
      { portal: "zillow", propertyExternalId: "zp-123" },
      { portal: "redfin", propertyExternalId: "rf-456" },
      { portal: "realtor", propertyExternalId: "rm-789" },
    ]);
  });

  it("always requests all three portal estimates", () => {
    const targets = buildPortalEstimateTargets(property, {
      redfinId: "rf-456",
      realtorId: "rm-789",
    });

    expect(targets).toHaveLength(3);
    expect(targets.map((target) => target.portal)).toEqual([
      "zillow",
      "redfin",
      "realtor",
    ]);
  });

  it("expands neighborhood requests across zip, subdivision, and city windows", () => {
    const requests = buildNeighborhoodRequests(property);

    expect(requests).toHaveLength(9);
    expect(requests).toContainEqual({
      geoKey: "33139",
      geoKind: "zip",
      windowDays: 30,
    });
    expect(requests).toContainEqual({
      geoKey: "Ocean House",
      geoKind: "subdivision",
      windowDays: 90,
    });
    expect(requests).toContainEqual({
      geoKey: "Miami Beach",
      geoKind: "city",
      windowDays: 60,
    });
  });

  it("builds listing-agent-profile context only when agent identity exists", () => {
    const context = buildEnrichmentContext(
      property,
      "listing_agent_profile",
      { redfinId: "rf-456" },
    );

    expect(context).toMatchObject({
      agentName: "Jane Smith",
      brokerage: "Compass",
      phone: "(305) 555-0110",
    });
    expect((context as { portals: Array<{ portal: string }> }).portals).toHaveLength(2);
  });

  it("returns every actionable context for a typical portal property", () => {
    const contexts = buildEnrichmentContexts(property, {
      redfinId: "rf-456",
      realtorId: "rm-789",
    });

    expect(contexts.cross_portal_match).toBeDefined();
    expect(contexts.portal_estimates).toBeDefined();
    expect(contexts.census_geocode).toBeDefined();
    expect(contexts.fema_flood).toBeDefined();
    expect(contexts.county_appraiser).toBeDefined();
    expect(contexts.listing_agent_profile).toBeDefined();
    expect(contexts.neighborhood_market).toBeDefined();
    expect(contexts.recent_sales).toBeDefined();
  });
});
