import type { Metadata } from "next";
import Image from "next/image";
import { PageHeader } from "@/components/marketing/PageHeader";
import { HeroInput } from "@/components/marketing/HeroInput";
import { HOW_IT_WORKS } from "@/content/how-it-works";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("howItWorks");

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow={HOW_IT_WORKS.eyebrow}
        title={HOW_IT_WORKS.title}
        description={HOW_IT_WORKS.description}
        imageSrc="/images/marketing/bento/bento-6.png"
        imageAlt="buyer-v2 deal room timeline showing tasks and milestones"
      />

      {/* ── Steps grid (mirrors the homepage anchor visual) ─────────── */}
      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
            {HOW_IT_WORKS.steps.map((step) => (
              <div key={step.id} className="group text-center">
                <p className="text-sm font-bold text-primary-400">{step.number}</p>
                <h3 className="mt-2 text-xl font-semibold text-neutral-800">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{step.description}</p>
                <div className="mt-6 overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50 transition-shadow duration-300 group-hover:shadow-lg">
                  <div className="relative aspect-[3/4]">
                    <Image
                      src={step.imageSrc}
                      alt={step.imageAlt ?? ""}
                      fill
                      className="object-cover object-top"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final paste-link CTA ────────────────────────────────────── */}
      <section className="w-full bg-neutral-50 py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
            Ready to start?
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-neutral-500">
            Paste any Zillow, Redfin, or Realtor link and we&apos;ll have your free analysis in seconds.
          </p>
          <div className="mt-8">
            <HeroInput />
          </div>
        </div>
      </section>
    </>
  );
}
