import Link from "next/link";
import type { NewConstructionBlock } from "@/lib/newConstruction/types";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";

/**
 * Renderer for the `NewConstructionBlock` discriminated union used
 * by builder + community landing pages (KIN-823). Exhaustive switch
 * — the `never` fallback blocks compile when a new block kind is
 * added to the type without a matching case here.
 *
 * Kept side-by-side with the KIN-818 `LocationBlockRenderer` rather
 * than merged because the two surfaces carry distinct block kinds
 * (urgency, phase_list, savings_projection are new-construction
 * only). Merging would force both renderers to handle each other's
 * kinds at compile time with no runtime benefit.
 */
export function NewConstructionBlockRenderer({
  blocks,
}: {
  blocks: readonly NewConstructionBlock[];
}) {
  return (
    <div className="space-y-10 lg:space-y-14">
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: NewConstructionBlock }) {
  switch (block.kind) {
    case "hero_paragraph":
      return (
        <p className="text-lg leading-relaxed text-neutral-800 lg:text-xl">
          {block.text}
        </p>
      );

    case "urgency":
      return (
        <div className="rounded-2xl border-l-4 border-accent-500 bg-accent-50/70 p-5 lg:p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-accent-700">
            Time-sensitive
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-neutral-900 lg:text-2xl">
            {block.headline}
          </h3>
          <p className="mt-2 text-base leading-relaxed text-neutral-800">
            {block.body}
          </p>
          {(block.deadline || block.scarcitySignal) && (
            <p className="mt-3 text-xs text-neutral-600">
              {block.deadline && <>Deadline: {formatDate(block.deadline)}</>}
              {block.deadline && block.scarcitySignal && <> · </>}
              {block.scarcitySignal}
            </p>
          )}
        </div>
      );

    case "savings_projection":
      return (
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 lg:p-8">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 lg:text-2xl">
            {block.headline}
          </h2>
          <dl className="mt-5 divide-y divide-neutral-200">
            {block.rows.map((row, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <dt>
                  <p className="text-sm font-medium text-neutral-900">
                    {row.label}
                  </p>
                  {row.note && (
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {row.note}
                    </p>
                  )}
                </dt>
                <dd className="text-lg font-bold text-neutral-900">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {block.footnote && (
            <p className="mt-4 text-xs italic text-neutral-500">
              {block.footnote}
            </p>
          )}
        </section>
      );

    case "builder_facts":
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {block.facts.map((fact, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                {fact.label}
              </p>
              <p className="mt-2 text-2xl font-bold text-neutral-900">
                {fact.value}
              </p>
            </div>
          ))}
        </div>
      );

    case "phase_list":
      return (
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 lg:text-3xl">
            {block.heading}
          </h2>
          <div className="mt-6 space-y-4">
            {block.phases.map((phase, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-2xl bg-white p-5 ring-1 ring-neutral-200"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold text-neutral-900">
                      {phase.label}
                    </h3>
                    <PhaseStatusBadge status={phase.status} />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                    {phase.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      );

    case "faq_ref": {
      const publicEntries = filterPublic(FAQ_ENTRIES);
      const entries = block.entryIds
        .map((id) => publicEntries.find((e) => e.id === id))
        .filter(
          (e): e is (typeof publicEntries)[number] => e !== undefined
        );
      if (entries.length === 0) return null;
      return (
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 lg:text-3xl">
            {block.heading}
          </h2>
          <dl className="mt-6 space-y-6">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200 lg:p-6"
              >
                <dt className="text-lg font-semibold text-neutral-900">
                  {entry.question}
                </dt>
                <dd className="mt-2 text-base leading-relaxed text-neutral-700">
                  {entry.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      );
    }

    case "cta": {
      if (block.variant === "paste_link") {
        return (
          <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-200 lg:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">
              Start with a link
            </p>
            <h3 className="mt-2 text-2xl font-bold text-neutral-900 lg:text-3xl">
              {block.headline ?? "Paste any listing URL"}
            </h3>
            <p className="mt-3 text-base text-neutral-700">
              {block.body ??
                "Drop any builder listing URL and we'll have your free analysis in seconds."}
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center rounded-xl bg-accent-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-600"
            >
              {block.label ?? "Go to homepage →"}
            </Link>
          </div>
        );
      }
      if (block.variant === "savings_calculator") {
        return (
          <div className="rounded-2xl bg-gradient-to-br from-primary-700 to-primary-800 p-6 text-white shadow-lg lg:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">
              Try it yourself
            </p>
            <h3 className="mt-2 text-2xl font-bold lg:text-3xl">
              {block.headline ?? "See how much you could save"}
            </h3>
            <p className="mt-3 text-base text-primary-100">
              {block.body ??
                "Open the savings calculator and adjust the assumptions for your own deal. No signup required."}
            </p>
            <Link
              href="/savings"
              className="mt-5 inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary-800 transition hover:bg-primary-50"
            >
              {block.label ?? "Open savings calculator →"}
            </Link>
          </div>
        );
      }
      // custom variant
      return (
        <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-200 lg:p-8">
          {block.headline && (
            <h3 className="text-2xl font-bold text-neutral-900 lg:text-3xl">
              {block.headline}
            </h3>
          )}
          {block.body && (
            <p className="mt-3 text-base text-neutral-700">{block.body}</p>
          )}
          {block.href && (
            <Link
              href={block.href}
              className="mt-5 inline-flex items-center rounded-xl bg-primary-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-800"
            >
              {block.label ?? "Learn more →"}
            </Link>
          )}
        </div>
      );
    }

    default: {
      // Exhaustive check — new block kinds without a case fail typecheck here.
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

function PhaseStatusBadge({
  status,
}: {
  status: "sold_out" | "closing_soon" | "available" | "coming_soon";
}) {
  const styles: Record<typeof status, { label: string; classes: string }> = {
    sold_out: {
      label: "Sold out",
      classes: "bg-neutral-200 text-neutral-700",
    },
    closing_soon: {
      label: "Closing soon",
      classes: "bg-accent-100 text-accent-800",
    },
    available: {
      label: "Available",
      classes: "bg-secondary-100 text-secondary-800",
    },
    coming_soon: {
      label: "Coming soon",
      classes: "bg-primary-100 text-primary-800",
    },
  };
  const style = styles[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.classes}`}
    >
      {style.label}
    </span>
  );
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
