import type { Metadata } from "next";
import { HowItWorksHeroSection } from "@/components/marketing/sections/HowItWorksHeroSection";
import { HowItWorksStep } from "@/components/marketing/HowItWorksStep";
import { AiBrokerSplitSection } from "@/components/marketing/sections/AiBrokerSplitSection";
import { HowItWorksTrustSection } from "@/components/marketing/sections/HowItWorksTrustSection";
import { HowItWorksFaqTeaserSection } from "@/components/marketing/sections/HowItWorksFaqTeaserSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { HOW_IT_WORKS } from "@/content/how-it-works";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("howItWorks");

export default function HowItWorksPage() {
  return (
    <>
      <HowItWorksHeroSection
        eyebrow={HOW_IT_WORKS.eyebrow}
        title={HOW_IT_WORKS.title}
        description={HOW_IT_WORKS.description}
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="flex flex-col gap-20 lg:gap-28">
            {HOW_IT_WORKS.steps.map((step, index) => (
              <HowItWorksStep
                key={step.id}
                number={step.number}
                title={step.title}
                body={step.description}
                technicalDetail={step.technicalDetail}
                imageSrc={step.imageSrc}
                imageAlt={step.imageAlt}
                reverse={index % 2 === 1}
              />
            ))}
          </div>
        </div>
      </section>

      <AiBrokerSplitSection />

      <HowItWorksTrustSection />

      <HowItWorksFaqTeaserSection />

      <FinalCtaSection />
    </>
  );
}
