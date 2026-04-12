import { describe, expect, it } from "vitest";
import {
  canAccessInternalConsole,
  hasAtLeastRole,
  roleLabel,
  INTERNAL_CONSOLE_ROLES,
} from "@/lib/admin/roles";

describe("admin/roles", () => {
  describe("canAccessInternalConsole", () => {
    it("allows broker and admin", () => {
      expect(canAccessInternalConsole("broker")).toBe(true);
      expect(canAccessInternalConsole("admin")).toBe(true);
    });

    it("denies buyer", () => {
      expect(canAccessInternalConsole("buyer")).toBe(false);
    });

    it("denies null and undefined", () => {
      expect(canAccessInternalConsole(null)).toBe(false);
      expect(canAccessInternalConsole(undefined)).toBe(false);
    });
  });

  describe("hasAtLeastRole", () => {
    it("admin satisfies broker", () => {
      expect(hasAtLeastRole("admin", "broker")).toBe(true);
    });

    it("admin satisfies admin", () => {
      expect(hasAtLeastRole("admin", "admin")).toBe(true);
    });

    it("broker satisfies broker", () => {
      expect(hasAtLeastRole("broker", "broker")).toBe(true);
    });

    it("broker does NOT satisfy admin", () => {
      expect(hasAtLeastRole("broker", "admin")).toBe(false);
    });

    it("buyer satisfies nothing", () => {
      expect(hasAtLeastRole("buyer", "broker")).toBe(false);
      expect(hasAtLeastRole("buyer", "admin")).toBe(false);
    });

    it("null/undefined actor satisfies nothing", () => {
      expect(hasAtLeastRole(null, "broker")).toBe(false);
      expect(hasAtLeastRole(undefined, "admin")).toBe(false);
    });
  });

  describe("roleLabel", () => {
    it("returns human labels for every role", () => {
      expect(roleLabel("admin")).toBe("Admin");
      expect(roleLabel("broker")).toBe("Broker");
      expect(roleLabel("buyer")).toBe("Buyer");
    });
  });

  describe("INTERNAL_CONSOLE_ROLES", () => {
    it("is the closed set of internal roles", () => {
      expect(INTERNAL_CONSOLE_ROLES).toEqual(["broker", "admin"]);
    });
  });
});
