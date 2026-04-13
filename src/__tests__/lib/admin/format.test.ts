import { describe, expect, it } from "vitest";
import {
  formatConsoleTimestamp,
  pluralize,
  initialsFromName,
} from "@/lib/admin/format";

describe("admin/format", () => {
  describe("formatConsoleTimestamp", () => {
    it("returns em-dash for null/undefined/empty", () => {
      expect(formatConsoleTimestamp(null)).toBe("—");
      expect(formatConsoleTimestamp(undefined)).toBe("—");
    });

    it("returns em-dash for invalid dates", () => {
      expect(formatConsoleTimestamp("not-a-date")).toBe("—");
    });

    it("formats a valid ISO date", () => {
      const result = formatConsoleTimestamp("2026-04-12T15:04:00Z");
      expect(result).not.toBe("—");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("pluralize", () => {
    it("uses singular for 1", () => {
      expect(pluralize(1, "item")).toBe("1 item");
    });

    it("uses plural for 0", () => {
      expect(pluralize(0, "item")).toBe("0 items");
    });

    it("uses plural for 2+", () => {
      expect(pluralize(2, "item")).toBe("2 items");
      expect(pluralize(42, "item")).toBe("42 items");
    });

    it("uses explicit plural form when provided", () => {
      expect(pluralize(3, "child", "children")).toBe("3 children");
      expect(pluralize(1, "child", "children")).toBe("1 child");
    });

    it("formats large numbers with commas", () => {
      expect(pluralize(1234, "item")).toBe("1,234 items");
    });
  });

  describe("initialsFromName", () => {
    it("returns two-letter placeholder for missing name", () => {
      expect(initialsFromName(null)).toBe("··");
      expect(initialsFromName(undefined)).toBe("··");
      expect(initialsFromName("")).toBe("··");
      expect(initialsFromName("   ")).toBe("··");
    });

    it("returns first two letters for a single name", () => {
      expect(initialsFromName("Cher")).toBe("CH");
    });

    it("returns first+last initial for multi-part names", () => {
      expect(initialsFromName("Stefan Goessens")).toBe("SG");
      expect(initialsFromName("Mary Anne Smith")).toBe("MS");
    });
  });
});
