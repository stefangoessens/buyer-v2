import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGuideBySlug, publicGuides } from "@/content/guides";
import { GuideTemplate } from "@/components/marketing/guides/GuideTemplate";
import {
  metadataForMissingPage,
  metadataForStaticPage,
  structuredDataForStaticPage,
  type StaticSeoPageKey,
} from "@/lib/seo/pageDefinitions";
import { GuideViewTracker } from "./GuideViewTracker";

type PageParams = { slug: string };

/**
 * Lookup from a guide slug to its static SEO page key. Every public
 * guide MUST have a matching entry in `STATIC_SEO_PAGES` — this map
 * is the join table so the dynamic route can resolve the right
 * definition at request time.
 */
const SLUG_TO_PAGE_KEY: Record<string, StaticSeoPageKey> = {
  "florida-homestead-exemption": "guideFloridaHomesteadExemption",
  "florida-buyer-rebate-explained": "guideFloridaBuyerRebateExplained",
};

export async function generateStaticParams(): Promise<PageParams[]> {
  return publicGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide || guide.visibility !== "public") {
    return metadataForMissingPage({
      title: "Guide not found",
      description:
        "The Florida buyer guide you're looking for doesn't exist, is still in draft, or has moved.",
      path: "/guides/not-found",
    });
  }

  const pageKey = SLUG_TO_PAGE_KEY[slug];
  if (!pageKey) {
    return metadataForMissingPage({
      title: guide.title,
      description: guide.summary,
      path: `/guides/${slug}`,
    });
  }

  return metadataForStaticPage(pageKey);
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide || guide.visibility !== "public") {
    notFound();
  }

  const pageKey = SLUG_TO_PAGE_KEY[slug];
  const jsonLd = pageKey ? structuredDataForStaticPage(pageKey) : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <GuideViewTracker guideSlug={guide.slug} guideCategory={guide.category} />
      <GuideTemplate guide={guide} />
    </>
  );
}
