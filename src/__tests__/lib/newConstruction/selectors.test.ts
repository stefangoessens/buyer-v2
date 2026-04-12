import { describe, it, expect } from "vitest";
import {
  isValidSlug,
  validateCatalog,
  publicBuilders,
  publicCommunities,
  findPublicBuilder,
  findPublicCommunity,
  communitiesForBuilder,
  allPublicBuilderSlugs,
  allPublicCommunitySlugs,
  summarizeCatalog,
} from "@/lib/newConstruction/selectors";
import type {
  BuilderConfig,
  CommunityConfig,
  NewConstructionCatalog,
} from "@/lib/newConstruction/types";

// MARK: - Fixtures

function makeBuilder(
  overrides: Partial<BuilderConfig> = {}
): BuilderConfig {
  return {
    slug: "lennar",
    displayName: "Lennar",
    tagline: "National builder",
    pageTitle: "Lennar New Construction in Florida",
    summary:
      "A thorough illustrative builder summary describing buyer-v2's representation on new-construction Lennar homes across Florida with enough detail to exceed the minimum length.",
    heroHeadline: "Lennar in Florida",
    heroSubheadline: "Paste a Lennar listing to get started",
    blocks: [{ kind: "hero_paragraph", text: "Lennar overview" }],
    lastUpdated: "2026-04-12",
    visibility: "public",
    ...overrides,
  };
}

function makeCommunity(
  overrides: Partial<CommunityConfig> = {}
): CommunityConfig {
  return {
    slug: "villages-at-tradition",
    displayName: "Villages at Tradition",
    builderSlug: "lennar",
    cityName: "Port St. Lucie",
    state: "FL",
    pageTitle: "Villages at Tradition — Lennar (Port St. Lucie)",
    summary:
      "A thorough illustrative community summary describing the Lennar Villages at Tradition community in Port St. Lucie with enough detail to clear the minimum length threshold.",
    heroHeadline: "Villages at Tradition",
    heroSubheadline: "Master-planned Lennar community",
    blocks: [{ kind: "hero_paragraph", text: "Community overview" }],
    lastUpdated: "2026-04-12",
    visibility: "public",
    ...overrides,
  };
}

// MARK: - isValidSlug

