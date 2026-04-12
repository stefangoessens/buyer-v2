import Link from "next/link";
import type {
  BuilderConfig,
  CommunityConfig,
} from "@/lib/newConstruction/types";
import { NewConstructionBlockRenderer } from "./NewConstructionBlockRenderer";

/**
 * Shared new-construction community landing page template (KIN-823).
 * Every `/new-construction/[slug]` route renders through this
 * template.
 *
 * Named `NewConstructionCommunityPageTemplate` to avoid collision
 * with the KIN-818 resale `CommunityPageTemplate` — the two are
 * semantically different surfaces.
 */
export function NewConstructionCommunityPageTemplate({
  community,
  parentBuilder,
}: {
  community: CommunityConfig;
  /**
   * Parent builder config, resolved by the route file. Used for
   * breadcrumb + footer CTA. Undefined if the parent builder is
   * in draft visibility (covered by `validateCatalog` only for
   * existence — draft parents are allowed since a draft builder
   * can still own a public community).
   */
  parentBuilder: BuilderConfig | undefined;
}) {
  return (
    <article>
      {/* Hero */}
      <section className="w-full bg-gradient-to-br from-primary-800 to-primary-900 py-16 text-white lg:py-20">
        <div className="mx-auto max-w-[1024px] px-6">
          {parentBuilder ? (
            <Link
              href={`/new-construction/builders/${parentBuilder.slug}`}
              className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-primary-200 hover:text-white"
            >
              ← Back to {parentBuilder.displayName}
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
            New construction · {community.cityName}, {community.state}
            {parentBuilder && <> · {parentBuilder.displayName}</>}
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
          <NewConstructionBlockRenderer blocks={community.blocks} />
        </div>
      </section>

      {/* Footer strip */}
      <section className="w-full bg-white py-10 ring-1 ring-neutral-200">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-4 px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-neutral-600">
            Community guide last updated {formatDate(community.lastUpdated)}
          </p>
          {parentBuilder && (
            <Link
              href={`/new-construction/builders/${parentBuilder.slug}`}
              className="inline-flex items-center text-sm font-semibold text-primary-700 hover:text-primary-900"
            >
              See the full {parentBuilder.displayName} guide →
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
