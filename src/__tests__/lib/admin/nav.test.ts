import { describe, expect, it } from "vitest";
import {
  STATIC_NAV_ITEMS,
  NAV_SECTION_ORDER,
  NAV_SECTION_LABELS,
  isNavItemAllowedForRole,
  filterNavItemsForRole,
  groupNavItemsBySection,
  findActiveNavSlug,
  type NavItem,
} from "@/lib/admin/nav";

describe("admin/nav", () => {
  describe("STATIC_NAV_ITEMS", () => {
    it("has unique slugs", () => {
      const slugs = STATIC_NAV_ITEMS.map((item) => item.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("every slug has a valid section in NAV_SECTION_ORDER", () => {
      for (const item of STATIC_NAV_ITEMS) {
        expect(NAV_SECTION_ORDER).toContain(item.section);
      }
    });

    it("every section has a matching label", () => {
      for (const section of NAV_SECTION_ORDER) {
        expect(NAV_SECTION_LABELS[section]).toBeTruthy();
      }
    });

    it("assigns at least one role to every item", () => {
      for (const item of STATIC_NAV_ITEMS) {
        expect(item.allowedRoles.length).toBeGreaterThan(0);
      }
    });
  });

  describe("isNavItemAllowedForRole", () => {
    it("allows items that include the role", () => {
      expect(
        isNavItemAllowedForRole({ allowedRoles: ["broker", "admin"] }, "broker"),
      ).toBe(true);
      expect(
        isNavItemAllowedForRole({ allowedRoles: ["admin"] }, "admin"),
      ).toBe(true);
    });

    it("denies items that exclude the role", () => {
      expect(
        isNavItemAllowedForRole({ allowedRoles: ["admin"] }, "broker"),
      ).toBe(false);
    });
  });

  describe("filterNavItemsForRole", () => {
    it("returns only items the role can see", () => {
      const broker = filterNavItemsForRole(STATIC_NAV_ITEMS, "broker");
      // Admin-only items (overrides, settings) should not appear
      expect(broker.map((i) => i.slug)).not.toContain("overrides");
      expect(broker.map((i) => i.slug)).not.toContain("settings");
      // Shared items should appear
      expect(broker.map((i) => i.slug)).toContain("console");
      expect(broker.map((i) => i.slug)).toContain("queues");
      expect(broker.map((i) => i.slug)).toContain("metrics");
    });

    it("admin sees strict superset of broker", () => {
      const broker = filterNavItemsForRole(STATIC_NAV_ITEMS, "broker").map(
        (i) => i.slug,
      );
      const admin = filterNavItemsForRole(STATIC_NAV_ITEMS, "admin").map(
        (i) => i.slug,
      );
      for (const slug of broker) expect(admin).toContain(slug);
      expect(admin.length).toBeGreaterThanOrEqual(broker.length);
    });

    it("preserves declaration order", () => {
      const admin = filterNavItemsForRole(STATIC_NAV_ITEMS, "admin");
      const sourceSlugs = STATIC_NAV_ITEMS.filter((i) =>
        i.allowedRoles.includes("admin"),
      ).map((i) => i.slug);
      expect(admin.map((i) => i.slug)).toEqual(sourceSlugs);
    });
  });

  describe("groupNavItemsBySection", () => {
    const mkItem = (
      slug: string,
      section: NavItem["section"],
    ): NavItem => ({
      slug,
      label: slug,
      href: `/${slug}`,
      section,
      allowedRoles: ["admin"],
    });

    it("groups items by section in NAV_SECTION_ORDER", () => {
      const items: NavItem[] = [
        mkItem("settings", "settings"),
        mkItem("console", "overview"),
        mkItem("overrides", "tools"),
        mkItem("queues", "queues"),
      ];
      const grouped = groupNavItemsBySection(items);
      expect(grouped.map((g) => g.section)).toEqual([
        "overview",
        "queues",
        "tools",
        "settings",
      ]);
    });

    it("omits empty sections", () => {
      const items = [mkItem("console", "overview")];
      const grouped = groupNavItemsBySection(items);
      expect(grouped).toHaveLength(1);
      expect(grouped[0]!.section).toBe("overview");
    });

    it("returns an empty array for no items", () => {
      expect(groupNavItemsBySection([])).toEqual([]);
    });

    it("keeps multiple items in the same section in input order", () => {
      const items = [
        mkItem("notes", "tools"),
        mkItem("overrides", "tools"),
      ];
      const grouped = groupNavItemsBySection(items);
      expect(grouped[0]!.items.map((i) => i.slug)).toEqual([
        "notes",
        "overrides",
      ]);
    });
  });

  describe("findActiveNavSlug", () => {
    const items = [
      { slug: "console", href: "/console" },
      { slug: "queues", href: "/queues" },
      { slug: "metrics", href: "/metrics" },
    ];

    it("matches exact pathname", () => {
      expect(findActiveNavSlug(items, "/queues")).toBe("queues");
    });

    it("matches a subroute as the parent", () => {
      expect(findActiveNavSlug(items, "/queues/intake_review")).toBe(
        "queues",
      );
    });

    it("prefers the longest-matching href", () => {
      const deeper = [
        { slug: "metrics", href: "/metrics" },
        { slug: "metric_detail", href: "/metrics/funnel" },
      ];
      expect(findActiveNavSlug(deeper, "/metrics/funnel/deal_room")).toBe(
        "metric_detail",
      );
    });

    it("returns null if nothing matches", () => {
      expect(findActiveNavSlug(items, "/access-denied")).toBeNull();
    });

    it("returns null for missing pathname", () => {
      expect(findActiveNavSlug(items, null)).toBeNull();
      expect(findActiveNavSlug(items, undefined)).toBeNull();
      expect(findActiveNavSlug(items, "")).toBeNull();
    });

    it("does not cross route boundaries", () => {
      // /queuesabc must NOT match /queues
      expect(findActiveNavSlug(items, "/queuesabc")).toBeNull();
    });
  });
});
