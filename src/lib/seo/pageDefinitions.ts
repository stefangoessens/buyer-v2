import type { Metadata } from "next";
import type { Article } from "@/lib/articles/types";
import type { LegalDocument } from "@/lib/content/types";
import type {
  CityPageConfig,
  CommunityPageConfig,
} from "@/lib/locations/types";
import type {
  BuilderConfig,
  CommunityConfig as NewConstructionCommunityConfig,
} from "@/lib/newConstruction/types";
import { buildMetadata, buildStructuredData } from "./builder";
import type { SeoInput, StructuredData } from "./types";

export type SitemapChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface StaticSeoPageDefinition {
  seo: SeoInput;
  sitemap?: {
    priority: number;
    changeFrequency: SitemapChangeFrequency;
    lastModified?: string;
  };
}

export const STATIC_SEO_PAGES = {
  home: {
    seo: {
      title: "Get the best deal on your Florida home",
      description:
        "Paste a Zillow, Redfin, or Realtor.com listing link to get instant AI pricing, comps, and expert Florida buyer representation with buyer-v2.",
      path: "/",
      visibility: "public",
      kind: "marketing",
    },
    sitemap: {
      priority: 1.0,
      changeFrequency: "weekly",
    },
  },
  pricing: {
    seo: {
      title: "Free for buyers. Paid from the commission.",
      description:
        "buyer-v2 never charges buyers up front. Our fee comes out of the buyer-agent commission at closing, and we rebate a portion of it back to you.",
      path: "/pricing",
      visibility: "public",
      kind: "marketing",
    },
    sitemap: {
      priority: 0.9,
      changeFrequency: "monthly",
    },
  },
  savings: {
    seo: {
      title: "Savings Calculator",
      description:
        "Estimate your buyer credit on a Florida home purchase. See how buyer-v2's commission rebate model works and what you could save at closing.",
      path: "/savings",
      visibility: "public",
      kind: "marketing",
    },
    sitemap: {
      priority: 0.85,
      changeFrequency: "monthly",
    },
  },
  faq: {
    seo: {
      title: "FAQ",
      description:
        "How buyer-v2 works, how the buyer credit is calculated, and what happens when you engage us — in plain language.",
      path: "/faq",
      visibility: "public",
      kind: "faq",
    },
    sitemap: {
      priority: 0.7,
      changeFrequency: "monthly",
    },
  },
  blog: {
    seo: {
      title: "Articles for Florida homebuyers",
      description:
        "Plain-language guides on pricing, offers, closing, commissions, and Florida market specifics — written by licensed brokers and the buyer-v2 team.",
      path: "/blog",
      visibility: "public",
      kind: "marketing",
    },
    sitemap: {
      priority: 0.6,
      changeFrequency: "weekly",
    },
  },
  intake: {
    seo: {
      title: "Property intake",
      description: "Continuing a listing or address intake in buyer-v2.",
      path: "/intake",
      visibility: "gated",
      kind: "system",
    },
  },
  dashboard: {
    seo: {
      title: "Dashboard",
      description: "Your deals, tours, and property analyses in one place.",
      path: "/dashboard",
      visibility: "gated",
      kind: "product",
    },
  },
  compare: {
    seo: {
      title: "Compare",
      description: "Compare your shortlisted properties side-by-side.",
      path: "/compare",
      visibility: "gated",
      kind: "product",
    },
  },
  favourites: {
    seo: {
      title: "Favourites",
      description: "Your starred properties and saved searches.",
      path: "/favourites",
      visibility: "gated",
      kind: "product",
    },
  },
  profile: {
    seo: {
      title: "Profile",
      description: "Account, notifications, and buyer preferences.",
      path: "/profile",
      visibility: "gated",
      kind: "product",
    },
  },
  reports: {
    seo: {
      title: "Reports",
      description: "All your deal-room reports and analyses.",
      path: "/reports",
      visibility: "gated",
      kind: "product",
    },
  },
} as const satisfies Record<string, StaticSeoPageDefinition>;

export type StaticSeoPageKey = keyof typeof STATIC_SEO_PAGES;

export function staticSeoInput(page: StaticSeoPageKey): SeoInput {
  return STATIC_SEO_PAGES[page].seo;
}

