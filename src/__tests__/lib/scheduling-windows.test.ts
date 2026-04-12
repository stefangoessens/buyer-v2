import { describe, it, expect } from "vitest";
import {
  normalizeWindow,
  windowsOverlap,
  toUtc,
  isValidTimezone,
  formatDuration,
  MAX_WINDOW_DURATION_HOURS,
  type NormalizedWindow,
} from "@/lib/scheduling/windows";

describe("scheduling/windows", () => {
  describe("MAX_WINDOW_DURATION_HOURS", () => {
    it("equals 168 hours (1 week)", () => {
      expect(MAX_WINDOW_DURATION_HOURS).toBe(24 * 7);
      expect(MAX_WINDOW_DURATION_HOURS).toBe(168);
    });
  });

  describe("normalizeWindow — timezone conversion", () => {
    it("normalizes a valid NYC window to correct UTC", () => {
      const result = normalizeWindow(
        "2026-05-01T14:00:00-04:00",
        "2026-05-01T15:00:00-04:00",
        "America/New_York"
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.normalized.startUtc).toBe("2026-05-01T18:00:00.000Z");
        expect(result.normalized.endUtc).toBe("2026-05-01T19:00:00.000Z");
        expect(result.normalized.timezone).toBe("America/New_York");
        expect(result.normalized.startLocal).toBe("2026-05-01T14:00:00-04:00");
        expect(result.normalized.endLocal).toBe("2026-05-01T15:00:00-04:00");
      }
    });

    it("normalizes a valid LA window to correct UTC", () => {
      const result = normalizeWindow(
        "2026-05-01T10:00:00-07:00",
        "2026-05-01T11:00:00-07:00",
        "America/Los_Angeles"
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.normalized.startUtc).toBe("2026-05-01T17:00:00.000Z");
        expect(result.normalized.endUtc).toBe("2026-05-01T18:00:00.000Z");
        expect(result.normalized.timezone).toBe("America/Los_Angeles");
      }
    });

    it("normalizes a valid UTC window with Z suffix", () => {
      const result = normalizeWindow(
        "2026-05-01T14:00:00Z",
        "2026-05-01T15:00:00Z",
        "UTC"
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.normalized.startUtc).toBe("2026-05-01T14:00:00.000Z");
        expect(result.normalized.endUtc).toBe("2026-05-01T15:00:00.000Z");
        expect(result.normalized.timezone).toBe("UTC");
      }
    });

    it("computes durationMs for a 1-hour window", () => {
      const result = normalizeWindow(
        "2026-05-01T14:00:00-04:00",
        "2026-05-01T15:00:00-04:00",
        "America/New_York"
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.normalized.durationMs).toBe(3600000);
      }
    });

    it("preserves original start/end local strings", () => {
      const start = "2026-06-15T09:30:00-05:00";
      const end = "2026-06-15T11:45:00-05:00";
      const result = normalizeWindow(start, end, "America/Chicago");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.normalized.startLocal).toBe(start);
        expect(result.normalized.endLocal).toBe(end);
      }
    });
  });

  describe("normalizeWindow — invalid-window paths", () => {
    it("returns invalid_start for an unparseable start ISO", () => {
      const result = normalizeWindow(
        "not-a-date",
        "2026-05-01T15:00:00Z",
        "UTC"
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === "invalid_start")).toBe(
          true
        );
      }
    });

    it("returns invalid_end for an unparseable end ISO", () => {
      const result = normalizeWindow(
        "2026-05-01T14:00:00Z",
        "also-not-a-date",
        "UTC"
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === "invalid_end")).toBe(true);
      }
    });

    it("returns end_before_start when end is before start", () => {
      const result = normalizeWindow(
        "2026-05-01T15:00:00Z",
        "2026-05-01T14:00:00Z",
        "UTC"
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === "end_before_start")).toBe(
          true
        );
      }
    });

    it("returns zero_duration when start equals end", () => {
      const result = normalizeWindow(
        "2026-05-01T14:00:00Z",
        "2026-05-01T14:00:00Z",
        "UTC"
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === "zero_duration")).toBe(
          true
        );
        expect(result.errors.some((e) => e.code === "end_before_start")).toBe(
          false
        );
      }
    });

    it("returns invalid_timezone for a fictional IANA name", () => {
      const result = normalizeWindow(
        "2026-05-01T14:00:00Z",
        "2026-05-01T15:00:00Z",
        "Mars/Olympus_Mons"
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === "invalid_timezone")).toBe(
          true
        );
      }
    });

    it("returns window_too_long for a window > 168h", () => {
      // 169h window
      const result = normalizeWindow(
        "2026-05-01T00:00:00Z",
        "2026-05-08T01:00:00Z",
        "UTC"
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === "window_too_long")).toBe(
          true
        );
      }
    });
  });

  describe("normalizeWindow — accumulation and edge cases", () => {
    it("accumulates multiple errors: invalid start AND invalid timezone", () => {
      const result = normalizeWindow(
        "not-a-date",
        "2026-05-01T15:00:00Z",
        "Mars/Olympus_Mons"
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === "invalid_start")).toBe(
          true
        );
        expect(result.errors.some((e) => e.code === "invalid_timezone")).toBe(
          true
        );
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("reports only zero_duration when start === end (not end_before_start)", () => {
      const result = normalizeWindow(
        "2026-05-01T12:00:00Z",
        "2026-05-01T12:00:00Z",
        "UTC"
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        const codes = result.errors.map((e) => e.code);
        expect(codes).toContain("zero_duration");
        expect(codes).not.toContain("end_before_start");
      }
    });

    it("accepts a window exactly at MAX_WINDOW_DURATION_HOURS (168h)", () => {
      const result = normalizeWindow(
        "2026-05-01T00:00:00Z",
        "2026-05-08T00:00:00Z",
        "UTC"
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.normalized.durationMs).toBe(
          MAX_WINDOW_DURATION_HOURS * 60 * 60 * 1000
        );
      }
    });

    it("rejects a window 1ms over MAX_WINDOW_DURATION_HOURS", () => {
      const result = normalizeWindow(
        "2026-05-01T00:00:00.000Z",
        "2026-05-08T00:00:00.001Z",
        "UTC"
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === "window_too_long")).toBe(
          true
        );
      }
    });

    it("skips duration checks when either bound is unparseable", () => {
      // Both bounds bad — should only report invalid_start + invalid_end,
      // NOT end_before_start or zero_duration (duration isn't computed).
      const result = normalizeWindow("garbage", "also-garbage", "UTC");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        const codes = result.errors.map((e) => e.code);
        expect(codes).toContain("invalid_start");
        expect(codes).toContain("invalid_end");
        expect(codes).not.toContain("end_before_start");
        expect(codes).not.toContain("zero_duration");
      }
    });
  });

  describe("windowsOverlap", () => {
    const makeWindow = (startUtc: string, endUtc: string): NormalizedWindow => ({
      startUtc,
      endUtc,
      startLocal: startUtc,
      endLocal: endUtc,
      timezone: "UTC",
      durationMs: new Date(endUtc).getTime() - new Date(startUtc).getTime(),
    });

    it("returns false for two clearly non-overlapping windows", () => {
      const a = makeWindow("2026-05-01T10:00:00.000Z", "2026-05-01T11:00:00.000Z");
      const b = makeWindow("2026-05-01T13:00:00.000Z", "2026-05-01T14:00:00.000Z");
      expect(windowsOverlap(a, b)).toBe(false);
      expect(windowsOverlap(b, a)).toBe(false);
    });

    it("returns true for a partial overlap", () => {
      const a = makeWindow("2026-05-01T10:00:00.000Z", "2026-05-01T12:00:00.000Z");
      const b = makeWindow("2026-05-01T11:00:00.000Z", "2026-05-01T13:00:00.000Z");
      expect(windowsOverlap(a, b)).toBe(true);
      expect(windowsOverlap(b, a)).toBe(true);
    });

    it("returns true when one window is fully contained in the other", () => {
      const outer = makeWindow(
        "2026-05-01T09:00:00.000Z",
        "2026-05-01T17:00:00.000Z"
      );
      const inner = makeWindow(
        "2026-05-01T12:00:00.000Z",
        "2026-05-01T13:00:00.000Z"
      );
      expect(windowsOverlap(outer, inner)).toBe(true);
      expect(windowsOverlap(inner, outer)).toBe(true);
    });

    it("returns true for identical windows", () => {
      const a = makeWindow("2026-05-01T10:00:00.000Z", "2026-05-01T11:00:00.000Z");
      const b = makeWindow("2026-05-01T10:00:00.000Z", "2026-05-01T11:00:00.000Z");
      expect(windowsOverlap(a, b)).toBe(true);
    });

    it("returns false for touching edges (strict: end of A === start of B)", () => {
      const a = makeWindow("2026-05-01T10:00:00.000Z", "2026-05-01T11:00:00.000Z");
      const b = makeWindow("2026-05-01T11:00:00.000Z", "2026-05-01T12:00:00.000Z");
      expect(windowsOverlap(a, b)).toBe(false);
      expect(windowsOverlap(b, a)).toBe(false);
    });

    it("detects overlap across different local timezones (UTC is source of truth)", () => {
      // NYC 14:00-15:00 EDT = 18:00-19:00 UTC
      const nyc = normalizeWindow(
        "2026-05-01T14:00:00-04:00",
        "2026-05-01T15:00:00-04:00",
        "America/New_York"
      );
      // LA 11:00-12:00 PDT = 18:00-19:00 UTC (same wall-clock UTC hour!)
      const la = normalizeWindow(
        "2026-05-01T11:00:00-07:00",
        "2026-05-01T12:00:00-07:00",
        "America/Los_Angeles"
      );
      expect(nyc.valid).toBe(true);
      expect(la.valid).toBe(true);
      if (nyc.valid && la.valid) {
        expect(windowsOverlap(nyc.normalized, la.normalized)).toBe(true);
      }
    });
  });

  describe("toUtc", () => {
    it("converts an ISO with offset to the correct UTC ISO", () => {
      expect(toUtc("2026-05-01T14:00:00-04:00")).toBe("2026-05-01T18:00:00.000Z");
    });

    it("round-trips an input that already has the Z suffix", () => {
      expect(toUtc("2026-05-01T14:00:00Z")).toBe("2026-05-01T14:00:00.000Z");
    });

    it("throws on invalid input", () => {
      expect(() => toUtc("definitely-not-a-date")).toThrow(/Invalid ISO-8601/);
    });
  });

  describe("isValidTimezone", () => {
    it("accepts valid IANA names", () => {
      expect(isValidTimezone("America/New_York")).toBe(true);
      expect(isValidTimezone("Europe/London")).toBe(true);
      expect(isValidTimezone("Asia/Tokyo")).toBe(true);
      expect(isValidTimezone("UTC")).toBe(true);
    });

    it("rejects an empty string", () => {
      expect(isValidTimezone("")).toBe(false);
    });

    it("rejects a fictional IANA name", () => {
      expect(isValidTimezone("Not/Real")).toBe(false);
      expect(isValidTimezone("Mars/Olympus_Mons")).toBe(false);
    });
  });

  describe("formatDuration", () => {
    it("formats sub-minute durations in seconds", () => {
      expect(formatDuration(0)).toBe("0s");
      expect(formatDuration(5000)).toBe("5s");
      expect(formatDuration(59_000)).toBe("59s");
    });

    it("formats exact 1-hour duration", () => {
      expect(formatDuration(60 * 60 * 1000)).toBe("1h");
    });

    it("formats 1h 30m", () => {
      expect(formatDuration((60 + 30) * 60 * 1000)).toBe("1h 30m");
    });

    it("formats 2d 3h", () => {
      expect(formatDuration((2 * 24 + 3) * 60 * 60 * 1000)).toBe("2d 3h");
    });

    it("formats exact whole-day duration without trailing hours", () => {
      expect(formatDuration(3 * 24 * 60 * 60 * 1000)).toBe("3d");
    });

    it("formats whole-minute durations without trailing seconds", () => {
      expect(formatDuration(5 * 60 * 1000)).toBe("5m");
    });

    it("formats 45m correctly (sub-hour multi-minute)", () => {
      expect(formatDuration(45 * 60 * 1000)).toBe("45m");
    });

    it("returns 'unknown' for non-finite inputs", () => {
      expect(formatDuration(NaN)).toBe("unknown");
      expect(formatDuration(Infinity)).toBe("unknown");
    });

    it("formats negative durations with a leading '-'", () => {
      expect(formatDuration(-60 * 60 * 1000)).toBe("-1h");
    });
  });
});
