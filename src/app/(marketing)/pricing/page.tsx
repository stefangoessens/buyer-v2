import type { Metadata } from "next";
import { PRICING_SECTIONS } from "@/content/pricing";
import { PUBLIC_DISCLOSURES } from "@/content/disclosures";
import { filterPublic, selectDisclosures } from "@/lib/content/publicFilter";
import {
  ContentPageTemplate,
  ContentValidationError,
} from "@/components/marketing/content/ContentPageTemplate";
import {
  PricingSections,
  DisclosureList,
} from "@/components/marketing/content/PricingSections";
import type { ContentPageMeta } from "@/lib/content/types";
import { buildMetadata } from "@/lib/seo/builder";

const META: ContentPageMeta = {
  slug: "pricing",
  eyebrow: "Pricing",
  title: "Free for buyers. Paid from the commission.",
  description:
    "buyer-v2 never charges buyers up front. Our fee comes out of the buyer-agent commission at closing, and we rebate a portion of it back to you.",
};

export const metadata: Metadata = buildMetadata({
  title: META.title,
  description: META.description,
  path: "/pricing",
  visibility: "public",
  kind: "marketing",
});

export default function PricingPage() {
  const sections = filterPublic(PRICING_SECTIONS);

  if (sections.length === 0) {
    return (
      <ContentPageTemplate meta={META}>
        <ContentValidationError missing={["pricing: no public sections"]} />
      </ContentPageTemplate>
    );
  }

  // Headline disclosures shown under the pricing sections
  const headlineIds = [
    "estimate_not_guarantee",
    "commission_negotiable",
    "buyer_credit_conditions",
  ];
  const headlineDisclosures = selectDisclosures(PUBLIC_DISCLOSURES, headlineIds);

  return (
    <ContentPageTemplate meta={META}>
      <PricingSections sections={sections} />

      {headlineDisclosures.length > 0 && (
        <div className="mt-12">
          <h2 className="text-base font-semibold text-neutral-900">
            Important disclosures
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            These apply to every figure on this page.
          </p>
          <div className="mt-4">
            <DisclosureList modules={headlineDisclosures} />
          </div>
        </div>
      )}
    </ContentPageTemplate>
  );
}