export function metadataForStaticPage(page: StaticSeoPageKey): Metadata {
  return buildMetadata(staticSeoInput(page));
}

export function structuredDataForStaticPage(
  page: StaticSeoPageKey,
  extras?: {
    faqEntries?: Array<{ question: string; answer: string }>;
    articleAuthor?: string;
  }
): StructuredData {
  return buildStructuredData(staticSeoInput(page), extras);
}

export function metadataForMissingPage(input: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return buildMetadata({
    ...input,
    visibility: "gated",
    kind: "system",
  });
}

export function seoInputForArticle(article: Article): SeoInput {
  return {
    title: article.title,
    description: article.summary,
    path: `/blog/${article.slug}`,
    visibility: "public",
    kind: "article",
    publishedAt: article.publishedAt,
    lastModified: article.updatedAt,
    social: article.coverImage
      ? {
          title: article.title,
          description: article.summary,
          imageUrl: article.coverImage.src,
          imageAlt: article.coverImage.alt,
        }
      : undefined,
  };
}

export function metadataForArticle(article: Article): Metadata {
  return buildMetadata(seoInputForArticle(article));
}

export function structuredDataForArticle(article: Article): StructuredData {
  return buildStructuredData(seoInputForArticle(article), {
    articleAuthor: article.author.name,
  });
}

export function seoInputForLegalDocument(document: LegalDocument): SeoInput {
  return {
    title: document.title,
    description: document.summary,
    path: `/legal/${document.slug}`,
    visibility: "public",
    kind: "legal",
    lastModified: document.effectiveDate,
  };
}

export function metadataForLegalDocument(document: LegalDocument): Metadata {
  return buildMetadata(seoInputForLegalDocument(document));
}

export function structuredDataForLegalDocument(
  document: LegalDocument
): StructuredData {
  return buildStructuredData(seoInputForLegalDocument(document));
}

export function seoInputForCity(city: CityPageConfig): SeoInput {
  return {
    title: city.pageTitle,
    description: city.summary,
    path: `/cities/${city.slug}`,
    visibility: "public",
    kind: "marketing",
    lastModified: city.lastUpdated,
  };
}

export function metadataForCity(city: CityPageConfig): Metadata {
  return buildMetadata(seoInputForCity(city));
}

export function structuredDataForCity(city: CityPageConfig): StructuredData {
  return buildStructuredData(seoInputForCity(city));
}

export function seoInputForCommunity(
  community: CommunityPageConfig
): SeoInput {
  return {
    title: community.pageTitle,
    description: community.summary,
    path: `/communities/${community.slug}`,
    visibility: "public",
    kind: "marketing",
    lastModified: community.lastUpdated,
  };
}

export function metadataForCommunity(
  community: CommunityPageConfig
): Metadata {
  return buildMetadata(seoInputForCommunity(community));
}

export function structuredDataForCommunity(
  community: CommunityPageConfig
): StructuredData {
  return buildStructuredData(seoInputForCommunity(community));
}

export function seoInputForNewConstructionBuilder(
  builder: BuilderConfig
): SeoInput {
  return {
    title: builder.pageTitle,
    description: builder.summary,
    path: `/new-construction/builders/${builder.slug}`,
    visibility: "public",
    kind: "marketing",
    lastModified: builder.lastUpdated,
  };
}

export function metadataForNewConstructionBuilder(
  builder: BuilderConfig
): Metadata {
  return buildMetadata(seoInputForNewConstructionBuilder(builder));
}

export function structuredDataForNewConstructionBuilder(
  builder: BuilderConfig
): StructuredData {
  return buildStructuredData(seoInputForNewConstructionBuilder(builder));
}

export function seoInputForNewConstructionCommunity(
  community: NewConstructionCommunityConfig
): SeoInput {
  return {
    title: community.pageTitle,
    description: community.summary,
    path: `/new-construction/${community.slug}`,
    visibility: "public",
    kind: "marketing",
    lastModified: community.lastUpdated,
  };
}

export function metadataForNewConstructionCommunity(
  community: NewConstructionCommunityConfig
): Metadata {
  return buildMetadata(seoInputForNewConstructionCommunity(community));
}

export function structuredDataForNewConstructionCommunity(
  community: NewConstructionCommunityConfig
): StructuredData {
  return buildStructuredData(seoInputForNewConstructionCommunity(community));
}
