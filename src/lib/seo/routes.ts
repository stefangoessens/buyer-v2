/**
 * SEO route registry for buyer-v2 (KIN-815).
 *
 * Every public surface that should appear in the sitemap and every
 * gated route that must be excluded from indexing is declared here.
 * The sitemap generator walks this list; the robots.txt route uses
 * it to emit `Disallow:` rules for gated surfaces.
 *
 * Any new public route MUST be added here. The alternative — relying
 * on Next.js to auto-discover routes — doesn't let us distinguish
 * indexable from gated/canonicalized variants.
 */

import type { SeoContentKind, RouteVisibility } from "./types";

/**
 * One route entry in the SEO registry.
 */
export interface SeoRoute {
  /** Canonical path (must start with `/`). */
  path: string;
  /** Visibility — drives both sitemap inclusion and robots directives. */
  visibility: RouteVisibility;
  /** Content kind — drives sitemap priority + changefreq. */
  kind: SeoContentKind;
  /**
   * Relative sitemap priority (0.0 – 1.0). Search engines treat this
   * as a hint, not a guarantee. Higher = more important.
   */
  priority: number;
  /**
   * How often the content typically changes. Used only by sitemap
   * consumers that still honor it (most don't, but it doesn't hurt).
   */
  changeFrequency:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  /**
   * Optional ISO-8601 `<lastmod>` timestamp. Pages that track their
   * own effective date (legal docs) supply this; others omit it and
   * the sitemap generator picks today's date.
   */
  lastModified?: string;
}

/**
 * Declared public and gated routes. The sitemap generator filters
 * to `visibility === "public"` and emits the rest.
 *
 * Gated routes are listed here so robots.txt can emit explicit
 * Disallow rules for them — belt and suspenders on top of the
 * per-page noindex meta tag.
 */
export const SEO_ROUTES: SeoRoute[] = [
  // ─── Marketing (public, indexable) ──────────────────────────────
  {
    path: "/",
    visibility: "public",
    kind: "marketing",
    priority: 1.0,
    changeFrequency: "weekly",
  },
  {
    path: "/pricing",
    visibility: "public",
    kind: "marketing",
    priority: 0.9,
    changeFrequency: "monthly",
  },
  {
    path: "/savings",
    visibility: "public",
    kind: "marketing",
    priority: 0.85,
    changeFrequency: "monthly",
  },
  {
    path: "/faq",
    visibility: "public",
    kind: "faq",
    priority: 0.7,
    changeFrequency: "monthly",
  },

  // ─── Legal (public, indexable, low churn) ───────────────────────
  {
    path: "/legal/terms",
    visibility: "public",
    kind: "legal",
    priority: 0.3,
    changeFrequency: "yearly",
    lastModified: "2026-04-01",
  },
  {
    path: "/legal/privacy",
    visibility: "public",
    kind: "legal",
    priority: 0.3,
    changeFrequency: "yearly",
    lastModified: "2026-04-01",
  },
  {
    path: "/legal/brokerage-disclosures",
    visibility: "public",
    kind: "legal",
    priority: 0.3,
    changeFrequency: "yearly",
    lastModified: "2026-04-01",
  },

  // ─── Gated routes (not indexable — excluded from sitemap) ───────
  // These are declared so robots.txt can emit Disallow rules for
  // them. The sitemap generator filters them out automatically.
  {
    path: "/dashboard",
    visibility: "gated",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
  {
    path: "/property",
    visibility: "gated",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },

  // ─── Private routes (internal tools — not indexable) ────────────
  {
    path: "/console",
    visibility: "private",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
];

// MARK: - Selectors

/**
 * Routes that belong in the public sitemap.
 */
export function publicSitemapRoutes(): SeoRoute[] {
  return SEO_ROUTES.filter((r) => r.visibility === "public");
}

/**
 * Routes that should get an explicit `Disallow:` rule in robots.txt.
 * Covers both `gated` and `private` classifications.
 */
export function gatedRouteDisallowPaths(): string[] {
  return SEO_ROUTES.filter(
    (r) => r.visibility === "gated" || r.visibility === "private"
  ).map((r) => r.path);
}

/**
 * Lookup a single route by path. Used by tests and by per-page
 * metadata builders that want to share the declared kind/priority
 * instead of repeating them.
 */
export function findRouteByPath(path: string): SeoRoute | undefined {
  return SEO_ROUTES.find((r) => r.path === path);
}
