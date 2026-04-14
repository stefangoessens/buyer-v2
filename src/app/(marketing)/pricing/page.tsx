import type { Metadata } from "next";
import { PricingHeroSection } from "@/components/marketing/sections/PricingHeroSection";
import { FreeForBuyersSection } from "@/components/marketing/sections/FreeForBuyersSection";
import { RebateMathExamplesSection } from "@/components/marketing/sections/RebateMathExamplesSection";
import { SavingsCalculatorSection } from "@/components/marketing/sections/SavingsCalculatorSection";
import { PricingComparisonTable } from "@/components/marketing/sections/PricingComparisonTable";
import { IncludedServicesSection } from "@/components/marketing/sections/IncludedServicesSection";
import { PricingFaqTeaserSection } from "@/components/marketing/sections/PricingFaqTeaserSection";
import { PricingDisclosuresSection } from "@/components/marketing/sections/PricingDisclosuresSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("pricing");

export default function PricingPage() {
  return (
    <>
      <PricingHeroSection />
      <FreeForBuyersSection />
      <RebateMathExamplesSection />
      <SavingsCalculatorSection />
      <PricingComparisonTable />
      <IncludedServicesSection />
      <PricingFaqTeaserSection />
      <PricingDisclosuresSection />
      <FinalCtaSection />
    </>
  );
}
