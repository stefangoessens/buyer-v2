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
import { BUYER_STORIES } from "@/content/trustProof";
import { filterPublishableStories } from "@/lib/trustProof/policy";
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
        "Buy your Florida home in 4 steps: AI analysis → Florida tour → licensed broker offer → coordinated closing. Up to 2% back at closing.",
      path: "/",
      visibility: "public",
      kind: "howTo",
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
  howItWorks: {
    seo: {
      title: "How buyer-v2 works",
      description:
        "Three steps from a pasted listing link to a closed Florida home — instant AI analysis, expert broker representation, and savings at closing.",
      path: "/how-it-works",
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
        "Answers about how buyer-v2 works, how you save, and how we protect you — from a licensed Florida buyer brokerage.",
      path: "/faq",
      visibility: "public",
      kind: "faq",
    },
    sitemap: {
      priority: 0.7,
      changeFrequency: "monthly",
    },
  },
  about: {
    seo: {
      title: "About buyer-v2",
      description:
        "buyer-v2 is a Florida-licensed buyer brokerage that pairs instant AI analysis with broker oversight on every deal. Meet the team and the operating model.",
      path: "/about",
      visibility: "public",
      kind: "marketing",
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
  stories: {
    seo: {
      title: "Buyer stories",
      description:
        "Real Florida buyers, real savings, real stories from buyer-v2 home purchases — verified outcomes with broker and legal sign-off before publication.",
      path: "/stories",
      visibility: "public",
      kind: "story",
    },
    sitemap: {
      priority: 0.65,
      changeFrequency: "monthly",
    },
  },
  intake: {
    seo: {
      title: "Importing listing",
      description: "Importing a listing into buyer-v2.",
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
  dashboardFavourites: {
    seo: {
      title: "Favourites",
      description: "Your starred properties and saved searches.",
      path: "/dashboard/favourites",
      visibility: "gated",
      kind: "product",
    },
  },
  dashboardProfile: {
    seo: {
      title: "Profile",
      description: "Account, notifications, and buyer preferences.",
      path: "/dashboard/profile",
      visibility: "gated",
      kind: "product",
    },
  },
  dashboardAgreements: {
    seo: {
      title: "Agreements",
      description: "Your buyer agreements, signed and pending.",
      path: "/dashboard/agreements",
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
    faqEntries?: Array<{ question: string; answer: string; slug?: string }>;
    howToSteps?: Array<{ name: string; text: string }>;
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

// MARK: - Buyer stories (KIN-1087)

/**
 * `/stories` archive should be noindex until at least one approved
 * buyer story exists. Drafts never count — `filterPublishableStories`
 * excludes them by default. Routes call this helper from their
 * `generateMetadata` so the noindex flag stays in sync with the
 * sitemap gating below.
 */
export function shouldNoindexStoriesArchive(): boolean {
  return filterPublishableStories(BUYER_STORIES).length === 0;
}
