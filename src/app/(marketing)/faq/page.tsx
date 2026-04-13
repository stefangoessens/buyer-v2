import type { Metadata } from "next";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";
import {
  ContentPageTemplate,
  ContentValidationError,
} from "@/components/marketing/content/ContentPageTemplate";
import { FAQSection } from "@/components/marketing/content/FAQSection";
import type { ContentPageMeta } from "@/lib/content/types";
import {
  metadataForStaticPage,
  structuredDataForStaticPage,
} from "@/lib/seo/pageDefinitions";

const META: ContentPageMeta = {
  slug: "faq",
  eyebrow: "Frequently asked questions",
  title: "Everything you want to know",
  description:
    "How buyer-v2 works, how the buyer credit is calculated, and what happens when you engage us — in plain language.",
};

export const metadata: Metadata = metadataForStaticPage("faq");

/**
 * FAQPage JSON-LD derived from the same filtered FAQ entries the
 * page renders. Keeps the structured data in sync with the visible
 * content without duplicating the list.
 */
function buildFAQStructuredData() {
  const entries = filterPublic(FAQ_ENTRIES).map((e) => ({
    question: e.question,
    answer: e.answer,
  }));
  return structuredDataForStaticPage("faq", { faqEntries: entries });
}

export default function FAQPage() {
  const entries = filterPublic(FAQ_ENTRIES);
  const jsonLd = buildFAQStructuredData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ContentPageTemplate meta={META}>
        {entries.length === 0 ? (
          <ContentValidationError missing={["faqs: no public entries"]} />
        ) : (
          <FAQSection entries={entries} />
        )}
      </ContentPageTemplate>
    </>
  );
}
