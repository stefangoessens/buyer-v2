import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sitemap from "@/app/sitemap";
import { ARTICLES } from "@/content/articles";
import { publicArticles } from "@/lib/articles/selectors";
import { LOCATION_CATALOG } from "@/content/locations";
import {
  publicCities,
  publicCommunities,
} from "@/lib/locations/selectors";
import { NEW_CONSTRUCTION_CATALOG } from "@/content/newConstruction";
import {
  publicBuilders,
  publicCommunities as publicNewConstructionCommunities,
} from "@/lib/newConstruction/selectors";

let prevSiteUrl: string | undefined;

beforeEach(() => {
  prevSiteUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://buyerv2.com";
});

afterEach(() => {
  if (prevSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = prevSiteUrl;
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
    expect(urls).not.toContain("https://buyerv2.com/intake");
    expect(urls).not.toContain("https://buyerv2.com/dashboard");
    expect(urls).not.toContain("https://buyerv2.com/compare");
    expect(urls).not.toContain("https://buyerv2.com/favourites");
    expect(urls).not.toContain("https://buyerv2.com/profile");
    expect(urls).not.toContain("https://buyerv2.com/reports");
    expect(urls).not.toContain("https://buyerv2.com/console");
    expect(urls).not.toContain("https://buyerv2.com/property");
    expect(urls).not.toContain("https://buyerv2.com/dealroom");
  });
});

/**
 * KIN-818 — programmatic city/community page generator adds one
 * sitemap entry per public city and community. Draft cities and
 * draft communities must stay out of the sitemap.
 */
describe("sitemap — KIN-818 location entries", () => {
  it("includes one entry per public city", () => {
    const urls = sitemap().map((e) => e.url);
    for (const city of publicCities(LOCATION_CATALOG)) {
      expect(urls).toContain(`https://buyerv2.com/cities/${city.slug}`);
    }
  });

  it("does NOT include draft cities", () => {
    const urls = sitemap().map((e) => e.url);
    const drafts = LOCATION_CATALOG.cities.filter(
      (c) => c.visibility === "draft"
    );
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(urls).not.toContain(`https://buyerv2.com/cities/${draft.slug}`);
    }
  });

  it("includes one entry per public community", () => {
    const urls = sitemap().map((e) => e.url);
    for (const community of publicCommunities(LOCATION_CATALOG)) {
      expect(urls).toContain(
        `https://buyerv2.com/communities/${community.slug}`
      );
    }
  });

  it("does NOT include draft communities", () => {
    const urls = sitemap().map((e) => e.url);
    const drafts = LOCATION_CATALOG.communities.filter(
      (c) => c.visibility === "draft"
    );
    for (const draft of drafts) {
      expect(urls).not.toContain(
        `https://buyerv2.com/communities/${draft.slug}`
      );
    }
  });

  it("uses city.lastUpdated as lastModified for city entries", () => {
    const entries = sitemap();
    for (const city of publicCities(LOCATION_CATALOG)) {
      const entry = entries.find(
        (e) => e.url === `https://buyerv2.com/cities/${city.slug}`
      );
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toBe(city.lastUpdated);
    }
  });

  it("uses community.lastUpdated as lastModified for community entries", () => {
    const entries = sitemap();
    for (const community of publicCommunities(LOCATION_CATALOG)) {
      const entry = entries.find(
        (e) => e.url === `https://buyerv2.com/communities/${community.slug}`
      );
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toBe(community.lastUpdated);
    }
  });
});

/**
 * KIN-823 — new-construction landing template system adds one
 * sitemap entry per public builder and new-construction community.
 * Draft records must stay out of the sitemap.
 */
describe("sitemap — KIN-823 new-construction entries", () => {
  it("includes one entry per public builder", () => {
    const urls = sitemap().map((e) => e.url);
    for (const builder of publicBuilders(NEW_CONSTRUCTION_CATALOG)) {
      expect(urls).toContain(
        `https://buyerv2.com/new-construction/builders/${builder.slug}`
      );
    }
  });

  it("does NOT include draft builders", () => {
    const urls = sitemap().map((e) => e.url);
    const drafts = NEW_CONSTRUCTION_CATALOG.builders.filter(
      (b) => b.visibility === "draft"
    );
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(urls).not.toContain(
        `https://buyerv2.com/new-construction/builders/${draft.slug}`
      );
    }
  });

  it("includes one entry per public new-construction community", () => {
    const urls = sitemap().map((e) => e.url);
    for (const community of publicNewConstructionCommunities(
      NEW_CONSTRUCTION_CATALOG
    )) {
      expect(urls).toContain(
        `https://buyerv2.com/new-construction/${community.slug}`
      );
    }
  });

  it("does NOT include draft new-construction communities", () => {
    const urls = sitemap().map((e) => e.url);
    const drafts = NEW_CONSTRUCTION_CATALOG.communities.filter(
      (c) => c.visibility === "draft"
    );
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(urls).not.toContain(
        `https://buyerv2.com/new-construction/${draft.slug}`
      );
    }
  });

  it("uses builder.lastUpdated for builder entry lastModified", () => {
    const entries = sitemap();
    for (const builder of publicBuilders(NEW_CONSTRUCTION_CATALOG)) {
      const entry = entries.find(
        (e) =>
          e.url ===
          `https://buyerv2.com/new-construction/builders/${builder.slug}`
      );
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toBe(builder.lastUpdated);
    }
  });

  it("uses community.lastUpdated for new-construction community entries", () => {
    const entries = sitemap();
    for (const community of publicNewConstructionCommunities(
      NEW_CONSTRUCTION_CATALOG
    )) {
      const entry = entries.find(
        (e) =>
          e.url === `https://buyerv2.com/new-construction/${community.slug}`
      );
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toBe(community.lastUpdated);
    }
  });
});
