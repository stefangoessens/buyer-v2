import { describe, expect, it } from "vitest";
import {
  isCriticalSource,
  isFresh,
  isRetryable,
  sortedSources,
} from "@/lib/enrichment/sources";
import {
  CRITICAL_SOURCES,
  ENRICHMENT_SOURCES,
  SOURCE_PRIORITY,
} from "@/lib/enrichment/types";

describe("enrichment/sources", () => {
  describe("isCriticalSource", () => {
    it("returns true for every critical source", () => {
      for (const source of CRITICAL_SOURCES) {
        expect(isCriticalSource(source)).toBe(true);
      }
    });

    it("returns false for non-critical sources", () => {
      expect(isCriticalSource("fema_flood")).toBe(false);
      expect(isCriticalSource("neighborhood_market")).toBe(false);
      expect(isCriticalSource("listing_agent_profile")).toBe(false);
    });
  });

  describe("sortedSources", () => {
    it("returns every source exactly once", () => {
      const sorted = sortedSources();
      expect(sorted).toHaveLength(ENRICHMENT_SOURCES.length);
      expect(new Set(sorted).size).toBe(ENRICHMENT_SOURCES.length);
    });

    it("orders by priority ascending", () => {
      const sorted = sortedSources();
      for (let i = 1; i < sorted.length; i++) {
        expect(SOURCE_PRIORITY[sorted[i]!]).toBeGreaterThanOrEqual(
          SOURCE_PRIORITY[sorted[i - 1]!],
        );
      }
    });

    it("puts browser_use_fallback first (highest priority after KIN-784)", () => {
      expect(sortedSources()[0]).toBe("browser_use_fallback");
    });

    it("orders cross_portal_match right after browser_use_fallback", () => {
      expect(sortedSources()[1]).toBe("cross_portal_match");
    });
  });

  describe("isFresh", () => {
    const now = new Date("2026-04-12T12:00:00Z");

    it("returns true for a recently refreshed source within TTL", () => {
      const oneHourAgo = new Date("2026-04-12T11:00:00Z").toISOString();
      expect(isFresh(oneHourAgo, "neighborhood_market", now)).toBe(true);
    });

    it("returns false for a stale source past TTL", () => {
      const twoDaysAgo = new Date("2026-04-10T12:00:00Z").toISOString();
      expect(isFresh(twoDaysAgo, "neighborhood_market", now)).toBe(false);
    });

    it("respects the longer TTL on fema_flood (30 days)", () => {
      const tenDaysAgo = new Date("2026-04-02T12:00:00Z").toISOString();
      expect(isFresh(tenDaysAgo, "fema_flood", now)).toBe(true);
      const fortyDaysAgo = new Date("2026-03-03T12:00:00Z").toISOString();
      expect(isFresh(fortyDaysAgo, "fema_flood", now)).toBe(false);
    });

    it("returns false for an invalid date string", () => {
      expect(isFresh("not-a-date", "neighborhood_market", now)).toBe(false);
    });
  });

  describe("isRetryable", () => {
    it("marks network + rate_limited + timeout as retryable", () => {
      expect(isRetryable("network_error")).toBe(true);
      expect(isRetryable("rate_limited")).toBe(true);
      expect(isRetryable("timeout")).toBe(true);
    });

    it("marks not_found / parse_error / unauthorized as NOT retryable", () => {
      expect(isRetryable("not_found")).toBe(false);
      expect(isRetryable("parse_error")).toBe(false);
      expect(isRetryable("unauthorized")).toBe(false);
    });
  });
});
