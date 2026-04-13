import Link from "next/link";
import type { Article } from "@/lib/articles/types";
import { ARTICLE_CATEGORY_LABELS } from "@/lib/articles/types";
import { ArticleRenderer } from "./ArticleRenderer";

/**
 * Shared article page template. Hero + byline + body + footer.
 * Every article route renders through this template — the only
 * thing a route owns is looking up the `Article` record by slug.
 */
export function ArticleTemplate({ article }: { article: Article }) {
  return (
    <article>
      {/* Hero */}
      <section className="w-full bg-gradient-to-br from-primary-800 to-primary-900 py-16 text-white lg:py-20">
        <div className="mx-auto max-w-[848px] px-6">
          <Link
            href="/blog"
            className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-primary-200 hover:text-white"
          >
            ← Back to articles
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary-200">
            {ARTICLE_CATEGORY_LABELS[article.category]}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight lg:text-5xl">
            {article.title}
          </h1>
          <p className="mt-5 text-lg text-primary-100">{article.summary}</p>

          <ArticleByline article={article} />
        </div>
      </section>

      {/* Optional cover image */}
      {article.coverImage && (
        <section className="w-full bg-neutral-50">
          <div className="mx-auto max-w-[1048px] px-6 pt-10">
            <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-neutral-200 shadow-lg">
              <img
                src={article.coverImage.src}
                alt={article.coverImage.alt}
                className="h-full w-full object-cover"
                loading="eager"
              />
            </div>
          </div>
        </section>
      )}

      {/* Body */}
      <section className="w-full bg-neutral-50 py-12 lg:py-16">
        <div className="mx-auto max-w-[848px] px-6">
          <ArticleRenderer body={article.body} />
        </div>
      </section>

      {/* Footer */}
      <section className="w-full bg-white py-12 ring-1 ring-neutral-200 lg:py-16">
        <div className="mx-auto max-w-[848px] px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-neutral-600">
              Published {formatDate(article.publishedAt)}
              {article.publishedAt !== article.updatedAt && (
                <> · Updated {formatDate(article.updatedAt)}</>
              )}
              {" · "}
              {article.readingMinutes} min read
            </p>
            <Link
              href="/blog"
              className="inline-flex items-center text-sm font-semibold text-primary-700 hover:text-primary-900"
            >
              Back to all articles →
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}

function ArticleByline({ article }: { article: Article }) {
  return (
    <div className="mt-8 flex items-center gap-4">
      {article.author.avatarUrl ? (
        <img
          src={article.author.avatarUrl}
          alt={article.author.name}
          className="size-12 rounded-full bg-white/10 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white">
          {article.author.name.charAt(0)}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-white">
          {article.author.name}
        </p>
        <p className="text-xs text-primary-200">
          {formatDate(article.publishedAt)} · {article.readingMinutes} min read
        </p>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  // Keep display deterministic regardless of server locale
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
