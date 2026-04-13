import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCATION_CATALOG } from "@/content/locations";
import {
  allPublicCommunitySlugs,
  findPublicCity,
  findPublicCommunity,
} from "@/lib/locations/selectors";
import { CommunityPageTemplate } from "@/components/marketing/locations/CommunityPageTemplate";
import {
  metadataForCommunity,
  metadataForMissingPage,
  structuredDataForCommunity,
} from "@/lib/seo/pageDefinitions";

/**
 * Dynamic community (neighborhood) landing page route (KIN-818).
 *
 * Pre-rendered at build time via `generateStaticParams` — one static
 * HTML file per public community in `LOCATION_CATALOG`. Draft and
 * unknown slugs return `notFound()` with a `noindex` metadata
 * response.
 */

type PageParams = { slug: string };

export async function generateStaticParams(): Promise<PageParams[]> {
  return allPublicCommunitySlugs(LOCATION_CATALOG).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const community = findPublicCommunity(LOCATION_CATALOG, slug);

  if (!community) {
    return metadataForMissingPage({
      title: "Community not found",
      description:
        "The community guide you're looking for doesn't exist, is still in draft, or has moved.",
      path: "/communities/not-found",
    });
  }

  return metadataForCommunity(community);
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const community = findPublicCommunity(LOCATION_CATALOG, slug);

  if (!community) {
    notFound();
  }

  // Resolve the parent city so the template can show a breadcrumb.
  // Draft parent cities return undefined here — the template handles
  // that gracefully by falling back to the generic "Back to buyer-v2"
  // link. Note: `validateCatalog` already enforces that every
  // community references a city that exists, so the parent will
  // only be missing when the parent is in draft visibility.
  const parentCity = findPublicCity(LOCATION_CATALOG, community.citySlug);

  const jsonLd = structuredDataForCommunity(community);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CommunityPageTemplate
        community={community}
        parentCity={parentCity}
      />
    </>
  );
}
