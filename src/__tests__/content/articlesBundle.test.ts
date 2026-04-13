import { describe, it, expect } from "vitest";
import { ARTICLES } from "@/content/articles";
import {
  publicArticles,
  validateArticle,
  findPublicArticleBySlug,
} from "@/lib/articles/selectors";

/**
 * Regression tests for the real article catalog shipping with
 * KIN-812. These guard against an editor accidentally breaking a
 * published article's metadata or leaving a draft flagged public.
 */

describe("ARTICLES catalog", () => {
  it("every article passes validation", () => {
    for (const article of ARTICLES) {
      const result = validateArticle(article);
      expect(
        result.ok,
        `article "${article.slug}" validation: ${
          result.ok ? "ok" : result.errors.join(", ")
        }`
      ).toBe(true);
    }
  });

  it("has at least one public article", () => {
    expect(publicArticles(ARTICLES).length).toBeGreaterThan(0);
  });

  it("has at least one internal draft (exercises the visibility filter)", () => {
    const drafts = ARTICLES.filter((a) => a.visibility === "internal");
    expect(drafts.length).toBeGreaterThan(0);
  });

  it("ids and slugs are unique", () => {
    const ids = new Set<string>();
    const slugs = new Set<string>();
    for (const article of ARTICLES) {
      expect(ids.has(article.id)).toBe(false);
      expect(slugs.has(article.slug)).toBe(false);
      ids.add(article.id);
      slugs.add(article.slug);
    }
  });

  it("draft slugs are NOT findable via public selector", () => {
    const drafts = ARTICLES.filter((a) => a.visibility === "internal");
    for (const draft of drafts) {
      expect(findPublicArticleBySlug(ARTICLES, draft.slug)).toBeUndefined();
    }
  });

  it("paste-a-link walkthrough article is published", () => {
    const article = findPublicArticleBySlug(ARTICLES, "paste-a-link-walkthrough");
    expect(article).toBeDefined();
    expect(article?.title).toMatch(/paste-a-link/i);
  });

  it("every public article has at least 3 body blocks", () => {
    for (const article of publicArticles(ARTICLES)) {
      expect(
        article.body.length,
        `article "${article.slug}" body length`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("every public article uses at least one heading block", () => {
    for (const article of publicArticles(ARTICLES)) {
      const hasHeading = article.body.some((b) => b.kind === "heading");
      expect(
        hasHeading,
        `article "${article.slug}" must have at least one heading`
      ).toBe(true);
    }
  });

  it("publishedAt ≤ updatedAt for every article", () => {
    for (const article of ARTICLES) {
      expect(article.publishedAt <= article.updatedAt).toBe(true);
    }
  });
});
