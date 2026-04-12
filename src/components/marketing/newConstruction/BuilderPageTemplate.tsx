import Link from "next/link";
import type {
  BuilderConfig,
  CommunityConfig,
} from "@/lib/newConstruction/types";
import { NewConstructionBlockRenderer } from "./NewConstructionBlockRenderer";

/**
 * Shared builder landing page template (KIN-823). Every
 * `/new-construction/builders/[slug]` route renders through this
 * template — the route file only looks up the builder by slug and
 * passes it along with the builder's communities for the grid.
 */
export function BuilderPageTemplate({
  builder,
  communities,
}: {
  builder: BuilderConfig;
  /** Public communities owned by this builder, for the grid. */
  communities: readonly CommunityConfig[];
}) {
  return (
    <article>
      {/* Hero */}
      <section className="w-full bg-gradient-to-br from-primary-800 to-primary-900 py-16 text-white lg:py-20">
        <div className="mx-auto max-w-[1024px] px-6">
          <Link
            href="/"
            className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-primary-200 hover:text-white"
          >
            ← Back to buyer-v2
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary-200">
            New construction · Builder
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight lg:text-5xl">
            {builder.heroHeadline}
          </h1>
          <p className="mt-5 max-w-[680px] text-lg text-primary-100">
            {builder.heroSubheadline}
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="w-full bg-neutral-50 py-12 lg:py-16">
        <div className="mx-auto max-w-[1024px] px-6">
          <NewConstructionBlockRenderer blocks={builder.blocks} />
        </div>
      </section>

      {/* Communities grid */}
      {communities.length > 0 && (
        <section className="w-full bg-white py-12 ring-1 ring-neutral-200 lg:py-16">
          <div className="mx-auto max-w-[1024px] px-6">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900 lg:text-3xl">
              {builder.displayName} communities we cover
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {communities.map((community) => (
                <Link
                  key={community.slug}
                  href={`/new-construction/${community.slug}`}
                  className="block rounded-2xl bg-neutral-50 p-5 ring-1 ring-neutral-200 transition hover:ring-primary-500"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                    {community.cityName}, {community.state}
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
          </div>
        </section>
      )}

      {/* Footer strip */}
      <section className="w-full bg-white py-10 ring-1 ring-neutral-200">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-4 px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-neutral-600">
            Builder guide last updated {formatDate(builder.lastUpdated)}
          </p>
          <Link
            href="/"
            className="inline-flex items-center text-sm font-semibold text-primary-700 hover:text-primary-900"
          >
            Paste a {builder.displayName} listing →
          </Link>
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
