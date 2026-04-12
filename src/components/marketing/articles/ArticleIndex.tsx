import Link from "next/link";
import type { Article } from "@/lib/articles/types";
import { ARTICLE_CATEGORY_LABELS } from "@/lib/articles/types";
import { groupArticlesByCategory } from "@/lib/articles/selectors";

/**
 * Article index — groups public articles by category and renders a
 * card per article. Used on the `/blog` route.
 */
export function ArticleIndex({ articles }: { articles: readonly Article[] }) {
  const groups = groupArticlesByCategory(articles);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-neutral-200">
        <p className="text-sm text-neutral-600">
          No articles published yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {groups.map(({ category, articles: bucket }) => (
        <section key={category}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-primary-700">
            {ARTICLE_CATEGORY_LABELS[category]}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
            {bucket.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      className="group block overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 transition hover:ring-primary-500"
    >
      {article.coverImage && (
        <div className="relative aspect-[16/9] overflow-hidden bg-neutral-100">
          <img
            src={article.coverImage.src}
            alt={article.coverImage.alt}
            className="h-full w-full object-cover transition group-hover:scale-105"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-5 lg:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
          {ARTICLE_CATEGORY_LABELS[article.category]}
        </p>
        <h3 className="mt-2 text-xl font-bold text-neutral-900">
          {article.title}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm text-neutral-600">
          {article.summary}
        </p>
        <p className="mt-4 text-xs text-neutral-500">
          {article.author.name} · {article.readingMinutes} min read
        </p>
      </div>
    </Link>
  );
}
