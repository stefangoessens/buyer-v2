import type { Metadata } from "next";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";
import {
  ContentPageTemplate,
  ContentValidationError,
} from "@/components/marketing/content/ContentPageTemplate";
import { FAQSection } from "@/components/marketing/content/FAQSection";
import type { ContentPageMeta } from "@/lib/content/types";

const META: ContentPageMeta = {
  slug: "faq",
  eyebrow: "Frequently asked questions",
  title: "Everything you want to know",
  description:
    "How buyer-v2 works, how the buyer credit is calculated, and what happens when you engage us — in plain language.",
};

export const metadata: Metadata = {
  title: `FAQ | buyer-v2`,
  description: META.description,
  openGraph: {
    title: META.title,
    description: META.description,
    type: "website",
  },
};

export default function FAQPage() {
  const entries = filterPublic(FAQ_ENTRIES);

  return (
    <ContentPageTemplate meta={META}>
      {entries.length === 0 ? (
        <ContentValidationError missing={["faqs: no public entries"]} />
      ) : (
        <FAQSection entries={entries} />
      )}
    </ContentPageTemplate>
  );
}
