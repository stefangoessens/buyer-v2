import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sitemap from "@/app/sitemap";
import { ARTICLES } from "@/content/articles";
import { publicArticles } from "@/lib/articles/selectors";

let prevSiteUrl: string | undefined;

beforeEach(() => {
  prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://buyerv2.com";
});

afterEach(() => {
  if (prevSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl;
  }
});

/**
 * Regression tests for codex P2 finding on PR #51: the sitemap
 * only included `/blog` but not individual article slugs, so public
 * article detail pages were invisible to search crawlers.
 */
describe("sitemap — KIN-812 regression", () => {
  it("includes /blog index", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://buyerv2.com/blog");
  });

  it("includes one entry per public article", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    for (const article of publicArticles(ARTICLES)) {
      expect(urls).toContain(`https://buyerv2.com/blog/${article.slug}`);
    }
  });

  it("does not include draft/internal articles", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    const drafts = ARTICLES.filter((a) => a.visibility === "internal");
    for (const draft of drafts) {
      expect(urls).not.toContain(`https://buyerv2.com/blog/${draft.slug}`);
    }
  });

  it("uses article.updatedAt as lastModified for each blog post", () => {
    const entries = sitemap();
    for (const article of publicArticles(ARTICLES)) {
      const entry = entries.find(
        (e) => e.url === `https://buyerv2.com/blog/${article.slug}`
      );
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toBe(article.updatedAt);
    }
  });

  it("includes the static marketing routes alongside articles", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://buyerv2.com/");
    expect(urls).toContain("https://buyerv2.com/pricing");
    expect(urls).toContain("https://buyerv2.com/faq");
    expect(urls).toContain("https://buyerv2.com/savings");
    expect(urls).toContain("https://buyerv2.com/legal/terms");
    expect(urls).toContain("https://buyerv2.com/legal/privacy");
    expect(urls).toContain("https://buyerv2.com/legal/brokerage-disclosures");
  });

  it("does NOT include gated/private routes", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).not.toContain("https://buyerv2.com/dashboard");
    expect(urls).not.toContain("https://buyerv2.com/console");
    expect(urls).not.toContain("https://buyerv2.com/property");
  });
});
