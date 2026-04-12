/**
 * Typed city and community landing page schema (KIN-818).
 *
 * City and community pages are the programmatic SEO layer — one
 * route handles every city and community defined in the content
 * catalog, driven by shared templates. No one-off route code per
 * city, no duplicated copy, no drift.
 *
 * Integration points:
 *   - `src/lib/seo/builder.ts` (KIN-815) consumes these types via
 *     the city/community page's `generateMetadata` to emit canonical
 *     URL + Article-style JSON-LD.
 *   - `src/lib/seo/routes.ts` (KIN-815) reads the published city +
 *     community slugs to include them in the sitemap.
 *   - The shared content modules (FAQs, disclosures, KIN-773) supply
 *     reusable blocks via typed references.
 */

// MARK: - Visibility

export type LocationVisibility = "public" | "draft";

// MARK: - City

/**
 * A city landing page. Cities are large geographic units (Miami,
 * Tampa, Orlando). Each has its own slug and is indexed as a
 * top-level public page.
 */
export interface CityPageConfig {
  /** URL slug (kebab-case, lowercase, no leading slash). */
  slug: string;
  /** Display name — "Tampa", "Miami". */
  displayName: string;
  /** State abbreviation (FL-only at launch but typed for multi-state). */
  state: string;
  /** Meta description (120–300 chars). */
  summary: string;
  /** SEO-optimized page title (< 70 chars). */
  pageTitle: string;
  /** Hero headline shown above the paste-link CTA. */
  heroHeadline: string;
  /** Hero subheadline copy. */
  heroSubheadline: string;
  /** Ordered content blocks rendered below the hero. */
  blocks: LocationBlock[];
  /** Optional list of internal cross-links to communities in this city. */
  communitySlugs?: string[];
  /** ISO-8601 date this page was last updated. */
  lastUpdated: string;
  visibility: LocationVisibility;
}

// MARK: - Community

/**
 * A community landing page. Communities are neighborhood/subdivision
 * units nested inside a city (e.g. "Wellington" in West Palm Beach,
 * "Dr. Phillips" in Orlando, "Brickell" in Miami).
 */
export interface CommunityPageConfig {
  /** URL slug (kebab-case, lowercase). */
  slug: string;
  /** Display name — "Wellington", "Brickell". */
  displayName: string;
  /** Slug of the parent city — must resolve to a CityPageConfig. */
  citySlug: string;
  /** Meta description (120–300 chars). */
  summary: string;
  /** SEO-optimized page title. */
  pageTitle: string;
  /** Hero headline. */
  heroHeadline: string;
  /** Hero subheadline. */
  heroSubheadline: string;
  /** Ordered content blocks. */
  blocks: LocationBlock[];
  /** ISO-8601 date. */
  lastUpdated: string;
  visibility: LocationVisibility;
}

// MARK: - Content blocks

/**
 * Reusable content block types for city/community pages. The renderer
 * switches exhaustively — adding a new kind requires both a new type
 * here and a renderer in the view layer.
 */
export type LocationBlock =
  | HeroParagraphBlock
  | KeyStatsBlock
  | FAQRefBlock
  | CTABlock
  | NeighborhoodListBlock
  | MarketSnapshotBlock
  | TestimonialRefBlock;

export interface HeroParagraphBlock {
  kind: "hero_paragraph";
  text: string;
}

/**
 * Up to 4 key stats shown as a row of cards — median price,
 * days on market, price per sqft, inventory count.
 */
export interface KeyStatsBlock {
  kind: "key_stats";
  stats: Array<{
    label: string;
    value: string;
    /** Optional one-line explanation for the underlying source. */
    note?: string;
  }>;
}

/**
 * Reference to shared FAQ entries by id. The renderer resolves these
 * against the main FAQ catalog (KIN-773) so one edit updates every
 * city/community surface that references the entry.
 */
export interface FAQRefBlock {
  kind: "faq_ref";
  /** Section heading shown above the FAQ list. */
  heading: string;
  /** Stable FAQ entry ids from `FAQ_ENTRIES` in `src/content/faq.ts`. */
  entryIds: string[];
}

/**
 * Call-to-action block — uses the same three variants the article
 * renderer (KIN-812) supports: paste-link / savings-calculator /
 * custom-href.
 */
export interface CTABlock {
  kind: "cta";
  variant: "paste_link" | "savings_calculator" | "custom";
  headline?: string;
  body?: string;
  /** Required when variant === "custom". */
  href?: string;
  label?: string;
}

/**
 * List of neighborhood cross-links shown on a city page to drive
 * traffic to the nested community pages.
 */
export interface NeighborhoodListBlock {
  kind: "neighborhood_list";
  heading: string;
  /** Slugs of communities in the same city. Missing slugs are filtered out. */
  communitySlugs: string[];
}

/**
 * Short market snapshot text + optional source label.
 */
export interface MarketSnapshotBlock {
  kind: "market_snapshot";
  heading: string;
  body: string;
  /** Attribution ("Data: Florida Realtors, March 2026"). */
  source?: string;
  /** ISO-8601 date the snapshot was last refreshed. */
  refreshedAt: string;
}

/**
 * Reference to existing trust-proof case studies by id. Uses the
 * KIN-825 trust-proof catalog + labeling policy.
 */
export interface TestimonialRefBlock {
  kind: "testimonial_ref";
  heading: string;
  caseStudyIds: string[];
}

// MARK: - Validation

/**
 * Errors returned by the location config validator.
 */
export type LocationValidationError =
  | { kind: "duplicateSlug"; slug: string; locationKind: "city" | "community" }
  | { kind: "invalidSlug"; slug: string }
  | { kind: "missingCityForCommunity"; citySlug: string; communitySlug: string }
  | { kind: "emptyBlocks"; slug: string }
  | { kind: "summaryTooShort"; slug: string; length: number }
  | { kind: "summaryTooLong"; slug: string; length: number }
  | { kind: "pageTitleTooLong"; slug: string; length: number };

export type LocationValidation =
  | { ok: true }
  | { ok: false; errors: LocationValidationError[] };

// MARK: - Catalog

/**
 * The full city/community catalog. Content authors maintain this;
 * selectors in `selectors.ts` filter to public records and validate
 * cross-references before content reaches the render pipeline.
 */
export interface LocationCatalog {
  cities: CityPageConfig[];
  communities: CommunityPageConfig[];
}
