import { describe, expect, it } from "vitest";
import {
  runEnrichmentJob,
  stubAdapters,
  type EnrichmentFetchAdapters,
} from "@/lib/ai/engines/enrichmentWorker";
import type { AgentObservation } from "@/lib/enrichment/types";

function makeAdapters(
  overrides: Partial<EnrichmentFetchAdapters> = {},
): EnrichmentFetchAdapters {
  return {
    async femaFlood() {
      return { zone: "X", bfe: 8, citation: "fema://flood" };
    },
    async countyAppraiser() {
      return { assessedValue: 420_000, yearBuilt: 1998, citation: "county://appraiser" };
    },
    async censusGeocode() {
      return { lat: 25.7617, lng: -80.1918, tract: "12086", citation: "census://tiger" };
    },
    async crossPortalMatch() {
      return {
        zillowId: "Z1",
        redfinId: "R1",
        realtorId: "RM1",
        citation: "internal://match",
      };
    },
    async listingAgentProfile() {
      const observation: AgentObservation = {
        source: "zillow",
        name: "Jane Smith",
        brokerage: "Coldwell Banker",
        profileUrl: "https://zillow.com/agents/jane",
        activeListings: 10,
        soldCount: 80,
        avgDaysOnMarket: 22,
        medianListToSellRatio: 0.99,
        priceCutFrequency: 0.2,
        recentActivityCount: 3,
        fetchedAt: "2026-04-12T12:00:00Z",
      };
      return { observation, citation: "zillow://agent" };
    },
    async neighborhoodMarket() {
      return { sales: [], citation: "bright-data://market" };
    },
    async portalEstimates() {
      return {
        value: 500_000,
        low: 480_000,
        high: 520_000,
        asOfDate: "2026-04-11",
        citation: "zillow://zestimate",
      };
    },
    async recentSales() {
      return { sales: [], citation: "bright-data://recent" };
    },
    async browserUseFallback({ sourceUrl, portal, reason }) {
      return {
        result: {
          sourceUrl,
          portal,
          canonicalFields: { listPrice: 500_000 },
          confidence: 0.8,
          evidence: [],
          reason,
          capturedAt: "2026-04-12T12:00:00Z",
        },
        citation: "browser-use://stub",
      };
    },
    ...overrides,
  };
}

describe("enrichmentWorker", () => {
  describe("runEnrichmentJob", () => {
    it("returns a success outcome on a normal run", async () => {
      const outcome = await runEnrichmentJob(
        { propertyId: "p1", source: "fema_flood", context: { lat: 25, lng: -80 } },
        makeAdapters(),
      );
      expect(outcome.kind).toBe("success");
      if (outcome.kind === "success") {
        expect(outcome.result.source).toBe("fema_flood");
        expect(outcome.result.propertyId).toBe("p1");
        expect(outcome.result.citation).toBe("fema://flood");
      }
    });

    it("returns a typed failure when the adapter throws a network error", async () => {
      const adapters = makeAdapters({
        async femaFlood() {
          const err = new Error("ECONNRESET") as Error & { code?: string };
          err.code = "ECONNRESET";
          throw err;
        },
      });
      const outcome = await runEnrichmentJob(
        { propertyId: "p1", source: "fema_flood", context: { lat: 25, lng: -80 } },
        adapters,
      );
      expect(outcome.kind).toBe("failure");
      if (outcome.kind === "failure") {
        expect(outcome.error.source).toBe("fema_flood");
        expect(outcome.error.retryable).toBe(true);
      }
    });

    it("reports parse_error (non-retryable) when required context is missing", async () => {
      const outcome = await runEnrichmentJob(
        { propertyId: "p1", source: "fema_flood", context: {} },
        makeAdapters(),
      );
      expect(outcome.kind).toBe("failure");
      if (outcome.kind === "failure") {
        expect(outcome.error.code).toBe("parse_error");
        expect(outcome.error.retryable).toBe(false);
      }
    });

    it("dispatches to the county appraiser adapter", async () => {
      let called = false;
      const adapters = makeAdapters({
        async countyAppraiser() {
          called = true;
          return { assessedValue: 1, yearBuilt: 2000, citation: "x" };
        },
      });
      await runEnrichmentJob(
        { propertyId: "p1", source: "county_appraiser", context: { address: "1 Main" } },
        adapters,
      );
      expect(called).toBe(true);
    });

    it("dispatches to the listingAgentProfile adapter", async () => {
      const outcome = await runEnrichmentJob(
        {
          propertyId: "p1",
          source: "listing_agent_profile",
          context: { portal: "zillow", profileUrl: "https://zillow.com/agents/jane" },
        },
        makeAdapters(),
      );
      expect(outcome.kind).toBe("success");
      if (outcome.kind === "success") {
        const payload = outcome.result.payload as { observation: AgentObservation };
        expect(payload.observation.name).toBe("Jane Smith");
      }
    });

    it("stubAdapters throw not_found for every source", async () => {
      const outcome = await runEnrichmentJob(
        { propertyId: "p1", source: "fema_flood", context: { lat: 25, lng: -80 } },
        stubAdapters,
      );
      expect(outcome.kind).toBe("failure");
      if (outcome.kind === "failure") {
        expect(outcome.error.code).toBe("not_found");
      }
    });
  });
});
