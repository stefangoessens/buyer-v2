import Link from "next/link";
import type {
  CityPageConfig,
  CommunityPageConfig,
} from "@/lib/locations/types";
import { LocationBlockRenderer } from "./LocationBlockRenderer";

/**
 * Shared community (neighborhood) landing page template (KIN-818).
 * Every `/communities/[slug]` route renders through this template.
 *
 * Communities never render `neighborhood_list` blocks (nesting is
 * one level deep — a neighborhood doesn't contain other
 * neighborhoods), so `resolvedNeighborhoods` is always empty here.
 */
export function CommunityPageTemplate({
  community,
  parentCity,
}: {
  community: CommunityPageConfig;
  /**
   * The parent city config, resolved by the route file. Used for the
   * "Back to {city}" breadcrumb and the trailing CTA.
   */
  parentCity: CityPageConfig | undefined;
}) {
  return (
    <article>
      {/* Hero */}
      <section className="w-full bg-gradient-to-br from-primary-800 to-primary-900 py-16 text-white lg:py-20">
        <div className="mx-auto max-w-[1024px] px-6">
          {parentCity ? (
            <Link
              href={`/cities/${parentCity.slug}`}
              className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-primary-200 hover:text-white"
            >
              ← Back to {parentCity.displayName}
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-primary-200 hover:text-white"
            >
              ← Back to buyer-v2
            </Link>
          )}
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary-200">
            Neighborhood guide
            {parentCity && <> · {parentCity.displayName}</>}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight lg:text-5xl">
            {community.heroHeadline}
          </h1>
          <p className="mt-5 max-w-[680px] text-lg text-primary-100">
            {community.heroSubheadline}
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="w-full bg-neutral-50 py-12 lg:py-16">
        <div className="mx-auto max-w-[1024px] px-6">
          <LocationBlockRenderer
            blocks={community.blocks}
            resolvedNeighborhoods={[]}
          />
        </div>
      </section>

      {/* Footer strip */}
      <section className="w-full bg-white py-10 ring-1 ring-neutral-200">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-4 px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-neutral-600">
            Neighborhood guide last updated {formatDate(community.lastUpdated)}
          </p>
          {parentCity && (
            <Link
              href={`/cities/${parentCity.slug}`}
              className="inline-flex items-center text-sm font-semibold text-primary-700 hover:text-primary-900"
            >
              See the full {parentCity.displayName} guide →
            </Link>
          )}
        </div>
      </section>
    </article>
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
