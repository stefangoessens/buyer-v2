import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Clock01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import type { GuideArticle, GuideSection } from "@/content/guides";

/**
 * Shared Florida buyer-guide template (KIN-1090).
 *
 * Mirrors `ArticleTemplate` in structure but layers in the patterns
 * unique to guides: an at-a-glance TL;DR block, a sticky desktop
 * table-of-contents sidebar, typed callouts, numbered step blocks,
 * and a brand-blue footer CTA. Legacy marketing tokens only — no
 * shadcn primitives, no radix-luma tokens.
 */
export function GuideTemplate({ guide }: { guide: GuideArticle }) {
  const headingId = `guide-${guide.slug}-title`;
  return (
    <article aria-labelledby={headingId}>
      <section className="w-full bg-neutral-50">
        <div className="mx-auto max-w-[1248px] px-6 pt-16 lg:pt-20">
          <Link
            href="/guides"
            className="inline-flex items-center rounded-[20px] text-xs font-semibold uppercase tracking-wide text-primary-700 hover:text-primary-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-400"
          >
            &larr; All Florida buyer guides
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-primary-700">
            {guide.heroEyebrow}
          </p>
          <h1
            id={headingId}
            className="mt-3 max-w-[848px] text-4xl font-bold tracking-tight text-neutral-800 lg:text-5xl"
          >
            {guide.title}
          </h1>
          <p className="mt-5 max-w-[848px] text-lg text-neutral-500">
            {guide.summary}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-500">
            <span className="inline-flex items-center gap-2">
              <HugeiconsIcon
                icon={Clock01Icon}
                size={16}
                strokeWidth={2}
                aria-hidden="true"
              />
              {guide.readingTimeMinutes} min read
            </span>
            <span>Updated {formatDate(guide.updatedAt)}</span>
          </div>
        </div>
      </section>

      <section className="w-full bg-neutral-50 pt-10">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="rounded-[28px] bg-primary-50 p-8 lg:p-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-700">
              At a glance
            </h2>
            <ul className="mt-5 grid gap-3 text-base text-neutral-800 md:grid-cols-2">
              {guide.atAGlance.map((point) => (
                <li key={point} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary-400"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="w-full bg-neutral-50 py-12 lg:py-16">
        <div className="mx-auto grid max-w-[1248px] grid-cols-1 gap-10 px-6 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 max-w-[848px]">
            {guide.body.map((section, idx) => (
              <GuideSectionRenderer key={idx} section={section} />
            ))}
            {guide.footnotes && guide.footnotes.length > 0 ? (
              <aside className="mt-12 rounded-[20px] bg-white p-6 ring-1 ring-primary-50 lg:p-8">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                  Footnotes &amp; sources
                </h2>
                <ol className="mt-4 space-y-3 text-sm text-neutral-500">
                  {guide.footnotes.map((note, idx) => (
                    <li key={idx} className="flex gap-3">
                      <sup className="font-semibold text-primary-700">
                        {idx + 1}
                      </sup>
                      <span>{note}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            ) : null}
            <p className="mt-10 text-xs text-neutral-500">
              Published {formatDate(guide.publishedAt)}
              {guide.publishedAt !== guide.updatedAt ? (
                <> &middot; Updated {formatDate(guide.updatedAt)}</>
              ) : null}
            </p>
          </div>
          <aside className="hidden lg:block">
            <nav
              aria-label="On this page"
              className="sticky top-24 rounded-[20px] bg-white p-6 ring-1 ring-primary-50"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                On this page
              </h2>
              <ol className="mt-4 space-y-2 text-sm">
                {guide.tableOfContents.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="rounded-[20px] text-neutral-500 transition-colors hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-400"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        </div>
      </section>

      <section className="w-full bg-neutral-50 pb-16 lg:pb-20">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="rounded-[28px] bg-primary-50 p-8 text-center lg:p-12">
            <h2 className="text-2xl font-bold text-neutral-800 lg:text-3xl">
              {guide.ctaHeadline}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-neutral-500">
              {guide.ctaBody}
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/get-started"
                className="inline-flex items-center justify-center rounded-[20px] bg-primary-400 px-8 py-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-400"
              >
                {guide.ctaButtonLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

function GuideSectionRenderer({ section }: { section: GuideSection }) {
  switch (section.kind) {
    case "heading":
      return (
        <h2
          id={section.id}
          className="mt-12 scroll-mt-24 text-2xl font-bold text-neutral-800 lg:text-3xl"
        >
          {section.text}
        </h2>
      );
    case "paragraph":
      return (
        <p className="mt-5 text-base leading-relaxed text-neutral-800">
          {section.text}
        </p>
      );
    case "list":
      return (
        <ul className="mt-5 space-y-2 text-base text-neutral-800">
          {section.items.map((item) => (
            <li key={item} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-primary-400"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "callout": {
      const isWarning = section.tone === "warning";
      return (
        <aside
          className="mt-8 rounded-[20px] border border-primary-50 bg-white p-6"
          role="note"
        >
          <div className="flex gap-4">
            <HugeiconsIcon
              icon={isWarning ? Alert02Icon : InformationCircleIcon}
              size={22}
              strokeWidth={2}
              className={isWarning ? "text-primary-700" : "text-primary-400"}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">
                {section.title}
              </p>
              <p className="mt-2 text-base text-neutral-800">{section.body}</p>
            </div>
          </div>
        </aside>
      );
    }
    case "steps":
      return (
        <ol className="mt-6 space-y-5">
          {section.items.map((step, idx) => (
            <li
              key={step.title}
              className="flex gap-5 rounded-[20px] bg-white p-6 ring-1 ring-primary-50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-400 text-sm font-bold text-white">
                {idx + 1}
              </span>
              <div>
                <p className="text-base font-semibold text-neutral-800">
                  {step.title}
                </p>
                <p className="mt-2 text-base text-neutral-500">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      );
    default:
      return null;
  }
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const m = months[parseInt(month ?? "1", 10) - 1] ?? "";
  return `${m} ${parseInt(day ?? "1", 10)}, ${year}`;
}
