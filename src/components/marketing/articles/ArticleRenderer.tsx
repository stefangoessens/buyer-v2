import Link from "next/link";
import type { ArticleBlock } from "@/lib/articles/types";
import { slugifyHeading } from "@/lib/articles/selectors";

/**
 * Renders a typed ArticleBlock list into JSX. Every block kind has
 * a corresponding renderer below — switch is exhaustive, and the
 * `never` fallback catches unhandled kinds at compile time.
 *
 * The renderer intentionally owns no layout — the calling template
 * wraps it in its prose column.
 */
export function ArticleRenderer({ body }: { body: readonly ArticleBlock[] }) {
  return (
    <div className="space-y-6">
      {body.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: ArticleBlock }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p
          className={
            block.lede
              ? "text-lg leading-relaxed text-neutral-800 lg:text-xl"
              : "text-base leading-relaxed text-neutral-800"
          }
        >
          {block.text}
        </p>
      );

    case "heading": {
      const anchor = block.anchor ?? slugifyHeading(block.text);
      if (block.level === 2) {
        return (
          <h2
            id={anchor}
            className="mt-4 scroll-mt-20 text-2xl font-bold tracking-tight text-neutral-900 lg:text-3xl"
          >
            {block.text}
          </h2>
        );
      }
      return (
        <h3
          id={anchor}
          className="mt-2 scroll-mt-20 text-xl font-semibold tracking-tight text-neutral-900 lg:text-2xl"
        >
          {block.text}
        </h3>
      );
    }

    case "list": {
      if (block.style === "numbered") {
        return (
          <ol className="ml-5 list-decimal space-y-2 text-base text-neutral-800">
            {block.items.map((item, i) => (
              <li key={i} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="ml-5 list-disc space-y-2 text-base text-neutral-800">
          {block.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
    }

    case "quote":
      return (
        <blockquote className="border-l-4 border-primary-500 bg-primary-50/40 p-5 lg:p-6">
          <p className="text-lg italic leading-relaxed text-neutral-800">
            “{block.text}”
          </p>
          {block.attribution && (
            <p className="mt-2 text-sm font-medium text-neutral-600">
              {block.attribution}
            </p>
          )}
        </blockquote>
      );

    case "callout": {
      const variantClass =
        block.variant === "strong"
          ? "border-l-4 border-accent-500 bg-accent-50"
          : block.variant === "emphasis"
            ? "border-l-4 border-primary-500 bg-primary-50/60"
            : "border-l-4 border-neutral-300 bg-white ring-1 ring-neutral-200";
      return (
        <div className={`rounded-r-lg p-5 ${variantClass}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
            {block.label}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-800">
            {block.body}
          </p>
        </div>
      );
    }

    case "image":
      return (
        <figure>
          <div
            className={
              "relative overflow-hidden rounded-2xl bg-neutral-100 " +
              (block.aspect === "tall"
                ? "aspect-[4/5]"
                : block.aspect === "square"
                  ? "aspect-square"
                  : "aspect-[16/9]")
            }
          >
            {/* Use a plain img — Next/Image requires remote domain config. */}
            <img
              src={block.src}
              alt={block.alt}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          {block.caption && (
            <figcaption className="mt-2 text-center text-sm italic text-neutral-600">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "savings_calculator_cta":
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
            Open savings calculator →
          </Link>
        </div>
      );

    case "paste_link_cta":
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
            Go to homepage →
          </Link>
        </div>
      );

    case "city_cross_link":
      return (
        <Link
          href={block.href}
          className="block rounded-2xl bg-white p-5 ring-1 ring-neutral-200 transition hover:ring-primary-500"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
            Buying in {block.cityName}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-900">
            See our {block.cityName} guide →
          </h3>
          <p className="mt-1.5 text-sm text-neutral-600">{block.description}</p>
        </Link>
      );

    default: {
      // Exhaustive check — adding a new block kind without a case will fail typecheck here.
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}