describe("isValidSlug", () => {
  it("accepts kebab-case", () => {
    expect(isValidSlug("lennar")).toBe(true);
    expect(isValidSlug("dr-horton")).toBe(true);
    expect(isValidSlug("villages-at-tradition")).toBe(true);
  });

  it("rejects uppercase, spaces, leading/trailing/double hyphens", () => {
    expect(isValidSlug("Lennar")).toBe(false);
    expect(isValidSlug("dr horton")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-lennar")).toBe(false);
    expect(isValidSlug("lennar-")).toBe(false);
    expect(isValidSlug("lennar--fl")).toBe(false);
  });
});

// MARK: - validateCatalog

describe("validateCatalog", () => {
  it("passes for a well-formed minimal catalog", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder()],
      communities: [makeCommunity()],
    };
    expect(validateCatalog(catalog).ok).toBe(true);
  });

  it("detects duplicate builder slugs", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder(), makeBuilder()],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "duplicateSlug" && e.entityKind === "builder"
        )
      ).toBe(true);
    }
  });

  it("detects duplicate community slugs", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder()],
      communities: [makeCommunity(), makeCommunity()],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "duplicateSlug" && e.entityKind === "community"
        )
      ).toBe(true);
    }
  });

  it("detects invalid slug format", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder({ slug: "Lennar!" })],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "invalidSlug")).toBe(true);
    }
  });

  it("detects community pointing at nonexistent builder", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder()],
      communities: [makeCommunity({ builderSlug: "nope" })],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "missingBuilderForCommunity")
      ).toBe(true);
    }
  });

  it("detects empty blocks array", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder({ blocks: [] })],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "emptyBlocks")).toBe(true);
    }
  });

  it("detects summary too short", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder({ summary: "too short" })],
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
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder({ summary: "x".repeat(301) })],
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
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder({ pageTitle: "x".repeat(80) })],
      communities: [],
    };
    expect(validateCatalog(catalog).ok).toBe(false);
  });

  it("detects pageTitle that contains the site suffix", () => {
    const catalog: NewConstructionCatalog = {
      builders: [
        makeBuilder({ pageTitle: "Lennar New Construction | buyer-v2" }),
      ],
      communities: [],
    };
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "titleIncludesSiteSuffix")
      ).toBe(true);
    }
  });

  it("collects multiple errors at once", () => {
    const catalog: NewConstructionCatalog = {
      builders: [
        makeBuilder({
          slug: "Lennar!",
          summary: "short",
          pageTitle: "x".repeat(80),
        }),
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

describe("publicBuilders / publicCommunities", () => {
  it("filters out draft builders", () => {
    const catalog: NewConstructionCatalog = {
      builders: [
        makeBuilder({ slug: "lennar", visibility: "public" }),
        makeBuilder({ slug: "pulte", visibility: "draft" }),
      ],
      communities: [],
    };
    expect(publicBuilders(catalog).map((b) => b.slug)).toEqual(["lennar"]);
  });

  it("filters out draft communities", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder()],
      communities: [
        makeCommunity({ slug: "villages-at-tradition", visibility: "public" }),
        makeCommunity({ slug: "cypress-bend", visibility: "draft" }),
      ],
    };
    expect(publicCommunities(catalog).map((c) => c.slug)).toEqual([
      "villages-at-tradition",
    ]);
  });
});

// MARK: - Lookup

describe("findPublicBuilder / findPublicCommunity", () => {
  const catalog: NewConstructionCatalog = {
    builders: [
      makeBuilder({ slug: "lennar" }),
      makeBuilder({ slug: "pulte-draft", visibility: "draft" }),
    ],
    communities: [
      makeCommunity({ slug: "villages-at-tradition" }),
      makeCommunity({ slug: "cypress-bend-draft", visibility: "draft" }),
    ],
  };

  it("finds public builder by slug", () => {
    expect(findPublicBuilder(catalog, "lennar")?.slug).toBe("lennar");
  });

  it("returns undefined for draft builder slug", () => {
    expect(findPublicBuilder(catalog, "pulte-draft")).toBeUndefined();
  });

  it("returns undefined for unknown builder slug", () => {
    expect(findPublicBuilder(catalog, "nope")).toBeUndefined();
  });

  it("finds public community by slug", () => {
    expect(findPublicCommunity(catalog, "villages-at-tradition")?.slug).toBe(
      "villages-at-tradition"
    );
  });

  it("returns undefined for draft community slug", () => {
    expect(findPublicCommunity(catalog, "cypress-bend-draft")).toBeUndefined();
  });
});

// MARK: - communitiesForBuilder

describe("communitiesForBuilder", () => {
  it("returns public communities owned by a builder", () => {
    const catalog: NewConstructionCatalog = {
      builders: [
        makeBuilder({ slug: "lennar" }),
        makeBuilder({ slug: "dr-horton" }),
      ],
      communities: [
        makeCommunity({ slug: "a", builderSlug: "lennar" }),
        makeCommunity({ slug: "b", builderSlug: "lennar" }),
        makeCommunity({ slug: "c", builderSlug: "dr-horton" }),
      ],
    };
    const lennar = communitiesForBuilder(catalog, "lennar").map((c) => c.slug);
    expect(lennar).toEqual(["a", "b"]);
  });

  it("excludes draft communities", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder({ slug: "lennar" })],
      communities: [
        makeCommunity({ slug: "a", builderSlug: "lennar" }),
        makeCommunity({
          slug: "b-draft",
          builderSlug: "lennar",
          visibility: "draft",
        }),
      ],
    };
    expect(communitiesForBuilder(catalog, "lennar").map((c) => c.slug)).toEqual(
      ["a"]
    );
  });

  it("returns empty for unknown builder slug", () => {
    const catalog: NewConstructionCatalog = {
      builders: [],
      communities: [],
    };
    expect(communitiesForBuilder(catalog, "nope")).toEqual([]);
  });
});

// MARK: - Static params

