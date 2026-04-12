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
    return { title: "Not found | buyer-v2" };
  }
  return {
    title: `${doc.title} | buyer-v2`,
    description: doc.summary,
    openGraph: {
      title: doc.title,
      description: doc.summary,
      type: "article",
    },
  };
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

  return (
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
  );
}
