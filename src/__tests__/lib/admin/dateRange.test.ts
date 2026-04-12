import { describe, expect, it } from "vitest";
import {
  DATE_RANGE_PRESETS,
  formatRangeLabel,
  isDateRangePreset,
  isWithinRange,
  parseRangeFromSearchParams,
  rangeDayCount,
  rangeToSearchParams,
  resolveDateRange,
  type DateRange,
} from "@/lib/admin/dateRange";

const NOW = new Date("2026-04-12T15:30:00.000Z");

describe("admin/dateRange", () => {
  describe("DATE_RANGE_PRESETS", () => {
    it("contains the canonical preset keys", () => {
      expect(DATE_RANGE_PRESETS).toEqual([
        "last_7d",
        "last_30d",
        "last_90d",
        "quarter_to_date",
        "year_to_date",
        "custom",
      ]);
    });
  });

  describe("isDateRangePreset", () => {
    it("matches declared presets", () => {
      for (const preset of DATE_RANGE_PRESETS) expect(isDateRangePreset(preset)).toBe(true);
    });
    it("rejects unknown presets", () => {
      expect(isDateRangePreset("yesterday")).toBe(false);
      expect(isDateRangePreset("")).toBe(false);
    });
  });

  describe("resolveDateRange", () => {
    it("last_7d spans 7 days inclusive of today", () => {
      const range = resolveDateRange("last_7d", NOW);
      expect(range.preset).toBe("last_7d");
      expect(rangeDayCount(range)).toBe(7);
      // start should be 2026-04-06 UTC, end 2026-04-13 UTC
      expect(range.start.slice(0, 10)).toBe("2026-04-06");
      expect(range.end.slice(0, 10)).toBe("2026-04-13");
    });

    it("last_30d spans 30 days", () => {
      const range = resolveDateRange("last_30d", NOW);
      expect(rangeDayCount(range)).toBe(30);
    });

    it("last_90d spans 90 days", () => {
      const range = resolveDateRange("last_90d", NOW);
      expect(rangeDayCount(range)).toBe(90);
    });

    it("quarter_to_date starts at the first day of the quarter", () => {
      const range = resolveDateRange("quarter_to_date", NOW);
      expect(range.start.slice(0, 10)).toBe("2026-04-01");
    });

    it("year_to_date starts on January 1", () => {
      const range = resolveDateRange("year_to_date", NOW);
      expect(range.start.slice(0, 10)).toBe("2026-01-01");
    });

    it("custom with explicit start/end respects them", () => {
      const range = resolveDateRange("custom", NOW, {
        start: "2026-01-15T00:00:00.000Z",
        end: "2026-02-01T00:00:00.000Z",
      });
      expect(range.preset).toBe("custom");
      expect(range.start).toBe("2026-01-15T00:00:00.000Z");
      expect(range.end).toBe("2026-02-01T00:00:00.000Z");
    });

    it("custom with no overrides falls back to last_30d shape", () => {
      const range = resolveDateRange("custom", NOW);
      expect(range.preset).toBe("custom");
      expect(rangeDayCount(range)).toBe(30);
    });
  });

  describe("isWithinRange", () => {
    const range: DateRange = {
      start: "2026-04-06T00:00:00.000Z",
      end: "2026-04-13T00:00:00.000Z",
      preset: "last_7d",
    };
    it("includes the start boundary", () => {
      expect(isWithinRange("2026-04-06T00:00:00.000Z", range)).toBe(true);
    });
    it("excludes the end boundary", () => {
      expect(isWithinRange("2026-04-13T00:00:00.000Z", range)).toBe(false);
    });
    it("matches mid-range timestamps", () => {
      expect(isWithinRange("2026-04-10T12:00:00.000Z", range)).toBe(true);
    });
    it("rejects before-range", () => {
      expect(isWithinRange("2026-04-05T23:59:59.000Z", range)).toBe(false);
    });
    it("rejects invalid timestamps", () => {
      expect(isWithinRange("nope", range)).toBe(false);
    });
  });

  describe("rangeDayCount", () => {
    it("returns 0 when the range is empty", () => {
      expect(
        rangeDayCount({
          start: "2026-04-12T00:00:00.000Z",
          end: "2026-04-12T00:00:00.000Z",
          preset: "custom",
        }),
      ).toBe(0);
    });
    it("returns 1 for a single-day range", () => {
      expect(
        rangeDayCount({
          start: "2026-04-12T00:00:00.000Z",
          end: "2026-04-13T00:00:00.000Z",
          preset: "custom",
        }),
      ).toBe(1);
    });
  });

  describe("formatRangeLabel", () => {
    it("formats a standard range", () => {
      const range: DateRange = {
        start: "2026-04-06T00:00:00.000Z",
        end: "2026-04-13T00:00:00.000Z",
        preset: "last_7d",
      };
      const label = formatRangeLabel(range);
      expect(label).toContain("→");
      expect(label).toMatch(/Apr 6.*Apr 12/);
    });
    it("returns em-dash for invalid range", () => {
      expect(
        formatRangeLabel({ start: "bad", end: "bad", preset: "custom" }),
      ).toBe("—");
    });
  });

  describe("parseRangeFromSearchParams / rangeToSearchParams", () => {
    it("parses a URLSearchParams preset", () => {
      const params = new URLSearchParams("range=last_7d");
      const range = parseRangeFromSearchParams(params, NOW);
      expect(range.preset).toBe("last_7d");
      expect(rangeDayCount(range)).toBe(7);
    });

    it("parses a plain object preset", () => {
      const range = parseRangeFromSearchParams({ range: "last_90d" }, NOW);
      expect(range.preset).toBe("last_90d");
      expect(rangeDayCount(range)).toBe(90);
    });

    it("handles custom range via from/to", () => {
      const range = parseRangeFromSearchParams(
        {
          range: "custom",
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-02-01T00:00:00.000Z",
        },
        NOW,
      );
      expect(range.preset).toBe("custom");
      expect(range.start.slice(0, 10)).toBe("2026-01-01");
    });

    it("defaults to last_30d for unknown presets", () => {
      const range = parseRangeFromSearchParams({ range: "forever" }, NOW);
      expect(range.preset).toBe("last_30d");
    });

    it("rangeToSearchParams omits default preset", () => {
      const range = resolveDateRange("last_30d", NOW);
      expect(rangeToSearchParams(range)).toEqual({});
    });

    it("rangeToSearchParams includes non-default preset", () => {
      const range = resolveDateRange("last_7d", NOW);
      expect(rangeToSearchParams(range)).toEqual({ range: "last_7d" });
    });

    it("rangeToSearchParams serializes custom ranges with from/to", () => {
      const range = resolveDateRange("custom", NOW, {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-02-01T00:00:00.000Z",
      });
      const params = rangeToSearchParams(range);
      expect(params.range).toBe("custom");
      expect(params.from).toBe("2026-01-01T00:00:00.000Z");
      expect(params.to).toBe("2026-02-01T00:00:00.000Z");
    });
  });
});
