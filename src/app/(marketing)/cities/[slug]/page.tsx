import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCATION_CATALOG } from "@/content/locations";
import {
  allPublicCitySlugs,
  findPublicCity,
} from "@/lib/locations/selectors";
import { CityPageTemplate } from "@/components/marketing/locations/CityPageTemplate";
import {
  metadataForCity,
  metadataForMissingPage,
  structuredDataForCity,
} from "@/lib/seo/pageDefinitions";

/**
 * Dynamic city landing page route (KIN-818).
 *
 * Pre-rendered at build time via `generateStaticParams` — one static
 * HTML file per public city in `LOCATION_CATALOG`. Draft and unknown
 * slugs return `notFound()` and get a `noindex` metadata response
 * so no stub page is ever indexed.
 */

type PageParams = { slug: string };

export async function generateStaticParams(): Promise<PageParams[]> {
  return allPublicCitySlugs(LOCATION_CATALOG).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const city = findPublicCity(LOCATION_CATALOG, slug);

  if (!city) {
    // Unknown or draft slug → noindex. Mirrors the pattern used by
    // /blog/[slug] and /legal/[slug] so the route registry doesn't
    // need explicit entries for error states.
    return metadataForMissingPage({
      title: "City not found",
      description:
        "The city guide you're looking for doesn't exist, is still in draft, or has moved.",
      path: "/cities/not-found",
    });
  }

  return metadataForCity(city);
}

export default async function CityPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const city = findPublicCity(LOCATION_CATALOG, slug);

  if (!city) {
    notFound();
  }

  const jsonLd = structuredDataForCity(city);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CityPageTemplate city={city} catalog={LOCATION_CATALOG} />
    </>
  );
}
