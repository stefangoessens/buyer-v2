import type { Metadata } from "next";
import Link from "next/link";
import { PRICING_SECTIONS } from "@/content/pricing";
import { PUBLIC_DISCLOSURES } from "@/content/disclosures";
import { filterPublic, selectDisclosures } from "@/lib/content/publicFilter";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Button } from "@/components/ui/button";
import {
  PricingSections,
  DisclosureList,
} from "@/components/marketing/content/PricingSections";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("pricing");

export default function PricingPage() {
  const sections = filterPublic(PRICING_SECTIONS);
  const headlineIds = [
    "estimate_not_guarantee",
    "commission_negotiable",
    "buyer_credit_conditions",
  ];
  const headlineDisclosures = selectDisclosures(PUBLIC_DISCLOSURES, headlineIds);

  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Free for buyers. Paid from the commission."
        description="buyer-v2 never charges buyers up front. Our fee comes out of the buyer-agent commission at closing, and we rebate a portion of it back to you."
        imageSrc="/images/marketing/bento/bento-1.png"
        imageAlt="buyer-v2 fair pricing engine showing AI-powered price ranges"
      />

      <section className="w-full bg-white py-12 lg:py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Button asChild size="lg">
            <Link href="/savings">Open savings calculator</Link>
          </Button>
        </div>
      </section>

      <section className="w-full bg-white py-12 lg:py-16">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          {sections.length === 0 ? (
            <p className="text-sm text-destructive">
              pricing: no public sections
            </p>
          ) : (
            <PricingSections sections={sections} />
          )}
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
        </div>
      </section>
    </>
  );
}
