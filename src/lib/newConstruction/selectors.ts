/**
 * Pure selectors + validation for the new-construction landing page
 * catalog (KIN-823).
 *
 * Mirrors the KIN-818 location selector shape. All functions are
 * pure — no Convex, no IO — so the full decision tree is exercised
 * in Vitest.
 */

import type {
  BuilderConfig,
  CommunityConfig,
  NewConstructionCatalog,
  NewConstructionValidation,
  NewConstructionValidationError,
} from "./types";

// MARK: - Slug validation

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

// MARK: - Catalog validation

/**
 * Validate the full new-construction catalog for:
 *   - unique slugs within each entity kind (builders can't collide
 *     with other builders; communities can't collide with other
 *     communities — the two are separate namespaces since they
 *     render at distinct URL roots)
 *   - valid kebab-case slug format
 *   - every community references a builder that exists
 *   - every config has at least one block
 *   - pageTitle < 70 chars and does NOT contain the " | buyer-v2"
 *     site suffix (codex guardrail from PR #63 — `buildMetadata`
 *     appends the suffix already; storing it in the catalog would
 *     double it)
 *   - summary between 50 and 300 chars
 */
export function validateCatalog(
  catalog: NewConstructionCatalog
): NewConstructionValidation {
  const errors: NewConstructionValidationError[] = [];

  const builderSlugs = new Set<string>();
  for (const builder of catalog.builders) {
    if (!isValidSlug(builder.slug)) {
      errors.push({ kind: "invalidSlug", slug: builder.slug });
    }
    if (builderSlugs.has(builder.slug)) {
      errors.push({
        kind: "duplicateSlug",
        slug: builder.slug,
        entityKind: "builder",
      });
    }
    builderSlugs.add(builder.slug);

    if (builder.blocks.length === 0) {
      errors.push({ kind: "emptyBlocks", slug: builder.slug });
    }
    validateTextBudgets(builder.slug, builder.summary, builder.pageTitle, errors);
  }

  const communitySlugs = new Set<string>();
  for (const community of catalog.communities) {
    if (!isValidSlug(community.slug)) {
      errors.push({ kind: "invalidSlug", slug: community.slug });
    }
    if (communitySlugs.has(community.slug)) {
      errors.push({
        kind: "duplicateSlug",
        slug: community.slug,
        entityKind: "community",
      });
    }
    communitySlugs.add(community.slug);

    if (!builderSlugs.has(community.builderSlug)) {
      errors.push({
        kind: "missingBuilderForCommunity",
        builderSlug: community.builderSlug,
        communitySlug: community.slug,
      });
    }

    if (community.blocks.length === 0) {
      errors.push({ kind: "emptyBlocks", slug: community.slug });
    }
    validateTextBudgets(
      community.slug,
      community.summary,
      community.pageTitle,
      errors
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateTextBudgets(
  slug: string,
  summary: string,
  pageTitle: string,
  errors: NewConstructionValidationError[]
): void {
  if (summary.length < 50) {
    errors.push({ kind: "summaryTooShort", slug, length: summary.length });
  } else if (summary.length > 300) {
    errors.push({ kind: "summaryTooLong", slug, length: summary.length });
  }
  if (pageTitle.length > 70) {
    errors.push({ kind: "pageTitleTooLong", slug, length: pageTitle.length });
  }
  if (/\|\s*buyer-v2/i.test(pageTitle)) {
    errors.push({ kind: "titleIncludesSiteSuffix", slug });
  }
}

// MARK: - Visibility filters

export function publicBuilders(
  catalog: NewConstructionCatalog
): BuilderConfig[] {
  return catalog.builders.filter((b) => b.visibility === "public");
}

export function publicCommunities(
  catalog: NewConstructionCatalog
): CommunityConfig[] {
  return catalog.communities.filter((c) => c.visibility === "public");
}

// MARK: - Slug lookup

export function findPublicBuilder(
  catalog: NewConstructionCatalog,
  slug: string
): BuilderConfig | undefined {
  return publicBuilders(catalog).find((b) => b.slug === slug);
}

export function findPublicCommunity(
  catalog: NewConstructionCatalog,
  slug: string
): CommunityConfig | undefined {
  return publicCommunities(catalog).find((c) => c.slug === slug);
}

/**
 * Return public communities belonging to a specific builder slug.
 * Used by the builder landing page to render its communities
 * grid.
 */
export function communitiesForBuilder(
  catalog: NewConstructionCatalog,
  builderSlug: string
): CommunityConfig[] {
  return publicCommunities(catalog).filter(
    (c) => c.builderSlug === builderSlug
  );
}

// MARK: - Static params helpers

export function allPublicBuilderSlugs(
  catalog: NewConstructionCatalog
): string[] {
  return publicBuilders(catalog).map((b) => b.slug);
}

export function allPublicCommunitySlugs(
  catalog: NewConstructionCatalog
): string[] {
  return publicCommunities(catalog).map((c) => c.slug);
}

// MARK: - Summary metrics

export interface NewConstructionCatalogSummary {
  publicBuilderCount: number;
  draftBuilderCount: number;
  publicCommunityCount: number;
  draftCommunityCount: number;
}

export function summarizeCatalog(
  catalog: NewConstructionCatalog
): NewConstructionCatalogSummary {
  return {
    publicBuilderCount: publicBuilders(catalog).length,
    draftBuilderCount: catalog.builders.filter((b) => b.visibility === "draft")
      .length,
    publicCommunityCount: publicCommunities(catalog).length,
    draftCommunityCount: catalog.communities.filter(
      (c) => c.visibility === "draft"
    ).length,
  };
}
