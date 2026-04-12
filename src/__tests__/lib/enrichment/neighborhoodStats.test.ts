import { describe, expect, it } from "vitest";
import {
  computeNeighborhoodContext,
  computeSalesVelocity,
  computeTrajectory,
  median,
} from "@/lib/enrichment/neighborhoodStats";
import type { NeighborhoodSale } from "@/lib/enrichment/types";

function sample(
  soldDate: string,
  soldPrice: number,
  sqft: number,
  dom: number,
  status: NeighborhoodSale["status"] = "sold",
): NeighborhoodSale {
  return { soldDate, soldPrice, listPrice: soldPrice, sqft, dom, status };
}

describe("enrichment/neighborhoodStats", () => {
  describe("median", () => {
    it("returns the middle value for odd-length arrays", () => {
      expect(median([3, 1, 2])).toBe(2);
    });

    it("returns the mean of the two middle values for even length", () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    it("returns null for empty arrays", () => {
      expect(median([])).toBeNull();
    });
  });

  describe("computeTrajectory", () => {
    it("returns 'rising' when recent half has higher median psf", () => {
      const sales: NeighborhoodSale[] = [
        sample("2026-01-01", 500_000, 2000, 30),
        sample("2026-01-15", 520_000, 2000, 30),
        sample("2026-03-01", 600_000, 2000, 30),
        sample("2026-03-15", 620_000, 2000, 30),
      ];
      expect(computeTrajectory(sales)).toBe("rising");
    });

    it("returns 'falling' when recent half has lower median psf", () => {
      const sales: NeighborhoodSale[] = [
        sample("2026-01-01", 600_000, 2000, 30),
        sample("2026-01-15", 620_000, 2000, 30),
        sample("2026-03-01", 500_000, 2000, 30),
        sample("2026-03-15", 520_000, 2000, 30),
      ];
      expect(computeTrajectory(sales)).toBe("falling");
    });

    it("returns 'flat' when recent half is within 3% of earlier half", () => {
      const sales: NeighborhoodSale[] = [
        sample("2026-01-01", 500_000, 2000, 30),
        sample("2026-01-15", 510_000, 2000, 30),
        sample("2026-03-01", 505_000, 2000, 30),
        sample("2026-03-15", 507_000, 2000, 30),
      ];
      expect(computeTrajectory(sales)).toBe("flat");
    });

    it("returns null when there aren't enough samples", () => {
      expect(computeTrajectory([])).toBeNull();
      expect(computeTrajectory([sample("2026-01-01", 500_000, 2000, 30)])).toBeNull();
    });
  });

  describe("computeSalesVelocity", () => {
    it("divides sold count by windowDays", () => {
      const sales: NeighborhoodSale[] = [
        sample("2026-03-01", 500_000, 2000, 30),
        sample("2026-03-15", 550_000, 2000, 30),
        sample("2026-04-01", 600_000, 2000, 30),
      ];
      expect(computeSalesVelocity(sales, 30)).toBeCloseTo(0.1, 3);
    });

    it("ignores non-sold records", () => {
      const sales: NeighborhoodSale[] = [
        sample("2026-03-01", 500_000, 2000, 30, "sold"),
        sample("2026-03-01", 500_000, 2000, 30, "pending"),
        sample("2026-03-01", 500_000, 2000, 30, "active"),
      ];
      expect(computeSalesVelocity(sales, 30)).toBeCloseTo(1 / 30, 3);
    });

    it("returns 0 for empty window", () => {
      expect(computeSalesVelocity([], 30)).toBe(0);
    });
  });

  describe("computeNeighborhoodContext", () => {
    const sales: NeighborhoodSale[] = [
      sample("2026-03-01", 500_000, 2000, 20),
      sample("2026-03-15", 620_000, 2500, 35),
      sample("2026-04-01", 480_000, 1800, 42),
      sample("2026-04-01", 600_000, 2400, 28),
      sample("2026-04-01", 550_000, 2200, 30, "pending"),
      sample("2026-04-01", 700_000, 2600, 15, "active"),
    ];

    it("returns a typed NeighborhoodContext with geoKey, geoKind, windowDays", () => {
      const ctx = computeNeighborhoodContext({
        geoKey: "33133",
        geoKind: "zip",
        windowDays: 30,
        sales,
        fetchedAt: "2026-04-12T12:00:00Z",
        sourceLabel: "bright-data",
      });
      expect(ctx.geoKey).toBe("33133");
      expect(ctx.geoKind).toBe("zip");
      expect(ctx.windowDays).toBe(30);
      expect(ctx.provenance.source).toBe("bright-data");
      expect(ctx.lastRefreshedAt).toBe("2026-04-12T12:00:00Z");
    });

    it("computes median DOM over SOLD samples only", () => {
      const ctx = computeNeighborhoodContext({
        geoKey: "33133",
        geoKind: "zip",
        windowDays: 30,
        sales,
        fetchedAt: "2026-04-12T12:00:00Z",
        sourceLabel: "bright-data",
      });
      // sold dom: 20, 35, 42, 28 → median = (28+35)/2 = 31.5
      expect(ctx.medianDom).toBe(31.5);
    });

    it("computes inventoryCount from active listings", () => {
      const ctx = computeNeighborhoodContext({
        geoKey: "33133",
        geoKind: "zip",
        windowDays: 30,
        sales,
        fetchedAt: "2026-04-12T12:00:00Z",
        sourceLabel: "bright-data",
      });
      expect(ctx.inventoryCount).toBe(1);
      expect(ctx.pendingCount).toBe(1);
    });

    it("handles empty sales gracefully", () => {
      const ctx = computeNeighborhoodContext({
        geoKey: "33133",
        geoKind: "zip",
        windowDays: 30,
        sales: [],
        fetchedAt: "2026-04-12T12:00:00Z",
        sourceLabel: "bright-data",
      });
      expect(ctx.medianDom).toBeUndefined();
      expect(ctx.inventoryCount).toBe(0);
      expect(ctx.salesVelocity).toBe(0);
    });
  });
});
