/**
 * Pure selector helpers for the article catalog (KIN-812).
 *
 * Every route goes through these helpers — they handle visibility
 * filtering, sorting, and lookups. Keeping them pure means we can
 * unit-test every path without standing up a Next.js render.
 */

import type { Article, ArticleCategory } from "./types";

// MARK: - Visibility filter

/**
 * Return only articles that are publicly published. Matches the
 * `filterPublic` pattern from the shared content module — drafts
 * stay in the source file for review but never render on /blog.
 */
export function publicArticles(articles: readonly Article[]): Article[] {
  return articles.filter((a) => a.visibility === "public");
}

// MARK: - Sorting

/**
 * Sort articles newest-first by publishedAt. Used on the article
 * index page.
 */
export function sortArticlesNewestFirst(
  articles: readonly Article[]
): Article[] {
  return [...articles].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );
}

// MARK: - Lookups

/**
 * Find a public article by slug. Returns undefined for draft or
 * nonexistent articles so the route can call notFound().
 */
export function findPublicArticleBySlug(
  articles: readonly Article[],
  slug: string
): Article | undefined {
  return publicArticles(articles).find((a) => a.slug === slug);
}

/**
 * Group public articles by category in display order — buying_guide
 * first, then cities, then legal. Articles within a bucket stay in
 * newest-first order.
 */
export function groupArticlesByCategory(
  articles: readonly Article[]
): Array<{ category: ArticleCategory; articles: Article[] }> {
  const displayOrder: ArticleCategory[] = [
    "buying_guide",
    "market_insight",
    "closing_process",
    "florida_cities",
    "legal_compliance",
  ];
  const sorted = sortArticlesNewestFirst(publicArticles(articles));
  const buckets = new Map<ArticleCategory, Article[]>();
  for (const cat of displayOrder) buckets.set(cat, []);
  for (const article of sorted) {
    buckets.get(article.category)?.push(article);
  }
  return displayOrder
    .map((cat) => ({ category: cat, articles: buckets.get(cat) ?? [] }))
    .filter((group) => group.articles.length > 0);
}

// MARK: - Reading time

/**
 * Estimate reading time in minutes from article body blocks. Uses
 * a conservative 225 words/minute rate. Exposed so content authors
 * can backfill `readingMinutes` without hand-counting.
 */
export function estimateReadingMinutes(body: Article["body"]): number {
  let wordCount = 0;
  for (const block of body) {
    switch (block.kind) {
      case "paragraph":
        wordCount += wordsIn(block.text);
        break;
      case "heading":
        wordCount += wordsIn(block.text);
        break;
      case "list":
        for (const item of block.items) wordCount += wordsIn(item);
        break;
      case "quote":
        wordCount += wordsIn(block.text);
        if (block.attribution) wordCount += wordsIn(block.attribution);
        break;
      case "callout":
        wordCount += wordsIn(block.label) + wordsIn(block.body);
        break;
      case "image":
        if (block.caption) wordCount += wordsIn(block.caption);
        break;
      case "savings_calculator_cta":
      case "paste_link_cta":
      case "city_cross_link":
        // CTA blocks don't meaningfully contribute reading time
        break;
    }
  }
  return Math.max(1, Math.round(wordCount / 225));
}

function wordsIn(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// MARK: - Slug generation for headings

/**
 * Turn a heading into a URL-safe anchor slug. Used by the renderer
 * when a HeadingBlock doesn't supply an explicit anchor.
 */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// MARK: - Validation

/**
 * Basic article validation — used by the contentBundles test suite
 * to catch regressions where an article drops its publishedAt or
 * ships with zero body blocks.
 */
export type ArticleValidation =
  | { ok: true }
  | { ok: false; errors: string[] };

export function validateArticle(article: Article): ArticleValidation {
  const errors: string[] = [];

  if (!article.slug || !/^[a-z0-9][a-z0-9-]*$/.test(article.slug)) {
    errors.push(`invalid slug: "${article.slug}"`);
  }
  if (!article.title || article.title.length < 5) {
    errors.push(`title too short: "${article.title}"`);
  }
  if (!article.summary || article.summary.length < 50) {
    errors.push(
      `summary too short (${article.summary.length} < 50 chars) for SEO`
    );
  }
  if (article.body.length === 0) {
    errors.push("body must have at least one block");
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(article.publishedAt)) {
    errors.push(`publishedAt must be ISO-8601: "${article.publishedAt}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(article.updatedAt)) {
    errors.push(`updatedAt must be ISO-8601: "${article.updatedAt}"`);
  }
  if (article.readingMinutes < 1) {
    errors.push("readingMinutes must be ≥ 1");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
