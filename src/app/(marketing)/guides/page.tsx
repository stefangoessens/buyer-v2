import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { publicGuides, type GuideArticle } from "@/content/guides";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("guides");

export default function GuidesIndexPage() {
  const guides = publicGuides();

  return (
    <>
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
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm ring-1 ring-neutral-200/80">
              <span className="inline-block size-1.5 rounded-full bg-primary-400" />
              Florida buyer guides
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.006em] text-neutral-800 sm:text-5xl lg:text-[52px] lg:leading-[1.15]">
              Plain-language guides for Florida homebuyers
            </h1>
            <p className="mt-6 text-[18px] leading-[1.5] text-neutral-500">
              Homestead exemption, buyer rebates, closing costs, hurricane
              insurance, and more. Written for buyers, reviewed by brokers,
              and kept current with Florida&apos;s quirks.
            </p>
          </div>
        </div>
      </section>

      {/* Guide grid */}
      <section className="w-full bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          {guides.length === 0 ? (
            <div className="rounded-[20px] bg-neutral-50 p-10 text-center ring-1 ring-neutral-200">
              <p className="text-sm text-neutral-500">
                No guides published yet. Check back soon.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
              {guides.map((guide) => (
                <li key={guide.slug}>
                  <GuideCard guide={guide} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function GuideCard({ guide }: { guide: GuideArticle }) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="group flex h-full flex-col rounded-[20px] bg-neutral-50 p-8 ring-1 ring-neutral-200/70 transition hover:bg-white hover:ring-primary-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-400 lg:p-10"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
        {guide.heroEyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[28px] lg:leading-[1.2]">
        {guide.title}
      </h2>
      <p className="mt-4 line-clamp-4 text-base leading-relaxed text-neutral-500">
        {guide.summary}
      </p>
      <div className="mt-6 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm text-neutral-500">
          <HugeiconsIcon
            icon={Clock01Icon}
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
          {guide.readingTimeMinutes} min read
        </span>
        <span className="text-sm font-semibold text-primary-700 transition group-hover:text-primary-400">
          Read guide &rarr;
        </span>
      </div>
    </Link>
  );
}
