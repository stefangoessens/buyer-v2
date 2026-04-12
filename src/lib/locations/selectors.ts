/**
 * Pure selectors + validation for city/community page catalog (KIN-818).
 *
 * Every render path for city/community pages goes through these
 * helpers — they handle visibility filtering, slug lookup, cross-
 * reference validation, and duplicate detection. Keeping them pure
 * means we can exercise every branch in Vitest without a live
 * Next.js render.
 */

import type {
  CityPageConfig,
  CommunityPageConfig,
  LocationCatalog,
  LocationValidation,
  LocationValidationError,
} from "./types";

// MARK: - Slug validation

/**
 * Valid URL slug: lowercase kebab-case, no leading/trailing hyphens,
 * at least one character.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

// MARK: - Catalog validation

/**
 * Validate the full catalog for:
 *   - unique slugs within each kind (city slugs don't collide with
 *     other city slugs; community slugs don't collide with other
 *     community slugs)
 *   - valid slug format
 *   - every community references a city that exists in the catalog
 *   - every config has at least one block
 *   - page title < 70 chars
 *   - summary between 50 and 300 chars
 *
 * Note: city and community slugs are intentionally separate
 * namespaces since they render at different URL paths
 * (`/cities/<slug>` vs `/communities/<slug>`).
 */
export function validateCatalog(
  catalog: LocationCatalog
): LocationValidation {
  const errors: LocationValidationError[] = [];

  // City validation
  const citySlugs = new Set<string>();
  for (const city of catalog.cities) {
    if (!isValidSlug(city.slug)) {
      errors.push({ kind: "invalidSlug", slug: city.slug });
    }
    if (citySlugs.has(city.slug)) {
      errors.push({
        kind: "duplicateSlug",
        slug: city.slug,
        locationKind: "city",
      });
    }
    citySlugs.add(city.slug);

    if (city.blocks.length === 0) {
      errors.push({ kind: "emptyBlocks", slug: city.slug });
    }
    validateTextBudgets(city.slug, city.summary, city.pageTitle, errors);
  }

  // Community validation
  const communitySlugs = new Set<string>();
  for (const community of catalog.communities) {
    if (!isValidSlug(community.slug)) {
      errors.push({ kind: "invalidSlug", slug: community.slug });
    }
    if (communitySlugs.has(community.slug)) {
      errors.push({
        kind: "duplicateSlug",
        slug: community.slug,
        locationKind: "community",
      });
    }
    communitySlugs.add(community.slug);

    if (!citySlugs.has(community.citySlug)) {
      errors.push({
        kind: "missingCityForCommunity",
        citySlug: community.citySlug,
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
  errors: LocationValidationError[]
): void {
  if (summary.length < 50) {
    errors.push({ kind: "summaryTooShort", slug, length: summary.length });
  } else if (summary.length > 300) {
    errors.push({ kind: "summaryTooLong", slug, length: summary.length });
  }
  if (pageTitle.length > 70) {
    errors.push({ kind: "pageTitleTooLong", slug, length: pageTitle.length });
  }
}

// MARK: - Visibility filters

/**
 * Return only public city configs.
 */
export function publicCities(
  catalog: LocationCatalog
): CityPageConfig[] {
  return catalog.cities.filter((c) => c.visibility === "public");
}

/**
 * Return only public community configs.
 */
export function publicCommunities(
  catalog: LocationCatalog
): CommunityPageConfig[] {
  return catalog.communities.filter((c) => c.visibility === "public");
}

// MARK: - Slug lookup

/**
 * Find a public city by slug. Returns undefined for draft or
 * unknown slugs so the route can call `notFound()`.
 */
export function findPublicCity(
  catalog: LocationCatalog,
  slug: string
): CityPageConfig | undefined {
  return publicCities(catalog).find((c) => c.slug === slug);
}

/**
 * Find a public community by slug.
 */
export function findPublicCommunity(
  catalog: LocationCatalog,
  slug: string
): CommunityPageConfig | undefined {
  return publicCommunities(catalog).find((c) => c.slug === slug);
}

/**
 * Return the communities nested under a specific city slug, public
 * only. Used by the city page template to render the neighborhood
 * list block.
 */
export function communitiesForCity(
  catalog: LocationCatalog,
  citySlug: string
): CommunityPageConfig[] {
  return publicCommunities(catalog).filter((c) => c.citySlug === citySlug);
}

/**
 * Resolve a list of community slugs to public community configs,
 * in the order provided. Missing or draft slugs are silently dropped.
 * Used by `NeighborhoodListBlock` rendering.
 */
export function resolveCommunityRefs(
  catalog: LocationCatalog,
  slugs: readonly string[]
): CommunityPageConfig[] {
  const byMap = new Map(
    publicCommunities(catalog).map((c) => [c.slug, c])
  );
  return slugs
    .map((slug) => byMap.get(slug))
    .filter((c): c is CommunityPageConfig => c !== undefined);
}

// MARK: - Static params for Next.js routes

/**
 * Return all public city slugs for `generateStaticParams` in the
 * `/cities/[slug]` dynamic route.
 */
export function allPublicCitySlugs(
  catalog: LocationCatalog
): string[] {
  return publicCities(catalog).map((c) => c.slug);
}

/**
 * Return all public community slugs for `generateStaticParams` in
 * the `/communities/[slug]` dynamic route.
 */
export function allPublicCommunitySlugs(
  catalog: LocationCatalog
): string[] {
  return publicCommunities(catalog).map((c) => c.slug);
}

// MARK: - Summary metrics

/**
 * Small summary projection — count of public/draft records by kind.
 * Used by the sitemap generator and the analytics layer to track
 * how many location pages we've published.
 */
export interface LocationCatalogSummary {
  publicCityCount: number;
  draftCityCount: number;
  publicCommunityCount: number;
  draftCommunityCount: number;
}

export function summarizeCatalog(
  catalog: LocationCatalog
): LocationCatalogSummary {
  return {
    publicCityCount: publicCities(catalog).length,
    draftCityCount: catalog.cities.filter((c) => c.visibility === "draft")
      .length,
    publicCommunityCount: publicCommunities(catalog).length,
    draftCommunityCount: catalog.communities.filter(
      (c) => c.visibility === "draft"
    ).length,
  };
}
