/**
 * Typed metadata model for buyer-v2's public surfaces (KIN-815).
 *
 * Every public page passes through `buildMetadata` in `builder.ts`
 * which consumes a `SeoInput` and emits a Next.js `Metadata` object
 * (plus an optional JSON-LD payload). This keeps per-route code
 * small: pages pass the semantic fields they care about, and the
 * builder handles canonical, OG, Twitter, robots, and noindex
 * consistently across the whole site.
 */

/**
 * Where this page sits in the site's visibility hierarchy.
 *
 * - `public`  — fully indexable by search engines and surfaced in the sitemap.
 * - `gated`   — visible to authenticated users but MUST NOT be
 *               indexed or surface in the sitemap (e.g. deal room,
 *               buyer dashboard, console).
 * - `private` — internal-only (admin console, staff tools) — same
 *               treatment as gated for SEO purposes but semantically
 *               distinct for access-control.
 */
export type RouteVisibility = "public" | "gated" | "private";

/**
 * Coarse content taxonomy used to pick the right JSON-LD schema and
 * to drive per-category sitemap entries.
 */
export type SeoContentKind =
  | "marketing"      // homepage, pricing, calculator
  | "faq"            // FAQ page (gets FAQPage JSON-LD)
  | "howTo"          // step-by-step pages (gets HowTo JSON-LD)
  | "legal"          // terms/privacy/disclosures
  | "article"        // blog articles (future KIN-812)
  | "story"          // verified buyer stories (KIN-1087) — Review JSON-LD
  | "product"        // product areas (dashboard, deal room — gated)
  | "system";        // 404, error pages

/**
 * OpenGraph / Twitter preview fields. Shared between the two
 * networks so the page author sets one set and the builder emits
 * both.
 */
export interface SocialPreview {
  title: string;
  description: string;
  /**
   * Absolute URL to the social preview image. If omitted, the
   * builder falls back to the site-wide default image.
   */
  imageUrl?: string;
  /**
   * Image alt text for accessibility and Twitter's image-card format.
   */
  imageAlt?: string;
}

/**
 * The typed input that every page passes to `buildMetadata`. Every
 * field except `title`/`description`/`path` is optional — the builder
 * fills in defaults for anything not supplied so pages can be as
 * terse as they want.
 */
export interface SeoInput {
  /** Page title shown in <title> and as the OG title by default. */
  title: string;
  /** Meta description. Should be 120–160 chars for best SERP display. */
  description: string;
  /**
   * Canonical path (starts with `/`). The builder prepends the site
   * origin to produce the absolute canonical URL. Query strings and
   * fragments are stripped to prevent duplicate-indexing.
   */
  path: string;
  /** Visibility classification — drives robots directives + sitemap inclusion. */
  visibility: RouteVisibility;
  /** Content kind — drives JSON-LD schema choice. */
  kind: SeoContentKind;
  /**
   * Optional override for the social preview card. If omitted the
   * builder uses `{ title, description }` from the top-level fields.
   */
  social?: SocialPreview;
  /**
   * ISO-8601 date the content was LAST MODIFIED. Used in JSON-LD as
   * `dateModified` and in the sitemap's `<lastmod>` field. For
   * content that has never been updated since publication, this is
   * the same as `publishedAt`.
   */
  lastModified?: string;
  /**
   * ISO-8601 date the content was FIRST PUBLISHED. Used in JSON-LD
   * Article payloads as `datePublished` and in OpenGraph's
   * `article:published_time` — both search engines and social
   * networks expect this to be the original publication date, not
   * the most recent edit. For content with no edits, defaults to
   * `lastModified` inside the builder.
   */
  publishedAt?: string;
  /**
   * For paginated or canonicalized alternate URLs — e.g. a query-
   * string variant that should point back at the canonical path.
   * The builder respects this explicitly so pages can opt out of
   * the default "canonical = path" behavior when needed.
   */
  canonicalOverride?: string;
}

/**
 * Result of validating an `SeoInput`. Exposed as a discriminated
 * union so tests and the pipeline can exhaustively handle errors.
 */
export type SeoValidation =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * JSON-LD structured data payload. The builder attaches one of these
 * to the page based on the `kind` — WebPage for most surfaces,
 * FAQPage for the FAQ route, Article for blog posts, Organization
 * for the homepage.
 */
export type StructuredData = Record<string, unknown>;
