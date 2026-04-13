import Link from "next/link";
import type {
  LocationBlock,
  CommunityPageConfig,
} from "@/lib/locations/types";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";
import { CASE_STUDIES } from "@/content/trustProof";
import { labelCase } from "@/lib/trustProof/policy";
import type { CaseStudy } from "@/lib/trustProof/types";

/**
 * Renderer for the typed `LocationBlock` discriminated union used by
 * city and community landing pages (KIN-818). The switch is exhaustive
 * — the `never` fallback blocks compile when a new block kind is added
 * to the type without a matching case here.
 *
 * Blocks that reference other catalogs (FAQ, trust-proof, communities)
 * resolve them here so the route pages stay thin — they only need to
 * pass the block list and the resolved community list.
 */
export function LocationBlockRenderer({
  blocks,
  resolvedNeighborhoods,
}: {
  blocks: readonly LocationBlock[];
  /**
   * Resolved public community configs for any `NeighborhoodListBlock`
   * entries. Passed in by the template so the renderer doesn't take
   * a direct dependency on the catalog module.
   */
  resolvedNeighborhoods: readonly CommunityPageConfig[];
}) {
  return (
    <div className="space-y-10 lg:space-y-14">
      {blocks.map((block, i) => (
        <BlockRenderer
          key={i}
          block={block}
          resolvedNeighborhoods={resolvedNeighborhoods}
        />
      ))}
    </div>
  );
}

function BlockRenderer({
  block,
  resolvedNeighborhoods,
}: {
  block: LocationBlock;
  resolvedNeighborhoods: readonly CommunityPageConfig[];
}) {
  switch (block.kind) {
    case "hero_paragraph":
      return (
        <p className="text-lg leading-relaxed text-neutral-800 lg:text-xl">
          {block.text}
        </p>
      );

    case "key_stats":
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {block.stats.map((stat, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                {stat.label}
              </p>
              <p className="mt-2 text-3xl font-bold text-neutral-900">
                {stat.value}
              </p>
              {stat.note && (
                <p className="mt-2 text-xs text-neutral-500">{stat.note}</p>
              )}
            </div>
          ))}
        </div>
      );

    case "faq_ref": {
      // Resolve public FAQ entries by id. Missing or non-public ids
      // are silently dropped — content authors can safely reference
      // entries that are still in draft.
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
                "Drop a Zillow, Redfin, or Realtor.com link and we'll have your free analysis in seconds."}
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

    case "neighborhood_list": {
      if (resolvedNeighborhoods.length === 0) return null;
      return (
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 lg:text-3xl">
            {block.heading}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {resolvedNeighborhoods.map((community) => (
              <Link
                key={community.slug}
                href={`/communities/${community.slug}`}
                className="block rounded-2xl bg-white p-5 ring-1 ring-neutral-200 transition hover:ring-primary-500"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                  Neighborhood
                </p>
                <h3 className="mt-1 text-lg font-semibold text-neutral-900">
                  {community.displayName}
                </h3>
                <p className="mt-2 text-sm text-neutral-600">
                  {community.heroSubheadline}
                </p>
              </Link>
            ))}
          </div>
        </section>
      );
    }

    case "market_snapshot":
      return (
        <section className="rounded-2xl border-l-4 border-primary-500 bg-primary-50/40 p-6 lg:p-8">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 lg:text-2xl">
            {block.heading}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-neutral-800">
            {block.body}
          </p>
          <p className="mt-4 text-xs text-neutral-600">
            {block.source && <>{block.source} · </>}Refreshed{" "}
            {formatDate(block.refreshedAt)}
          </p>
        </section>
      );

    case "testimonial_ref": {
      // Resolve public case studies; labelCase applies the
      // illustrative label for pre-revenue records.
      const publicStudies = CASE_STUDIES.filter(
        (c): c is CaseStudy => c.visibility === "public"
      );
      const resolved = block.caseStudyIds
        .map((id) => publicStudies.find((c) => c.id === id))
        .filter((c): c is CaseStudy => c !== undefined)
        .map((c) => labelCase(c));
      if (resolved.length === 0) return null;
      return (
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 lg:text-3xl">
            {block.heading}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {resolved.map((entry) => (
              <figure
                key={entry.case.id}
                className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200 lg:p-6"
              >
                {entry.isIllustrative && entry.label && (
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider text-accent-700"
                    aria-label={entry.ariaLabel ?? entry.label}
                  >
                    {entry.label}
                  </p>
                )}
                <h3 className="mt-2 text-lg font-semibold text-neutral-900">
                  {entry.case.headline}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                  {entry.case.summary}
                </p>
                {entry.case.buyer && (
                  <figcaption className="mt-3 text-xs text-neutral-500">
                    — {entry.case.buyer.displayName}
                    {entry.case.buyer.location && (
                      <>, {entry.case.buyer.location}</>
                    )}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      );
    }

    default: {
      // Exhaustive check — adding a new block kind without a case
      // will fail typecheck here.
      const _exhaustive: never = block;
      return _exhaustive;
    }
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
