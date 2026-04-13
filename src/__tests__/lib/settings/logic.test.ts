import { describe, it, expect } from "vitest";
import {
  SETTINGS_CATALOG,
  assertValueKind,
  canWriteSetting,
  findCatalogEntry,
  isTextKind,
  resolveAllSettings,
  resolveSetting,
  validateSettingValue,
} from "@/lib/settings/logic";
import type {
  SettingValue,
  SettingsCatalog,
} from "@/lib/settings/types";

// MARK: - Fixtures

const TEST_CATALOG: SettingsCatalog = {
  entries: [
    {
      key: "test.string",
      label: "Test string",
      description: "Test entry",
      category: "operational",
      kind: "string",
      writeRole: "broker",
      defaultValue: { kind: "string", value: "default" },
      constraints: {
        minLength: 3,
        maxLength: 20,
        pattern: "^[a-z]+$",
      },
    },
    {
      key: "test.number",
      label: "Test number",
      description: "Test entry",
      category: "fees",
      kind: "number",
      writeRole: "admin",
      defaultValue: { kind: "number", value: 5 },
      constraints: { min: 0, max: 10 },
    },
    {
      key: "test.integer",
      label: "Test integer",
      description: "Test entry",
      category: "fees",
      kind: "number",
      writeRole: "admin",
      defaultValue: { kind: "number", value: 1 },
      constraints: { min: 0, max: 100, integer: true },
    },
    {
      key: "test.boolean",
      label: "Test boolean",
      description: "Test entry",
      category: "rollout",
      kind: "boolean",
      writeRole: "broker",
      defaultValue: { kind: "boolean", value: false },
    },
    {
      key: "test.richtext",
      label: "Test richtext",
      description: "Test entry",
      category: "disclosures",
      kind: "richText",
      writeRole: "admin",
      defaultValue: { kind: "richText", value: "default markdown text." },
      constraints: { minLength: 10, maxLength: 200 },
    },
    {
      key: "test.json",
      label: "Test json",
      description: "Test entry",
      category: "operational",
      kind: "json",
      writeRole: "admin",
      defaultValue: { kind: "json", value: { foo: 1, bar: "x" } },
      constraints: { requiredJsonKeys: ["foo", "bar"] },
    },
    {
      key: "test.bad_pattern",
      label: "Bad catalog pattern",
      description: "Test entry",
      category: "operational",
      kind: "string",
      writeRole: "admin",
      defaultValue: { kind: "string", value: "x" },
      constraints: { pattern: "[invalid(" },
    },
  ],
};

// MARK: - validateSettingValue

