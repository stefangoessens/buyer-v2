import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NEW_CONSTRUCTION_CATALOG } from "@/content/newConstruction";
import {
  allPublicCommunitySlugs,
  findPublicBuilder,
  findPublicCommunity,
} from "@/lib/newConstruction/selectors";
import { NewConstructionCommunityPageTemplate } from "@/components/marketing/newConstruction/NewConstructionCommunityPageTemplate";
import {
  metadataForMissingPage,
  metadataForNewConstructionCommunity,
  structuredDataForNewConstructionCommunity,
} from "@/lib/seo/pageDefinitions";

/**
 * Dynamic new-construction community landing page (KIN-823).
 *
 * SSG-rendered via `generateStaticParams` — one static HTML file
 * per public community. Draft and unknown slugs return `notFound()`
 * with a `noindex` metadata response.
 *
 * Reserved path: `/new-construction/builders/*` is excluded from
 * this dynamic segment by virtue of Next.js route priority — the
 * sibling `builders/[slug]` route takes precedence over the
 * catch-all `[slug]` route, so a community with slug `"builders"`
 * would collide. `validateCatalog` does NOT enforce this
 * explicitly; the Next.js build surfaces it if it ever happens.
 */

type PageParams = { slug: string };

export async function generateStaticParams(): Promise<PageParams[]> {
  return allPublicCommunitySlugs(NEW_CONSTRUCTION_CATALOG).map((slug) => ({
    slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const community = findPublicCommunity(NEW_CONSTRUCTION_CATALOG, slug);

  if (!community) {
    return metadataForMissingPage({
      title: "Community not found",
      description:
        "The community guide you're looking for doesn't exist, is still in draft, or has moved.",
      path: "/new-construction/not-found",
    });
  }

  return metadataForNewConstructionCommunity(community);
}

export default async function NewConstructionCommunityPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const community = findPublicCommunity(NEW_CONSTRUCTION_CATALOG, slug);

  if (!community) {
    notFound();
  }

  // Look up the parent builder — undefined when the parent is
  // draft-visibility. The template renders a generic "Back to
  // buyer-v2" breadcrumb in that case.
  const parentBuilder = findPublicBuilder(
    NEW_CONSTRUCTION_CATALOG,
    community.builderSlug
  );

  const jsonLd = structuredDataForNewConstructionCommunity(community);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NewConstructionCommunityPageTemplate
        community={community}
        parentBuilder={parentBuilder}
      />
    </>
  );
}
