import type { Metadata } from "next";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";
import type { FAQEntry, FAQTheme } from "@/lib/content/types";
import { FaqHeroSection } from "@/components/marketing/sections/FaqHeroSection";
import { FaqThemeJumpNav } from "@/components/marketing/sections/FaqThemeJumpNav";
import { FaqAccordionSection } from "@/components/marketing/sections/FaqAccordionSection";
import { FaqStillHaveQuestionsCta } from "@/components/marketing/sections/FaqStillHaveQuestionsCta";
import {
  metadataForStaticPage,
  structuredDataForStaticPage,
} from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("faq");

function buildFAQStructuredData() {
  const entries = filterPublic(FAQ_ENTRIES).map((e) => ({
    question: e.question,
    answer: e.answer,
    slug: e.id,
  }));
  return structuredDataForStaticPage("faq", { faqEntries: entries });
}

export default function FAQPage() {
  const publicEntries = filterPublic(FAQ_ENTRIES);
  const jsonLd = buildFAQStructuredData();

  const byTheme: Record<FAQTheme, FAQEntry[]> = {
    how_it_works: publicEntries.filter((e) => e.theme === "how_it_works"),
    how_you_save: publicEntries.filter((e) => e.theme === "how_you_save"),
    protection: publicEntries.filter((e) => e.theme === "protection"),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FaqHeroSection />
      <FaqThemeJumpNav />
      <FaqAccordionSection theme="how_it_works" entries={byTheme.how_it_works} />
      <FaqAccordionSection theme="how_you_save" entries={byTheme.how_you_save} />
      <FaqAccordionSection
        theme="protection"
        entries={byTheme.protection}
        variant="emphasis"
      />
      <FaqStillHaveQuestionsCta />
    </>
  );
}
