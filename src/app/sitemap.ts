import type { MetadataRoute } from "next";
import { publicSitemapRoutes } from "@/lib/seo/routes";
import { getSiteOrigin } from "@/lib/seo/builder";
import { ARTICLES } from "@/content/articles";
import { publicArticles } from "@/lib/articles/selectors";
import { LOCATION_CATALOG } from "@/content/locations";
import {
  publicCities,
  publicCommunities,
} from "@/lib/locations/selectors";

/**
 * Next.js sitemap generator (KIN-815 + KIN-812 + KIN-818).
 *
 * Walks the declared SEO route registry and emits one entry per
 * public route. Gated and private routes are filtered out at the
 * registry level (see `publicSitemapRoutes`) so they never reach
 * this function — duplicate protection on top of per-page
 * `noindex` meta tags.
 *
 * Dynamic content:
 *   - Public blog articles (`/blog/<slug>`) are emitted from the
 *     `ARTICLES` catalog filtered through `publicArticles`. Each
 *     article's `updatedAt` drives its `<lastmod>` field so search
 *     engines re-crawl edited posts.
 *   - Public city landing pages (`/cities/<slug>`) from
 *     `LOCATION_CATALOG` filtered through `publicCities`. Draft
 *     cities stay out of the sitemap.
 *   - Public community landing pages (`/communities/<slug>`) from
 *     `LOCATION_CATALOG` filtered through `publicCommunities`.
 *
 * Lastmod defaults to today for routes that don't declare their own
 * — search engines read this as a stable "when was this last
 * updated" hint. Legal documents, articles, and locations supply
 * their own lastmod.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  const today = new Date().toISOString().slice(0, 10);

  // Static registry routes
  const staticEntries: MetadataRoute.Sitemap = publicSitemapRoutes().map(
    (route) => ({
      url: `${origin}${route.path}`,
      lastModified: route.lastModified ?? today,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })
  );

  // Dynamic: one entry per public blog article
  const articleEntries: MetadataRoute.Sitemap = publicArticles(ARTICLES).map(
    (article) => ({
      url: `${origin}/blog/${article.slug}`,
      lastModified: article.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.55,
    })
  );

  // Dynamic: one entry per public city landing page
  const cityEntries: MetadataRoute.Sitemap = publicCities(LOCATION_CATALOG).map(
    (city) => ({
      url: `${origin}/cities/${city.slug}`,
      lastModified: city.lastUpdated,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })
  );

  // Dynamic: one entry per public community landing page
  const communityEntries: MetadataRoute.Sitemap = publicCommunities(
    LOCATION_CATALOG
  ).map((community) => ({
    url: `${origin}/communities/${community.slug}`,
    lastModified: community.lastUpdated,
    changeFrequency: "monthly" as const,
    priority: 0.55,
  }));

  return [
    ...staticEntries,
    ...articleEntries,
    ...cityEntries,
    ...communityEntries,
  ];
}
