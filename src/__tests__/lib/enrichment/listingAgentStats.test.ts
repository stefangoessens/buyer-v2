import { describe, expect, it } from "vitest";
import {
  canonicalizeAgentId,
  computeAvgDaysOnMarket,
  computeMedianListToSellRatio,
  computePriceCutFrequency,
  countActive,
  countSold,
  type AgentListingSample,
} from "@/lib/enrichment/listingAgentStats";

const samples: AgentListingSample[] = [
  { listPrice: 500_000, soldPrice: 485_000, dom: 22, priceCutCount: 1, status: "sold" },
  { listPrice: 600_000, soldPrice: 610_000, dom: 8, priceCutCount: 0, status: "sold" },
  { listPrice: 700_000, soldPrice: 660_000, dom: 55, priceCutCount: 2, status: "sold" },
  { listPrice: 450_000, dom: 12, priceCutCount: 0, status: "active" },
  { listPrice: 520_000, dom: 2, priceCutCount: 0, status: "active" },
  { listPrice: 800_000, dom: 30, priceCutCount: 1, status: "pending" },
];

describe("enrichment/listingAgentStats", () => {
  describe("computeMedianListToSellRatio", () => {
    it("computes the median of sold samples", () => {
      const ratio = computeMedianListToSellRatio(samples);
      // ratios: 485/500=0.97, 610/600≈1.0167, 660/700≈0.9429
      // sorted: 0.9429, 0.97, 1.0167 → median 0.97
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeCloseTo(0.97, 2);
    });

    it("ignores active/pending samples", () => {
      const onlyActive: AgentListingSample[] = [
        { listPrice: 500_000, dom: 10, priceCutCount: 0, status: "active" },
      ];
      expect(computeMedianListToSellRatio(onlyActive)).toBeNull();
    });

    it("returns null when no sold samples have both prices", () => {
      const broken: AgentListingSample[] = [
        { listPrice: 500_000, dom: 20, priceCutCount: 0, status: "sold" },
      ];
      expect(computeMedianListToSellRatio(broken)).toBeNull();
    });
  });

  describe("computeAvgDaysOnMarket", () => {
    it("averages DOM across sold samples only", () => {
      // sold DOM: 22, 8, 55 → avg 28.33
      const avg = computeAvgDaysOnMarket(samples);
      expect(avg).not.toBeNull();
      expect(avg!).toBeCloseTo(28.33, 1);
    });

    it("returns null when no sold samples", () => {
      const noSold: AgentListingSample[] = [
        { listPrice: 500_000, dom: 10, priceCutCount: 0, status: "active" },
      ];
      expect(computeAvgDaysOnMarket(noSold)).toBeNull();
    });
  });

  describe("computePriceCutFrequency", () => {
    it("returns the fraction of samples with >=1 price cut", () => {
      // samples with price cut: 3 of 6 = 0.5
      expect(computePriceCutFrequency(samples)).toBeCloseTo(0.5, 2);
    });

    it("returns 0 for empty samples", () => {
      expect(computePriceCutFrequency([])).toBe(0);
    });
  });

  describe("countActive / countSold", () => {
    it("counts the right statuses", () => {
      expect(countActive(samples)).toBe(2);
      expect(countSold(samples)).toBe(3);
    });
  });

  describe("canonicalizeAgentId", () => {
    it("is deterministic across calls", () => {
      const a = canonicalizeAgentId({ name: "Jane Smith", brokerage: "Coldwell Banker" });
      const b = canonicalizeAgentId({ name: "Jane Smith", brokerage: "Coldwell Banker" });
      expect(a).toBe(b);
    });

    it("normalizes case and whitespace", () => {
      const a = canonicalizeAgentId({ name: "Jane  Smith", brokerage: "COLDWELL banker" });
      const b = canonicalizeAgentId({ name: "jane smith", brokerage: "coldwell banker" });
      expect(a).toBe(b);
    });

    it("produces different IDs for different brokerages", () => {
      const a = canonicalizeAgentId({ name: "Jane Smith", brokerage: "Coldwell" });
      const b = canonicalizeAgentId({ name: "Jane Smith", brokerage: "Compass" });
      expect(a).not.toBe(b);
    });

    it("accepts missing brokerage", () => {
      const id = canonicalizeAgentId({ name: "Jane Smith" });
      expect(id).toContain("jane");
    });
  });
});
