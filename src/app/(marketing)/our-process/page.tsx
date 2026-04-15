import type { Metadata } from "next";
import Link from "next/link";
import {
  metadataForStaticPage,
  structuredDataForStaticPage,
} from "@/lib/seo/pageDefinitions";
import { PageViewTracker } from "./PageViewTracker";

export const metadata: Metadata = metadataForStaticPage("ourProcess");

interface ProcessStep {
  number: number;
  title: string;
  body: string;
}

const STEPS: readonly ProcessStep[] = [
  {
    number: 1,
    title: "Paste a link",
    body:
      "Zillow, Redfin, Realtor.com, or any FL listing. We turn it into a full deal room in ~20 seconds.",
  },
  {
    number: 2,
    title: "We run the numbers",
    body:
      "Fair-value pricing, comp set, offer strategy, risk flags. Every number is auditable, every number has a source.",
  },
  {
    number: 3,
    title: "You review with our broker",
    body:
      "A licensed Florida broker walks you through the strategy on a short call. No pressure, no upsell.",
  },
  {
    number: 4,
    title: "We handle the listing-side ask",
    body:
      "Disclosures, inspection history, HOA docs. Your name stays out of the awkward emails.",
  },
  {
    number: 5,
    title: "You submit an offer with confidence",
    body:
      "Price, terms, contingencies, walk-away line. All backed by data.",
  },
  {
    number: 6,
    title: "Close and keep the rebate",
    body:
      "Up to 2% back at closing, paid via credit or post-close wire.",
  },
];

export default function OurProcessPage() {
  const jsonLd = structuredDataForStaticPage("ourProcess", {
    howToSteps: STEPS.map((s) => ({ name: s.title, text: s.body })),
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageViewTracker />

      {/* Hero */}
      <section className="relative w-full overflow-hidden bg-[#FCFBFF]">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-[radial-gradient(1000px_600px_at_20%_0%,#EBF4FF_0%,#FCFBFF_55%,#FFFFFF_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(720px_480px_at_90%_18%,#F1ECFF_0%,rgba(252,251,255,0)_55%)]" />
        </div>

        <div className="relative mx-auto max-w-[1248px] px-6 py-16 lg:px-8 lg:py-20">
          <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
            <ol className="flex items-center gap-2">
              <li>
                <Link
                  href="/"
                  className="font-medium text-primary-700 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  Home
                </Link>
              </li>
              <li aria-hidden="true" className="text-neutral-400">
                /
              </li>
              <li aria-current="page" className="text-neutral-800">
                Our process
              </li>
            </ol>
          </nav>

          <div className="mt-6 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm ring-1 ring-neutral-200/80">
              <span className="inline-block size-1.5 rounded-full bg-primary-400" />
              Our process
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.006em] text-neutral-800 sm:text-5xl lg:text-[52px] lg:leading-[1.15]">
              Six steps from a listing link to a closed Florida home
            </h1>
            <p className="mt-6 text-[18px] leading-[1.5] text-neutral-500">
              We built the buyer-v2 workflow so a Florida homebuyer never has
              to ride the listing side&apos;s process alone. Every step is
              written down, broker-supervised, and billed from the
              commission — not from you.
            </p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <ol className="flex flex-col gap-12 lg:gap-16">
            {STEPS.map((step) => {
              const padded = String(step.number).padStart(2, "0");
              return (
                <li
                  key={step.number}
                  className="group relative rounded-[20px] bg-neutral-50 p-8 ring-1 ring-neutral-200/70 lg:p-12"
                >
                  <div className="flex items-baseline gap-4">
                    <span
                      aria-hidden="true"
                      className="bg-gradient-to-br from-primary-400 to-primary-700 bg-clip-text text-5xl font-semibold tracking-tight text-transparent lg:text-6xl"
                    >
                      {padded}
                    </span>
                    <span className="text-sm font-semibold uppercase tracking-widest text-primary-400">
                      Step {step.number}
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-3xl lg:leading-[1.2]">
                    {step.title}
                  </h2>
                  <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-neutral-500">
                    {step.body}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="w-full bg-white pb-20 lg:pb-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="rounded-[20px] bg-primary-800 px-8 py-14 text-white lg:px-14 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary-100/80">
                Start with a link
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-white lg:text-[41px] lg:leading-[1.2]">
                Ready to see your deal room?
              </h2>
              <p className="mt-4 text-lg text-primary-100/80">
                Drop any Florida listing URL. We&apos;ll have your free
                analysis and a broker review ready in minutes.
              </p>
              <div className="mt-8 flex justify-center">
                <Link
                  href="/get-started"
                  className="inline-flex items-center justify-center rounded-full bg-primary-400 px-8 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-800"
                >
                  Start with a link
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
