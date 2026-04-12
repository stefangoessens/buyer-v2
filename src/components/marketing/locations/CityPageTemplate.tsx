import Link from "next/link";
import type {
  CityPageConfig,
  LocationBlock,
  LocationCatalog,
} from "@/lib/locations/types";
import { resolveCommunityRefs } from "@/lib/locations/selectors";
import { LocationBlockRenderer } from "./LocationBlockRenderer";

/**
 * Shared city landing page template (KIN-818). Every `/cities/[slug]`
 * route renders through this template — the route file only looks up
 * the config by slug and passes it here along with the catalog.
 *
 * The template resolves any `NeighborhoodListBlock` community slugs
 * against the catalog and renders each block individually so the
 * renderer stays catalog-free and the resolved list is scoped to
 * exactly one block at a time.
 */
export function CityPageTemplate({
  city,
  catalog,
}: {
  city: CityPageConfig;
  catalog: LocationCatalog;
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
            {city.state} · City guide
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight lg:text-5xl">
            {city.heroHeadline}
          </h1>
          <p className="mt-5 max-w-[680px] text-lg text-primary-100">
            {city.heroSubheadline}
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="w-full bg-neutral-50 py-12 lg:py-16">
        <div className="mx-auto max-w-[1024px] px-6">
          <BlocksSection blocks={city.blocks} catalog={catalog} />
        </div>
      </section>

      {/* Footer strip */}
      <section className="w-full bg-white py-10 ring-1 ring-neutral-200">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-4 px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-neutral-600">
            City guide last updated {formatDate(city.lastUpdated)}
          </p>
          <Link
            href="/"
            className="inline-flex items-center text-sm font-semibold text-primary-700 hover:text-primary-900"
          >
            Paste a {city.displayName} listing →
          </Link>
        </div>
      </section>
    </article>
  );
}

/**
 * Walks the block list and renders each one, resolving neighborhood
 * refs against the catalog per-block. Keeping this in the template
 * (not the renderer) means the renderer never depends on the catalog
 * and can be tested against raw block fixtures.
 */
function BlocksSection({
  blocks,
  catalog,
}: {
  blocks: readonly LocationBlock[];
  catalog: LocationCatalog;
}) {
  return (
    <div className="space-y-10 lg:space-y-14">
      {blocks.map((block, index) => {
        const resolved =
          block.kind === "neighborhood_list"
            ? resolveCommunityRefs(catalog, block.communitySlugs)
            : [];
        return (
          <LocationBlockRenderer
            key={index}
            blocks={[block]}
            resolvedNeighborhoods={resolved}
          />
        );
      })}
    </div>
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
