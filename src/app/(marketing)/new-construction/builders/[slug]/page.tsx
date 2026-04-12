import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NEW_CONSTRUCTION_CATALOG } from "@/content/newConstruction";
import {
  allPublicBuilderSlugs,
  communitiesForBuilder,
  findPublicBuilder,
} from "@/lib/newConstruction/selectors";
import { BuilderPageTemplate } from "@/components/marketing/newConstruction/BuilderPageTemplate";
import { buildMetadata, buildStructuredData } from "@/lib/seo/builder";

/**
 * Dynamic new-construction builder landing page (KIN-823).
 *
 * SSG-rendered at build time via `generateStaticParams` — one
 * static HTML file per public builder in `NEW_CONSTRUCTION_CATALOG`.
 * Draft and unknown slugs return `notFound()` with a `noindex`
 * metadata response.
 */

type PageParams = { slug: string };

export async function generateStaticParams(): Promise<PageParams[]> {
  return allPublicBuilderSlugs(NEW_CONSTRUCTION_CATALOG).map((slug) => ({
    slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const builder = findPublicBuilder(NEW_CONSTRUCTION_CATALOG, slug);

  if (!builder) {
    return buildMetadata({
      title: "Builder not found",
      description:
        "The builder guide you're looking for doesn't exist, is still in draft, or has moved.",
      path: "/new-construction/builders/not-found",
      visibility: "gated",
      kind: "system",
    });
  }

  return buildMetadata({
    title: builder.pageTitle,
    description: builder.summary,
    path: `/new-construction/builders/${builder.slug}`,
    visibility: "public",
    kind: "marketing",
    lastModified: builder.lastUpdated,
  });
}

export default async function BuilderPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const builder = findPublicBuilder(NEW_CONSTRUCTION_CATALOG, slug);

  if (!builder) {
    notFound();
  }

  const communities = communitiesForBuilder(
    NEW_CONSTRUCTION_CATALOG,
    builder.slug
  );

  const jsonLd = buildStructuredData({
    title: builder.pageTitle,
    description: builder.summary,
    path: `/new-construction/builders/${builder.slug}`,
    visibility: "public",
    kind: "marketing",
    lastModified: builder.lastUpdated,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BuilderPageTemplate builder={builder} communities={communities} />
    </>
  );
}