describe("validateSettingValue", () => {
  describe("unknown key", () => {
    it("rejects a key not in the catalog", () => {
      const result = validateSettingValue(
        "nope",
        { kind: "string", value: "x" },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]?.kind).toBe("unknownKey");
      }
    });
  });

  describe("kind mismatch", () => {
    it("rejects a string value on a number setting", () => {
      const result = validateSettingValue(
        "test.number",
        { kind: "string", value: "5" },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]?.kind).toBe("kindMismatch");
      }
    });

    it("does not emit other errors when kind is wrong", () => {
      // Early return prevents confusing multi-error cascades.
      const result = validateSettingValue(
        "test.number",
        { kind: "string", value: "x" },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.kind).toBe("kindMismatch");
      }
    });
  });

  describe("string constraints", () => {
    it("accepts a valid string", () => {
      expect(
        validateSettingValue(
          "test.string",
          { kind: "string", value: "hello" },
          TEST_CATALOG
        ).ok
      ).toBe(true);
    });

    it("rejects below-min length", () => {
      const result = validateSettingValue(
        "test.string",
        { kind: "string", value: "ab" },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.kind === "stringTooShort")).toBe(
          true
        );
      }
    });

    it("rejects above-max length", () => {
      const result = validateSettingValue(
        "test.string",
        { kind: "string", value: "x".repeat(21) },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.kind === "stringTooLong")).toBe(
          true
        );
      }
    });

    it("rejects a value that doesn't match the pattern", () => {
      const result = validateSettingValue(
        "test.string",
        { kind: "string", value: "HELLO" },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.kind === "patternMismatch")).toBe(
          true
        );
      }
    });

    it("surfaces a typed error on invalid catalog pattern", () => {
      const result = validateSettingValue(
        "test.bad_pattern",
        { kind: "string", value: "anything" },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some((e) => e.kind === "invalidCatalogPattern")
        ).toBe(true);
      }
    });
  });

  describe("number constraints", () => {
    it("accepts an in-range number", () => {
      expect(
        validateSettingValue(
          "test.number",
          { kind: "number", value: 5 },
          TEST_CATALOG
        ).ok
      ).toBe(true);
    });

    it("rejects below-min", () => {
      const result = validateSettingValue(
        "test.number",
        { kind: "number", value: -1 },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some((e) => e.kind === "numberOutOfRange")
        ).toBe(true);
      }
    });

    it("rejects above-max", () => {
      const result = validateSettingValue(
        "test.number",
        { kind: "number", value: 11 },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
    });

    it("rejects NaN", () => {
      const result = validateSettingValue(
        "test.number",
        { kind: "number", value: Number.NaN },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.kind === "notANumber")).toBe(true);
      }
    });

    it("rejects non-integer on integer field", () => {
      const result = validateSettingValue(
        "test.integer",
        { kind: "number", value: 5.5 },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.kind === "notAnInteger")).toBe(
          true
        );
      }
    });

    it("accepts integer values on integer field", () => {
      expect(
        validateSettingValue(
          "test.integer",
          { kind: "number", value: 42 },
          TEST_CATALOG
        ).ok
      ).toBe(true);
    });
  });

  describe("boolean constraints", () => {
    it("accepts true and false", () => {
      expect(
        validateSettingValue(
          "test.boolean",
          { kind: "boolean", value: true },
          TEST_CATALOG
        ).ok
      ).toBe(true);
      expect(
        validateSettingValue(
          "test.boolean",
          { kind: "boolean", value: false },
          TEST_CATALOG
        ).ok
      ).toBe(true);
    });
  });

  describe("richText constraints", () => {
    it("accepts text within min/max", () => {
      expect(
        validateSettingValue(
          "test.richtext",
          { kind: "richText", value: "This is a valid rich text entry." },
          TEST_CATALOG
        ).ok
      ).toBe(true);
    });

    it("rejects text below minLength", () => {
      const result = validateSettingValue(
        "test.richtext",
        { kind: "richText", value: "too short" },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some((e) => e.kind === "stringTooShort")
        ).toBe(true);
      }
    });
  });

  describe("json constraints", () => {
    it("accepts JSON with every required key", () => {
      expect(
        validateSettingValue(
          "test.json",
          { kind: "json", value: { foo: 1, bar: "x" } },
          TEST_CATALOG
        ).ok
      ).toBe(true);
    });

    it("rejects JSON missing a required key", () => {
      const result = validateSettingValue(
        "test.json",
        { kind: "json", value: { foo: 1 } },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some((e) => e.kind === "missingRequiredJsonKey")
        ).toBe(true);
      }
    });

    it("reports every missing required key", () => {
      const result = validateSettingValue(
        "test.json",
        { kind: "json", value: {} },
        TEST_CATALOG
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const missing = result.errors.filter(
          (e) => e.kind === "missingRequiredJsonKey"
        );
        expect(missing).toHaveLength(2);
      }
    });
  });
});

// MARK: - resolveSetting / resolveAllSettings

describe("resolveSetting", () => {
  it("returns the stored value when present", () => {
    expect(
      resolveSetting(
        "test.string",
        { kind: "string", value: "stored" },
        TEST_CATALOG
      )
    ).toEqual({ kind: "string", value: "stored" });
  });

  it("falls back to the catalog default when no stored value", () => {
    expect(resolveSetting("test.string", undefined, TEST_CATALOG)).toEqual({
      kind: "string",
      value: "default",
    });
  });

  it("returns undefined for unknown keys", () => {
    expect(resolveSetting("nope", undefined, TEST_CATALOG)).toBeUndefined();
  });
});