describe("allPublicBuilderSlugs / allPublicCommunitySlugs", () => {
  it("returns only public builder slugs", () => {
    const catalog: NewConstructionCatalog = {
      builders: [
        makeBuilder({ slug: "lennar" }),
        makeBuilder({ slug: "dr-horton" }),
        makeBuilder({ slug: "draft", visibility: "draft" }),
      ],
      communities: [],
    };
    expect(allPublicBuilderSlugs(catalog)).toEqual(["lennar", "dr-horton"]);
  });

  it("returns only public community slugs", () => {
    const catalog: NewConstructionCatalog = {
      builders: [makeBuilder()],
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
    const catalog: NewConstructionCatalog = {
      builders: [
        makeBuilder({ slug: "lennar", visibility: "public" }),
        makeBuilder({ slug: "dr-horton", visibility: "public" }),
        makeBuilder({ slug: "draft-1", visibility: "draft" }),
      ],
      communities: [
        makeCommunity({ slug: "a", visibility: "public" }),
        makeCommunity({ slug: "draft-c", visibility: "draft" }),
      ],
    };
    const summary = summarizeCatalog(catalog);
    expect(summary.publicBuilderCount).toBe(2);
    expect(summary.draftBuilderCount).toBe(1);
    expect(summary.publicCommunityCount).toBe(1);
    expect(summary.draftCommunityCount).toBe(1);
  });
});

// MARK: - Real catalog

describe("real NEW_CONSTRUCTION_CATALOG", () => {
  it("passes full validation", async () => {
    const { NEW_CONSTRUCTION_CATALOG } = await import(
      "@/content/newConstruction"
    );
    const result = validateCatalog(NEW_CONSTRUCTION_CATALOG);
    if (!result.ok) {
      throw new Error(
        `catalog validation failed: ${JSON.stringify(result.errors)}`
      );
    }
  });

  it("has at least 2 public builders", async () => {
    const { NEW_CONSTRUCTION_CATALOG } = await import(
      "@/content/newConstruction"
    );
    expect(publicBuilders(NEW_CONSTRUCTION_CATALOG).length).toBeGreaterThanOrEqual(
      2
    );
  });

  it("has at least 3 public communities", async () => {
    const { NEW_CONSTRUCTION_CATALOG } = await import(
      "@/content/newConstruction"
    );
    expect(
      publicCommunities(NEW_CONSTRUCTION_CATALOG).length
    ).toBeGreaterThanOrEqual(3);
  });

  it("has a draft builder to exercise the visibility filter", async () => {
    const { NEW_CONSTRUCTION_CATALOG } = await import(
      "@/content/newConstruction"
    );
    const drafts = NEW_CONSTRUCTION_CATALOG.builders.filter(
      (b) => b.visibility === "draft"
    );
    expect(drafts.length).toBeGreaterThanOrEqual(1);
  });

  it("every community points at a builder that exists", async () => {
    const { NEW_CONSTRUCTION_CATALOG } = await import(
      "@/content/newConstruction"
    );
    const builderSlugs = new Set(
      NEW_CONSTRUCTION_CATALOG.builders.map((b) => b.slug)
    );
    for (const community of NEW_CONSTRUCTION_CATALOG.communities) {
      expect(builderSlugs.has(community.builderSlug)).toBe(true);
    }
  });

  it("no catalog pageTitle contains the site suffix", async () => {
    const { NEW_CONSTRUCTION_CATALOG } = await import(
      "@/content/newConstruction"
    );
    for (const builder of NEW_CONSTRUCTION_CATALOG.builders) {
      expect(builder.pageTitle).not.toMatch(/\|\s*buyer-v2/i);
    }
    for (const community of NEW_CONSTRUCTION_CATALOG.communities) {
      expect(community.pageTitle).not.toMatch(/\|\s*buyer-v2/i);
    }
  });

  it("no community slug collides with the reserved 'builders' segment", async () => {
    const { NEW_CONSTRUCTION_CATALOG } = await import(
      "@/content/newConstruction"
    );
    for (const community of NEW_CONSTRUCTION_CATALOG.communities) {
      expect(community.slug).not.toBe("builders");
    }
  });
});
