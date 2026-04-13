import { describe, expect, it } from "vitest";
import {
  OVERRIDE_CATALOG,
  OVERRIDE_BY_KEY,
  OVERRIDE_REASON_CODES,
  OVERRIDE_REASON_DETAIL_MIN_CHARS,
  OVERRIDE_REASON_DETAIL_MAX_CHARS,
  canExecuteOverride,
  isKnownOverrideKey,
  isOverrideReason,
  validateOverrideValue,
  validateReasonDetail,
  type OverrideFieldDef,
} from "@/lib/admin/overrideCatalog";

describe("admin/overrideCatalog", () => {
  describe("OVERRIDE_CATALOG", () => {
    it("has unique keys", () => {
      const keys = OVERRIDE_CATALOG.map((o) => o.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("indexes every entry in OVERRIDE_BY_KEY", () => {
      for (const entry of OVERRIDE_CATALOG) {
        expect(OVERRIDE_BY_KEY[entry.key]).toEqual(entry);
      }
    });

    it("enum fields always have enumValues", () => {
      for (const entry of OVERRIDE_CATALOG) {
        if (entry.valueType === "enum") {
          expect(entry.enumValues).toBeDefined();
          expect(entry.enumValues!.length).toBeGreaterThan(0);
        }
      }
    });

    it("every entry has at least one allowed role", () => {
      for (const entry of OVERRIDE_CATALOG) {
        expect(entry.allowedRoles.length).toBeGreaterThan(0);
      }
    });
  });

  describe("isKnownOverrideKey", () => {
    it("accepts known keys", () => {
      expect(isKnownOverrideKey("dealRoom.status")).toBe(true);
    });
    it("rejects unknown keys", () => {
      expect(isKnownOverrideKey("zzz.unknown")).toBe(false);
    });
  });

  describe("isOverrideReason", () => {
    it("accepts declared codes", () => {
      for (const code of OVERRIDE_REASON_CODES) expect(isOverrideReason(code)).toBe(true);
    });
    it("rejects unknown codes", () => {
      expect(isOverrideReason("unknown_reason")).toBe(false);
    });
  });

  describe("canExecuteOverride", () => {
    const adminOnlyField = OVERRIDE_CATALOG[0]!;
    // Synthetic broker-friendly field — the current live catalog is
    // admin-only, but the role check must still work when a future
    // entry adds broker access.
    const brokerFriendlyField = {
      ...adminOnlyField,
      allowedRoles: ["broker", "admin"] as const,
    };

    it("admin can execute any override", () => {
      for (const entry of OVERRIDE_CATALOG) {
        expect(canExecuteOverride("admin", entry)).toBe(true);
      }
    });

    it("broker is denied on admin-only overrides", () => {
      expect(canExecuteOverride("broker", adminOnlyField)).toBe(false);
    });

    it("broker can execute fields that include broker in allowedRoles", () => {
      expect(canExecuteOverride("broker", brokerFriendlyField)).toBe(true);
    });

    it("null / undefined role cannot execute anything", () => {
      expect(canExecuteOverride(null, adminOnlyField)).toBe(false);
      expect(canExecuteOverride(undefined, adminOnlyField)).toBe(false);
    });
  });

  describe("validateOverrideValue", () => {
    const booleanField: OverrideFieldDef = {
      key: "test.bool",
      label: "t",
      targetType: "property",
      valueType: "boolean",
      description: "",
      allowedRoles: ["admin"],
    };
    const stringField: OverrideFieldDef = {
      key: "test.str",
      label: "t",
      targetType: "property",
      valueType: "string",
      description: "",
      allowedRoles: ["admin"],
    };
    const numberField: OverrideFieldDef = {
      key: "test.num",
      label: "t",
      targetType: "property",
      valueType: "number",
      description: "",
      allowedRoles: ["admin"],
    };
    const enumField: OverrideFieldDef = {
      key: "test.enum",
      label: "t",
      targetType: "property",
      valueType: "enum",
      enumValues: ["a", "b"],
      description: "",
      allowedRoles: ["admin"],
    };

    it("booleans: accepts true/false, rejects otherwise", () => {
      expect(validateOverrideValue(booleanField, true).ok).toBe(true);
      expect(validateOverrideValue(booleanField, false).ok).toBe(true);
      expect(validateOverrideValue(booleanField, "true").ok).toBe(false);
      expect(validateOverrideValue(booleanField, 1).ok).toBe(false);
    });

    it("strings: accepts non-empty, rejects empty/too-long/non-string", () => {
      expect(validateOverrideValue(stringField, "ok").ok).toBe(true);
      expect(validateOverrideValue(stringField, "").ok).toBe(false);
      expect(validateOverrideValue(stringField, 42).ok).toBe(false);
      const long = "a".repeat(501);
      expect(validateOverrideValue(stringField, long).ok).toBe(false);
    });

    it("numbers: accepts finite, rejects NaN/infinity/non-number", () => {
      expect(validateOverrideValue(numberField, 42).ok).toBe(true);
      expect(validateOverrideValue(numberField, 0).ok).toBe(true);
      expect(validateOverrideValue(numberField, -1.5).ok).toBe(true);
      expect(validateOverrideValue(numberField, Number.NaN).ok).toBe(false);
      expect(validateOverrideValue(numberField, Infinity).ok).toBe(false);
      expect(validateOverrideValue(numberField, "42").ok).toBe(false);
    });

    it("enum: accepts listed values, rejects unlisted/non-string", () => {
      expect(validateOverrideValue(enumField, "a").ok).toBe(true);
      expect(validateOverrideValue(enumField, "b").ok).toBe(true);
      expect(validateOverrideValue(enumField, "c").ok).toBe(false);
      expect(validateOverrideValue(enumField, 1).ok).toBe(false);
    });
  });

  describe("validateReasonDetail", () => {
    it("rejects too-short reasons", () => {
      const result = validateReasonDetail("too short");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("10");
    });

    it("rejects whitespace-only reasons", () => {
      expect(validateReasonDetail("          ").ok).toBe(false);
    });

    it("accepts reasons at the minimum boundary", () => {
      expect(validateReasonDetail("a".repeat(OVERRIDE_REASON_DETAIL_MIN_CHARS)).ok).toBe(true);
    });

    it("accepts reasons up to the max", () => {
      expect(
        validateReasonDetail("a".repeat(OVERRIDE_REASON_DETAIL_MAX_CHARS)).ok,
      ).toBe(true);
    });

    it("rejects reasons over the max", () => {
      expect(
        validateReasonDetail("a".repeat(OVERRIDE_REASON_DETAIL_MAX_CHARS + 1)).ok,
      ).toBe(false);
    });
  });
});
