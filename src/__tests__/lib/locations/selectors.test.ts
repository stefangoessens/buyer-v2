import { describe, it, expect } from "vitest";
import {
  isValidSlug,
  validateCatalog,
  publicCities,
  publicCommunities,
  findPublicCity,
  findPublicCommunity,
  communitiesForCity,
  resolveCommunityRefs,
  allPublicCitySlugs,
  allPublicCommunitySlugs,
  summarizeCatalog,
} from "@/lib/locations/selectors";
import type {
  CityPageConfig,
  CommunityPageConfig,
  LocationCatalog,
} from "@/lib/locations/types";

// MARK: - Fixtures

function makeCity(overrides: Partial<CityPageConfig> = {}): CityPageConfig {
  return {
    slug: "miami",
    displayName: "Miami",
    state: "FL",
    pageTitle: "Buying a Home in Miami",
    summary:
      "A comprehensive guide to buying a home in Miami, including market snapshots, neighborhoods, and how buyer-v2 helps Miami buyers save at closing.",
    heroHeadline: "Miami home buying",
    heroSubheadline: "Paste any Miami listing link",
    blocks: [{ kind: "hero_paragraph", text: "Miami overview paragraph." }],
    lastUpdated: "2026-04-01",
    visibility: "public",
    ...overrides,
  };
}

function makeCommunity(
  overrides: Partial<CommunityPageConfig> = {}
): CommunityPageConfig {
  return {
    slug: "brickell",
    displayName: "Brickell",
    citySlug: "miami",
    pageTitle: "Buying a Home in Brickell",
    summary:
      "A guide to buying a home in the Brickell neighborhood of Miami, with market data and buyer-v2 analysis tips specific to the area.",
    heroHeadline: "Brickell home buying",
    heroSubheadline: "Paste any Brickell listing",
    blocks: [
      { kind: "hero_paragraph", text: "Brickell overview paragraph." },
    ],
    lastUpdated: "2026-04-01",
    visibility: "public",
    ...overrides,
  };
}

// MARK: - isValidSlug

describe("isValidSlug", () => {
  it("accepts kebab-case slugs", () => {
    expect(isValidSlug("miami")).toBe(true);
    expect(isValidSlug("coconut-grove")).toBe(true);
    expect(isValidSlug("seminole-heights-tampa")).toBe(true);
  });

  it("rejects uppercase", () => {
    expect(isValidSlug("Miami")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidSlug("coconut grove")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });

  it("rejects leading or trailing hyphens", () => {
    expect(isValidSlug("-miami")).toBe(false);
    expect(isValidSlug("miami-")).toBe(false);
  });

  it("rejects double hyphens", () => {
    expect(isValidSlug("miami--fl")).toBe(false);
  });
});

// MARK: - validateCatalog

describe("validateCatalog", () => {
  it("passes for a well-formed minimal catalog", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity()],
      communities: [makeCommunity()],
    };
    expect(validateCatalog(catalog).ok).toBe(true);
  });

  it("detects duplicate city slugs", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity(), makeCity()],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "duplicateSlug" && e.locationKind === "city"
        )
      ).toBe(true);
    }
  });

  it("detects duplicate community slugs", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity()],
      communities: [makeCommunity(), makeCommunity()],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "duplicateSlug" && e.locationKind === "community"
        )
      ).toBe(true);
    }
  });

  it("detects invalid slug format", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity({ slug: "Miami!" })],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "invalidSlug")).toBe(true);
    }
  });

  it("detects community pointing at nonexistent city", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity()],
      communities: [makeCommunity({ citySlug: "nope" })],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "missingCityForCommunity")
      ).toBe(true);
    }
  });

  it("detects empty blocks array", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity({ blocks: [] })],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "emptyBlocks")).toBe(true);
    }
  });

  it("detects summary too short", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity({ summary: "too short" })],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "summaryTooShort")).toBe(
        true
      );
    }
  });

  it("detects summary too long", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity({ summary: "x".repeat(301) })],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "summaryTooLong")).toBe(
        true
      );
    }
  });

  it("detects pageTitle too long", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity({ pageTitle: "x".repeat(80) })],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
  });

  it("collects multiple errors at once", () => {
    const catalog: LocationCatalog = {
      cities: [
        makeCity({ slug: "Miami!", summary: "short", pageTitle: "x".repeat(80) }),
      ],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// MARK: - Visibility filters

describe("publicCities / publicCommunities", () => {
  it("filters out draft cities", () => {
    const catalog: LocationCatalog = {
      cities: [
        makeCity({ slug: "miami", visibility: "public" }),
        makeCity({ slug: "jax", visibility: "draft" }),
      ],
      communities: [],
    };
    expect(publicCities(catalog).map((c) => c.slug)).toEqual(["miami"]);
  });

  it("filters out draft communities", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity()],
      communities: [
        makeCommunity({ slug: "brickell", visibility: "public" }),
        makeCommunity({ slug: "wynwood", visibility: "draft" }),
      ],
    };
    expect(publicCommunities(catalog).map((c) => c.slug)).toEqual([
      "brickell",
    ]);
  });
});

