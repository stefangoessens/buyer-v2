import { describe, expect, it } from "vitest";
import {
  mergeAgentObservation,
  observationChangesProfile,
} from "@/lib/enrichment/agentMerge";
import type {
  AgentObservation,
  ListingAgentProfile,
} from "@/lib/enrichment/types";

function makeObservation(
  overrides: Partial<AgentObservation> = {},
): AgentObservation {
  return {
    source: "zillow",
    name: "Jane Smith",
    brokerage: "Coldwell Banker",
    profileUrl: "https://zillow.com/agents/jane-smith",
    activeListings: 12,
    soldCount: 88,
    avgDaysOnMarket: 24,
    medianListToSellRatio: 0.98,
    priceCutFrequency: 0.3,
    recentActivityCount: 4,
    fetchedAt: "2026-04-12T10:00:00Z",
    ...overrides,
  };
}

describe("enrichment/agentMerge", () => {
  describe("mergeAgentObservation (new profile)", () => {
    it("creates a profile from an observation when none exists", () => {
      const obs = makeObservation();
      const profile = mergeAgentObservation(null, obs, "jane-smith::coldwell-banker");
      expect(profile.canonicalAgentId).toBe("jane-smith::coldwell-banker");
      expect(profile.name).toBe("Jane Smith");
      expect(profile.brokerage).toBe("Coldwell Banker");
      expect(profile.zillowProfileUrl).toBe("https://zillow.com/agents/jane-smith");
      expect(profile.redfinProfileUrl).toBeUndefined();
      expect(profile.activeListings).toBe(12);
    });

    it("records provenance for every present field", () => {
      const obs = makeObservation();
      const profile = mergeAgentObservation(null, obs, "jane-smith::coldwell-banker");
      expect(profile.provenance.name?.source).toBe("zillow");
      expect(profile.provenance.activeListings?.source).toBe("zillow");
      expect(profile.provenance.name?.fetchedAt).toBe("2026-04-12T10:00:00Z");
    });

    it("routes profileUrl to the correct per-portal field", () => {
      const profile = mergeAgentObservation(
        null,
        makeObservation({ source: "redfin", profileUrl: "https://redfin.com/jane" }),
        "jane-smith::coldwell-banker",
      );
      expect(profile.redfinProfileUrl).toBe("https://redfin.com/jane");
      expect(profile.zillowProfileUrl).toBeUndefined();
    });

    it("sets lastRefreshedAt to the observation fetch time", () => {
      const obs = makeObservation({ fetchedAt: "2026-04-12T08:30:00Z" });
      const profile = mergeAgentObservation(null, obs, "jane-smith::coldwell-banker");
      expect(profile.lastRefreshedAt).toBe("2026-04-12T08:30:00Z");
    });
  });

  describe("mergeAgentObservation (existing profile)", () => {
    const existing: ListingAgentProfile = {
      canonicalAgentId: "jane-smith::coldwell-banker",
      name: "Jane Smith",
      brokerage: "Coldwell Banker",
      zillowProfileUrl: "https://zillow.com/agents/jane-smith",
      activeListings: 12,
      soldCount: 88,
      avgDaysOnMarket: 24,
      medianListToSellRatio: 0.98,
      priceCutFrequency: 0.3,
      recentActivityCount: 4,
      provenance: {
        name: { source: "zillow", fetchedAt: "2026-04-12T10:00:00Z" },
        activeListings: { source: "zillow", fetchedAt: "2026-04-12T10:00:00Z" },
      },
      lastRefreshedAt: "2026-04-12T10:00:00Z",
    };

    it("patches a new portal's URL without overwriting other URLs", () => {
      const obs = makeObservation({
        source: "redfin",
        profileUrl: "https://redfin.com/jane",
        fetchedAt: "2026-04-12T11:00:00Z",
      });
      const merged = mergeAgentObservation(existing, obs, existing.canonicalAgentId);
      expect(merged.zillowProfileUrl).toBe("https://zillow.com/agents/jane-smith");
      expect(merged.redfinProfileUrl).toBe("https://redfin.com/jane");
    });

    it("prefers the more-recent observation for numeric fields", () => {
      const obs = makeObservation({
        source: "redfin",
        activeListings: 14,
        fetchedAt: "2026-04-12T11:00:00Z",
      });
      const merged = mergeAgentObservation(existing, obs, existing.canonicalAgentId);
      expect(merged.activeListings).toBe(14);
      expect(merged.provenance.activeListings?.source).toBe("redfin");
    });

    it("does not regress fields that the incoming observation omits", () => {
      const obs: AgentObservation = {
        source: "realtor",
        name: "Jane Smith",
        fetchedAt: "2026-04-12T11:00:00Z",
      };
      const merged = mergeAgentObservation(existing, obs, existing.canonicalAgentId);
      expect(merged.activeListings).toBe(12);
      expect(merged.soldCount).toBe(88);
    });

    it("advances lastRefreshedAt on every merge", () => {
      const obs = makeObservation({
        source: "redfin",
        fetchedAt: "2026-04-12T11:00:00Z",
      });
      const merged = mergeAgentObservation(existing, obs, existing.canonicalAgentId);
      expect(merged.lastRefreshedAt).toBe("2026-04-12T11:00:00Z");
    });
  });

  describe("observationChangesProfile", () => {
    const existing: ListingAgentProfile = {
      canonicalAgentId: "jane-smith::coldwell-banker",
      name: "Jane Smith",
      brokerage: "Coldwell Banker",
      activeListings: 12,
      provenance: {
        name: { source: "zillow", fetchedAt: "2026-04-12T10:00:00Z" },
        activeListings: { source: "zillow", fetchedAt: "2026-04-12T10:00:00Z" },
      },
      lastRefreshedAt: "2026-04-12T10:00:00Z",
    };

    it("returns false when all incoming fields match", () => {
      const obs: AgentObservation = {
        source: "zillow",
        name: "Jane Smith",
        brokerage: "Coldwell Banker",
        activeListings: 12,
        fetchedAt: "2026-04-12T11:00:00Z",
      };
      expect(observationChangesProfile(existing, obs)).toBe(false);
    });

    it("returns true when a numeric field changed", () => {
      const obs: AgentObservation = {
        source: "zillow",
        name: "Jane Smith",
        activeListings: 14,
        fetchedAt: "2026-04-12T11:00:00Z",
      };
      expect(observationChangesProfile(existing, obs)).toBe(true);
    });

    it("returns true when a new portal URL is present", () => {
      const obs: AgentObservation = {
        source: "redfin",
        name: "Jane Smith",
        profileUrl: "https://redfin.com/jane",
        fetchedAt: "2026-04-12T11:00:00Z",
      };
      expect(observationChangesProfile(existing, obs)).toBe(true);
    });
  });
});
