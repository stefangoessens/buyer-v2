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
import { NEW_CONSTRUCTION_CATALOG } from "@/content/newConstruction";
import {
  publicBuilders,
  publicCommunities as publicNewConstructionCommunities,
} from "@/lib/newConstruction/selectors";
import { BUYER_STORIES } from "@/content/trustProof";
import { filterPublishableStories } from "@/lib/trustProof/policy";

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

  // KIN-1087: gate /stories archive + /stories/[slug] entries until at
  // least one approved buyer story exists. Drafts are NEVER in the
  // sitemap. The static registry declares /stories as public, so we
  // strip it here when nothing is publishable.
  const publishableStories = filterPublishableStories(BUYER_STORIES);
  const storiesArchiveAllowed = publishableStories.length > 0;

  // Static registry routes
  const staticEntries: MetadataRoute.Sitemap = publicSitemapRoutes()
    .filter((route) => route.path !== "/stories" || storiesArchiveAllowed)
    .map((route) => ({
      url: `${origin}${route.path}`,
      lastModified: route.lastModified ?? today,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    }));

  // Dynamic: one entry per approved buyer story. Drafts excluded by
  // filterPublishableStories.
  const storyEntries: MetadataRoute.Sitemap = publishableStories.map(
    (story) => ({
      url: `${origin}/stories/${story.slug}`,
      lastModified: today,
      changeFrequency: "monthly" as const,
      priority: 0.6,
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

  // Dynamic: one entry per public new-construction builder page (KIN-823)
  const builderEntries: MetadataRoute.Sitemap = publicBuilders(
    NEW_CONSTRUCTION_CATALOG
  ).map((builder) => ({
    url: `${origin}/new-construction/builders/${builder.slug}`,
    lastModified: builder.lastUpdated,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Dynamic: one entry per public new-construction community page (KIN-823)
  const newConstructionCommunityEntries: MetadataRoute.Sitemap =
    publicNewConstructionCommunities(NEW_CONSTRUCTION_CATALOG).map(
      (community) => ({
        url: `${origin}/new-construction/${community.slug}`,
        lastModified: community.lastUpdated,
        changeFrequency: "monthly" as const,
        priority: 0.55,
      })
    );

  return [
    ...staticEntries,
    ...articleEntries,
    ...cityEntries,
    ...communityEntries,
    ...builderEntries,
    ...newConstructionCommunityEntries,
    ...storyEntries,
  ];
}