// MARK: - Lookup

describe("findPublicCity / findPublicCommunity", () => {
  const catalog: LocationCatalog = {
    cities: [
      makeCity({ slug: "miami" }),
      makeCity({ slug: "jax-draft", visibility: "draft" }),
    ],
    communities: [
      makeCommunity({ slug: "brickell" }),
      makeCommunity({ slug: "wynwood-draft", visibility: "draft" }),
    ],
  };

  it("finds public city by slug", () => {
    expect(findPublicCity(catalog, "miami")?.slug).toBe("miami");
  });

  it("returns undefined for draft city slug", () => {
    expect(findPublicCity(catalog, "jax-draft")).toBeUndefined();
  });

  it("returns undefined for unknown city slug", () => {
    expect(findPublicCity(catalog, "nope")).toBeUndefined();
  });

  it("finds public community by slug", () => {
    expect(findPublicCommunity(catalog, "brickell")?.slug).toBe("brickell");
  });

  it("returns undefined for draft community slug", () => {
    expect(findPublicCommunity(catalog, "wynwood-draft")).toBeUndefined();
  });
});

// MARK: - communitiesForCity

describe("communitiesForCity", () => {
  it("returns public communities for a given city slug", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity({ slug: "miami" }), makeCity({ slug: "tampa" })],
      communities: [
        makeCommunity({ slug: "brickell", citySlug: "miami" }),
        makeCommunity({ slug: "wynwood", citySlug: "miami" }),
        makeCommunity({ slug: "hyde-park", citySlug: "tampa" }),
      ],
    };
    const miami = communitiesForCity(catalog, "miami").map((c) => c.slug);
    expect(miami).toEqual(["brickell", "wynwood"]);
  });

  it("excludes draft communities", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity({ slug: "miami" })],
      communities: [
        makeCommunity({ slug: "brickell", citySlug: "miami" }),
        makeCommunity({
          slug: "draft-one",
          citySlug: "miami",
          visibility: "draft",
        }),
      ],
    };
    expect(communitiesForCity(catalog, "miami").map((c) => c.slug)).toEqual([
      "brickell",
    ]);
  });

  it("returns empty for unknown city slug", () => {
    const catalog: LocationCatalog = {
      cities: [],
      communities: [],
    };
    expect(communitiesForCity(catalog, "nope")).toEqual([]);
  });
});

// MARK: - resolveCommunityRefs

