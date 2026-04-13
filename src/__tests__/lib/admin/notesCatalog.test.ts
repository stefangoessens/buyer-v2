import { describe, expect, it } from "vitest";
import {
  NOTE_VISIBILITIES,
  NOTE_SUBJECT_TYPES,
  NOTE_BODY_MIN_CHARS,
  NOTE_BODY_MAX_CHARS,
  canCreateVisibility,
  canReadVisibility,
  isNoteSubjectType,
  isNoteVisibility,
  validateNoteBody,
} from "@/lib/admin/notesCatalog";

describe("admin/notesCatalog", () => {
  describe("NOTE_VISIBILITIES / NOTE_SUBJECT_TYPES", () => {
    it("contains canonical visibility keys", () => {
      expect(NOTE_VISIBILITIES).toEqual([
        "internal",
        "broker_only",
        "admin_only",
      ]);
    });
    it("contains canonical subject types", () => {
      expect(NOTE_SUBJECT_TYPES).toEqual([
        "dealRoom",
        "offer",
        "contract",
        "tour",
        "buyer",
        "property",
      ]);
    });
  });

  describe("isNoteVisibility", () => {
    it("accepts declared visibilities", () => {
      for (const v of NOTE_VISIBILITIES) expect(isNoteVisibility(v)).toBe(true);
    });
    it("rejects unknown visibilities", () => {
      expect(isNoteVisibility("public")).toBe(false);
      expect(isNoteVisibility("")).toBe(false);
    });
  });

  describe("isNoteSubjectType", () => {
    it("accepts declared subject types", () => {
      for (const t of NOTE_SUBJECT_TYPES) expect(isNoteSubjectType(t)).toBe(true);
    });
    it("rejects unknown subject types", () => {
      expect(isNoteSubjectType("dashboard")).toBe(false);
    });
  });

  describe("validateNoteBody", () => {
    it("rejects empty body", () => {
      expect(validateNoteBody("").ok).toBe(false);
      expect(validateNoteBody("     ").ok).toBe(false);
    });

    it("accepts one-character body", () => {
      expect(validateNoteBody("a".repeat(NOTE_BODY_MIN_CHARS)).ok).toBe(true);
    });

    it("accepts body at the max length", () => {
      expect(validateNoteBody("a".repeat(NOTE_BODY_MAX_CHARS)).ok).toBe(true);
    });

    it("rejects body over the max length", () => {
      const result = validateNoteBody("a".repeat(NOTE_BODY_MAX_CHARS + 1));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain(String(NOTE_BODY_MAX_CHARS));
    });
  });

  describe("canCreateVisibility", () => {
    it("admin can create every visibility", () => {
      for (const v of NOTE_VISIBILITIES) {
        expect(canCreateVisibility("admin", v)).toBe(true);
      }
    });
    it("broker cannot create admin_only notes", () => {
      expect(canCreateVisibility("broker", "admin_only")).toBe(false);
    });
    it("broker can create internal and broker_only notes", () => {
      expect(canCreateVisibility("broker", "internal")).toBe(true);
      expect(canCreateVisibility("broker", "broker_only")).toBe(true);
    });
    it("null/undefined role cannot create anything", () => {
      expect(canCreateVisibility(null, "internal")).toBe(false);
      expect(canCreateVisibility(undefined, "broker_only")).toBe(false);
    });
  });

  describe("canReadVisibility", () => {
    it("admin can read every visibility", () => {
      for (const v of NOTE_VISIBILITIES) {
        expect(canReadVisibility("admin", v)).toBe(true);
      }
    });
    it("broker cannot read admin_only", () => {
      expect(canReadVisibility("broker", "admin_only")).toBe(false);
    });
    it("broker can read internal and broker_only", () => {
      expect(canReadVisibility("broker", "internal")).toBe(true);
      expect(canReadVisibility("broker", "broker_only")).toBe(true);
    });
    it("null role cannot read anything", () => {
      expect(canReadVisibility(null, "internal")).toBe(false);
      expect(canReadVisibility(undefined, "admin_only")).toBe(false);
    });
  });
});
