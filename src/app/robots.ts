import type { MetadataRoute } from "next";
import { gatedRouteDisallowPaths } from "@/lib/seo/routes";
import { getSiteOrigin } from "@/lib/seo/builder";

/**
 * Next.js robots.txt generator (KIN-815).
 *
 * Emits:
 *   - `Allow: /` for the entire site (default)
 *   - `Disallow:` rules for every gated/private path in the SEO
 *     route registry (dashboard, deal room, console, property…)
 *   - A reference to the sitemap at the canonical origin
 *
 * Gated routes are listed here as belt-and-suspenders on top of
 * their per-page `noindex` meta tags — if an author forgets the
 * meta tag, the robots.txt Disallow still keeps the route out of
 * Googlebot's crawl queue.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: gatedRouteDisallowPaths(),
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
