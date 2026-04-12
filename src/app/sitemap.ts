import type { MetadataRoute } from "next";
import { publicSitemapRoutes } from "@/lib/seo/routes";
import { getSiteOrigin } from "@/lib/seo/builder";

/**
 * Next.js sitemap generator (KIN-815).
 *
 * Walks the declared SEO route registry and emits one entry per
 * public route. Gated and private routes are filtered out at the
 * registry level (see `publicSitemapRoutes`) so they never reach
 * this function — duplicate protection on top of per-page
 * `noindex` meta tags.
 *
 * Lastmod defaults to today for routes that don't declare their own
 * — search engines read this as a stable "when was this last
 * updated" hint. Legal documents supply their own lastmod from the
 * effective date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  const today = new Date().toISOString().slice(0, 10);

  return publicSitemapRoutes().map((route) => ({
    url: `${origin}${route.path}`,
    lastModified: route.lastModified ?? today,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
