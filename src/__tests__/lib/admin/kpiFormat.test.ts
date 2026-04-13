import { describe, expect, it } from "vitest";
import { computeDelta, formatKpiValue } from "@/lib/admin/kpiFormat";

describe("admin/kpiFormat", () => {
  describe("formatKpiValue", () => {
    it("formats counts with commas", () => {
      expect(formatKpiValue(1234, "count")).toBe("1,234");
    });
    it("formats percents", () => {
      expect(formatKpiValue(0.123, "percent")).toBe("12.3%");
    });
    it("formats short durations in ms", () => {
      expect(formatKpiValue(500, "duration_ms")).toBe("500ms");
    });
    it("formats seconds", () => {
      expect(formatKpiValue(5000, "duration_ms")).toBe("5s");
    });
    it("formats minutes", () => {
      expect(formatKpiValue(2.5 * 60 * 1000, "duration_ms")).toBe("2.5m");
    });
    it("formats hours", () => {
      expect(formatKpiValue(3 * 60 * 60 * 1000, "duration_ms")).toBe("3.0h");
    });
    it("formats days", () => {
      expect(formatKpiValue(2.5 * 24 * 60 * 60 * 1000, "duration_ms")).toBe("2.5d");
    });
    it("formats currency", () => {
      expect(formatKpiValue(1500, "currency_usd")).toBe("$1,500");
    });
    it("returns em-dash for null/undefined/NaN", () => {
      expect(formatKpiValue(null, "count")).toBe("—");
      expect(formatKpiValue(undefined, "count")).toBe("—");
      expect(formatKpiValue(Number.NaN, "count")).toBe("—");
    });
  });

  describe("computeDelta", () => {
    it("positive delta for higher_better is positive tone", () => {
      const delta = computeDelta(120, 100, "higher_better");
      expect(delta.direction).toBe("up");
      expect(delta.tone).toBe("positive");
      expect(delta.text).toContain("20");
    });

    it("negative delta for higher_better is negative tone", () => {
      const delta = computeDelta(80, 100, "higher_better");
      expect(delta.direction).toBe("down");
      expect(delta.tone).toBe("negative");
    });

    it("negative delta for lower_better is positive tone", () => {
      const delta = computeDelta(100, 150, "lower_better");
      expect(delta.direction).toBe("down");
      expect(delta.tone).toBe("positive");
    });

    it("neutral direction always neutral tone", () => {
      expect(computeDelta(200, 100, "neutral").tone).toBe("neutral");
      expect(computeDelta(50, 100, "neutral").tone).toBe("neutral");
    });

    it("flat delta is flat direction", () => {
      const delta = computeDelta(100, 100, "higher_better");
      expect(delta.direction).toBe("flat");
    });

    it("missing current or previous returns flat", () => {
      expect(computeDelta(null, 100, "higher_better").direction).toBe("flat");
      expect(computeDelta(100, null, "higher_better").direction).toBe("flat");
      expect(computeDelta(undefined, undefined, "higher_better").text).toBe("—");
    });

    it("previous zero falls back to raw delta text", () => {
      const delta = computeDelta(50, 0, "higher_better");
      expect(delta.percentDelta).toBeNull();
      expect(delta.text).toContain("50");
    });
  });
});
