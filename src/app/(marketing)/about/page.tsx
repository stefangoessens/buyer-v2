import type { Metadata } from "next";
import { AboutHeroSection } from "@/components/marketing/sections/AboutHeroSection";
import { AboutOperatingModelSection } from "@/components/marketing/sections/AboutOperatingModelSection";
import { AboutTrustSection } from "@/components/marketing/sections/AboutTrustSection";
import { AboutTeamSection } from "@/components/marketing/sections/AboutTeamSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { ABOUT } from "@/content/about";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("about");

export default function AboutPage() {
  return (
    <>
      <AboutHeroSection hero={ABOUT.hero} />

      <AboutOperatingModelSection operatingModel={ABOUT.operatingModel} />

      <AboutTrustSection trust={ABOUT.trust} />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
              {ABOUT.process.eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
              {ABOUT.process.title}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-neutral-500">
              {ABOUT.process.description}
            </p>
          </div>
          <ol className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
            {ABOUT.process.steps.map((step) => (
              <li
                key={step.id}
                className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-base font-semibold text-primary-700 ring-1 ring-primary-100">
                  {step.number}
                </div>
                <h3 className="mt-6 text-lg font-semibold tracking-tight text-neutral-800">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <AboutTeamSection team={ABOUT.team} />

      <FinalCtaSection />
    </>
  );
}
