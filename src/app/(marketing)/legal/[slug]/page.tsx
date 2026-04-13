import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import {
  ContentPageTemplate,
  ContentValidationError,
} from "@/components/marketing/content/ContentPageTemplate";
import {
  EffectiveDateStamp,
  LegalDocumentTemplate,
} from "@/components/marketing/content/LegalDocumentTemplate";
import type { ContentPageMeta } from "@/lib/content/types";
import { filterPublic } from "@/lib/content/publicFilter";
import {
  metadataForLegalDocument,
  metadataForMissingPage,
  structuredDataForLegalDocument,
} from "@/lib/seo/pageDefinitions";

type PageParams = { slug: string };

export async function generateStaticParams(): Promise<PageParams[]> {
  return Object.keys(LEGAL_DOCUMENTS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = LEGAL_DOCUMENTS[slug];
  if (!doc) {
    // Unknown legal slugs must NOT be indexed — mark as gated so
    // buildMetadata emits noindex,nofollow. The page itself calls
    // notFound() below which surfaces the 404, but the metadata is
    // computed before that runs, so we need the explicit guard here
    // to prevent indexing of stray /legal/<wrong-slug> URLs.
    return metadataForMissingPage({
      title: "Not found",
      description:
        "The legal document you're looking for doesn't exist or has moved.",
      path: "/legal/not-found",
    });
  }
  return metadataForLegalDocument(doc);
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const doc = LEGAL_DOCUMENTS[slug];

  if (!doc) {
    notFound();
  }

  const meta: ContentPageMeta = {
    slug: doc.slug,
    eyebrow: "Legal",
    title: doc.title,
    description: doc.summary,
  };

  const publicSections = filterPublic(doc.sections);
  const hasContent = publicSections.length > 0;

  const jsonLd = structuredDataForLegalDocument(doc);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ContentPageTemplate
        meta={meta}
        heroSuffix={<EffectiveDateStamp doc={doc} />}
      >
        {hasContent ? (
          <LegalDocumentTemplate doc={doc} />
        ) : (
          <ContentValidationError
            missing={[`legal/${doc.slug}: no public sections`]}
          />
        )}
      </ContentPageTemplate>
    </>
  );
}
