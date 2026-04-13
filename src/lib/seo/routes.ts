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

import {
  STATIC_SEO_PAGES,
  type StaticSeoPageDefinition,
  type SitemapChangeFrequency,
} from "./pageDefinitions";
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
  changeFrequency: SitemapChangeFrequency;
  /**
   * Optional ISO-8601 `<lastmod>` timestamp. Pages that track their
   * own effective date (legal docs) supply this; others omit it and
   * the sitemap generator picks today's date.
   */
  lastModified?: string;
}

const STATIC_ROUTE_ENTRIES: SeoRoute[] = (
  Object.values(STATIC_SEO_PAGES) as StaticSeoPageDefinition[]
).map((page) => ({
  path: page.seo.path,
  visibility: page.seo.visibility,
  kind: page.seo.kind,
  priority: page.sitemap?.priority ?? 0,
  changeFrequency: page.sitemap?.changeFrequency ?? "never",
  lastModified: page.sitemap?.lastModified ?? page.seo.lastModified,
}));

const LEGAL_ROUTE_ENTRIES: SeoRoute[] = [
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
];

const GATED_AND_PRIVATE_PREFIX_ENTRIES: SeoRoute[] = [
  {
    path: "/property",
    visibility: "gated",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
  {
    path: "/dealroom",
    visibility: "gated",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
  {
    path: "/console",
    visibility: "private",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
  {
    path: "/metrics",
    visibility: "private",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
  {
    path: "/notes",
    visibility: "private",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
  {
    path: "/overrides",
    visibility: "private",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
  {
    path: "/preview",
    visibility: "private",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
  {
    path: "/queues",
    visibility: "private",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
  {
    path: "/settings",
    visibility: "private",
    kind: "product",
    priority: 0,
    changeFrequency: "never",
  },
];

/**
 * Declared public and gated routes. The sitemap generator filters
 * to `visibility === "public"` and emits the rest.
 *
 * Gated routes are listed here so robots.txt can emit explicit
 * Disallow rules for them — belt and suspenders on top of the
 * per-page noindex meta tag.
 */
export const SEO_ROUTES: SeoRoute[] = [
  ...STATIC_ROUTE_ENTRIES,
  ...LEGAL_ROUTE_ENTRIES,
  ...GATED_AND_PRIVATE_PREFIX_ENTRIES,
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
