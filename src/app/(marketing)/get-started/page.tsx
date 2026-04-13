import Image from "next/image";
import { PageHeader } from "@/components/marketing/PageHeader";
import { HeroInput } from "@/components/marketing/HeroInput";

const steps = [
  {
    number: 1,
    title: "Paste a link",
    description: "Copy a Zillow, Redfin, or Realtor.com URL and paste it into the analysis bar.",
    imageSrc: "/images/marketing/steps/step-1.png",
  },
  {
    number: 2,
    title: "Review your report",
    description: "Get fair pricing, comps, leverage signals, and an overpay risk score in seconds.",
    imageSrc: "/images/marketing/steps/step-2.png",
  },
  {
    number: 3,
    title: "Close with confidence",
    description: "Work with a licensed Florida broker to negotiate and manage the deal room timeline.",
    imageSrc: "/images/marketing/steps/step-3.png",
  },
];

export default function GetStartedPage() {
  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title={<>Paste a link. Get instant analysis.</>}
        description={
          <>
            Start with a free AI-powered report. If you want representation, we’ll connect you with a licensed Florida broker.
          </>
        }
        imageSrc="/images/marketing/hero/product-dashboard.png"
        imageAlt="buyer-v2 analysis dashboard"
        imageClassName="object-top"
      />

      <section className="w-full bg-white pb-20 lg:pb-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="mx-auto max-w-2xl rounded-[24px] border border-neutral-200/80 bg-white p-6 shadow-sm md:p-8">
            <HeroInput />
            <p className="mt-3 text-xs text-neutral-400">
              By continuing you agree to our Terms. We never sell your data.
            </p>
          </div>
        </div>
      </section>

      <section className="w-full bg-neutral-50 py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Simple process</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
              Three steps to your best deal
            </h2>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
            {steps.map((step) => (
              <div key={step.number} className="group text-center">
                <p className="text-sm font-bold text-primary-400">{step.number}</p>
                <h3 className="mt-2 text-xl font-semibold text-neutral-800">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{step.description}</p>
                <div className="mt-6 overflow-hidden rounded-[24px] border border-neutral-200 bg-white transition-shadow duration-300 group-hover:shadow-lg">
                  <div className="relative aspect-[3/4] bg-neutral-50">
                    <Image src={step.imageSrc} alt="" fill className="object-cover object-top" sizes="(max-width: 768px) 100vw, 33vw" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

