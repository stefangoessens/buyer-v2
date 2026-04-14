import type { Metadata } from "next";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";
import { FaqHeroSection } from "@/components/marketing/sections/FaqHeroSection";
import { FaqAccordionSection } from "@/components/marketing/sections/FaqAccordionSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import {
  metadataForStaticPage,
  structuredDataForStaticPage,
} from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("faq");

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
      <FaqHeroSection />
      <FaqAccordionSection entries={entries} />
      <FinalCtaSection />
    </>
  );
}