describe("resolveCommunityRefs", () => {
  const catalog: LocationCatalog = {
    cities: [makeCity()],
    communities: [
      makeCommunity({ slug: "brickell" }),
      makeCommunity({ slug: "wynwood" }),
      makeCommunity({ slug: "draft", visibility: "draft" }),
    ],
  };

  it("resolves slugs in requested order", () => {
    const result = resolveCommunityRefs(catalog, ["wynwood", "brickell"]);
    expect(result.map((c) => c.slug)).toEqual(["wynwood", "brickell"]);
  });

  it("drops unknown slugs silently", () => {
    expect(
      resolveCommunityRefs(catalog, ["brickell", "nope"]).map((c) => c.slug)
    ).toEqual(["brickell"]);
  });

  it("drops draft slugs silently", () => {
    expect(
      resolveCommunityRefs(catalog, ["draft", "brickell"]).map((c) => c.slug)
    ).toEqual(["brickell"]);
  });

  it("returns empty for empty input", () => {
    expect(resolveCommunityRefs(catalog, [])).toEqual([]);
  });
});

// MARK: - Static params

describe("allPublicCitySlugs / allPublicCommunitySlugs", () => {
  it("returns only public city slugs", () => {
    const catalog: LocationCatalog = {
      cities: [
        makeCity({ slug: "miami" }),
        makeCity({ slug: "tampa" }),
        makeCity({ slug: "draft", visibility: "draft" }),
      ],
      communities: [],
    };
    expect(allPublicCitySlugs(catalog)).toEqual(["miami", "tampa"]);
  });

  it("returns only public community slugs", () => {
    const catalog: LocationCatalog = {
      cities: [makeCity()],
      communities: [
        makeCommunity({ slug: "a" }),
        makeCommunity({ slug: "b" }),
        makeCommunity({ slug: "draft", visibility: "draft" }),
      ],
    };
    expect(allPublicCommunitySlugs(catalog)).toEqual(["a", "b"]);
  });
});

// MARK: - summarizeCatalog

describe("summarizeCatalog", () => {
  it("counts public and draft records by kind", () => {
    const catalog: LocationCatalog = {
      cities: [
        makeCity({ slug: "miami", visibility: "public" }),
        makeCity({ slug: "tampa", visibility: "public" }),
        makeCity({ slug: "draft-1", visibility: "draft" }),
      ],
      communities: [
        makeCommunity({ slug: "brickell", visibility: "public" }),
        makeCommunity({ slug: "draft-c", visibility: "draft" }),
      ],
    };
    const summary = summarizeCatalog(catalog);
    expect(summary.publicCityCount).toBe(2);
    expect(summary.draftCityCount).toBe(1);
    expect(summary.publicCommunityCount).toBe(1);
    expect(summary.draftCommunityCount).toBe(1);
  });
});

// MARK: - Real catalog

describe("real LOCATION_CATALOG", () => {
  it("passes full validation", async () => {
    const { LOCATION_CATALOG } = await import("@/content/locations");
    const result = validateCatalog(LOCATION_CATALOG);
    if (!result.ok) {
      // Surface the exact error list so a failing run is actionable
      throw new Error(
        `catalog validation failed: ${JSON.stringify(result.errors)}`
      );
    }
  });

  it("has at least 3 public cities", async () => {
    const { LOCATION_CATALOG } = await import("@/content/locations");
    expect(publicCities(LOCATION_CATALOG).length).toBeGreaterThanOrEqual(3);
  });

  it("has at least 4 public communities", async () => {
    const { LOCATION_CATALOG } = await import("@/content/locations");
    expect(publicCommunities(LOCATION_CATALOG).length).toBeGreaterThanOrEqual(4);
  });

  it("has a draft city to exercise the visibility filter", async () => {
    const { LOCATION_CATALOG } = await import("@/content/locations");
    const drafts = LOCATION_CATALOG.cities.filter(
      (c) => c.visibility === "draft"
    );
    expect(drafts.length).toBeGreaterThanOrEqual(1);
  });

  it("every community points at a city that exists", async () => {
    const { LOCATION_CATALOG } = await import("@/content/locations");
    const citySlugs = new Set(LOCATION_CATALOG.cities.map((c) => c.slug));
    for (const community of LOCATION_CATALOG.communities) {
      expect(citySlugs.has(community.citySlug)).toBe(true);
    }
  });
});