describe("resolveAllSettings", () => {
  it("populates every catalog key", () => {
    const all = resolveAllSettings({}, TEST_CATALOG);
    for (const entry of TEST_CATALOG.entries) {
      expect(all[entry.key]).toBeDefined();
    }
  });

  it("prefers stored values over defaults", () => {
    const stored: Record<string, SettingValue> = {
      "test.string": { kind: "string", value: "stored" },
    };
    const all = resolveAllSettings(stored, TEST_CATALOG);
    expect(all["test.string"]).toEqual({ kind: "string", value: "stored" });
    expect(all["test.number"]).toEqual({ kind: "number", value: 5 });
  });
});

// MARK: - canWriteSetting

describe("canWriteSetting", () => {
  it("admins can write admin-only entries", () => {
    expect(canWriteSetting("test.number", "admin", TEST_CATALOG)).toEqual({
      ok: true,
    });
  });

  it("admins can write broker-writable entries", () => {
    expect(canWriteSetting("test.string", "admin", TEST_CATALOG)).toEqual({
      ok: true,
    });
  });

  it("brokers can write broker-writable entries", () => {
    expect(canWriteSetting("test.string", "broker", TEST_CATALOG)).toEqual({
      ok: true,
    });
  });

  it("brokers cannot write admin-only entries", () => {
    const result = canWriteSetting("test.number", "broker", TEST_CATALOG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("insufficientRole");
    }
  });

  it("buyers cannot write anything", () => {
    const result = canWriteSetting("test.string", "buyer", TEST_CATALOG);
    expect(result.ok).toBe(false);
  });

  it("returns unknownKey for missing entries", () => {
    const result = canWriteSetting("nope", "admin", TEST_CATALOG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unknownKey");
    }
  });
});

// MARK: - isTextKind / assertValueKind

describe("isTextKind", () => {
  it("is true for string and richText", () => {
    expect(isTextKind("string")).toBe(true);
    expect(isTextKind("richText")).toBe(true);
  });

  it("is false for other kinds", () => {
    expect(isTextKind("number")).toBe(false);
    expect(isTextKind("boolean")).toBe(false);
    expect(isTextKind("json")).toBe(false);
  });
});

describe("assertValueKind", () => {
  it("returns the value when kind matches", () => {
    const value: SettingValue = { kind: "number", value: 5 };
    const narrowed = assertValueKind(value, "number");
    expect(narrowed.value).toBe(5);
  });

  it("throws when kind does not match", () => {
    const value: SettingValue = { kind: "number", value: 5 };
    expect(() => assertValueKind(value, "string")).toThrow(
      /settings kind mismatch/
    );
  });
});

// MARK: - Real catalog

describe("real SETTINGS_CATALOG", () => {
  it("has at least one entry per category", () => {
    const categories = new Set(SETTINGS_CATALOG.entries.map((e) => e.category));
    expect(categories).toContain("disclosures");
    expect(categories).toContain("fees");
    expect(categories).toContain("rollout");
    expect(categories).toContain("operational");
    expect(categories).toContain("branding");
  });

  it("every entry's default value matches its declared kind", () => {
    for (const entry of SETTINGS_CATALOG.entries) {
      expect(entry.defaultValue.kind).toBe(entry.kind);
    }
  });

  it("every entry's default value passes validation", () => {
    for (const entry of SETTINGS_CATALOG.entries) {
      const result = validateSettingValue(entry.key, entry.defaultValue);
      if (!result.ok) {
        throw new Error(
          `default for ${entry.key} failed validation: ${JSON.stringify(result.errors)}`
        );
      }
    }
  });

  it("findCatalogEntry returns the expected entry", () => {
    const entry = findCatalogEntry(
      SETTINGS_CATALOG,
      "fee.default_rebate_pct"
    );
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("number");
  });

  it("every entry has a unique key", () => {
    const keys = SETTINGS_CATALOG.entries.map((e) => e.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
