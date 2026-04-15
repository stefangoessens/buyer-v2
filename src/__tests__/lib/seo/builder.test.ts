import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildCanonicalUrl,
  buildMetadata,
  buildStructuredData,
  getSiteOrigin,
  robotsFor,
  validateSeoInput,
} from "@/lib/seo/builder";
import type { SeoInput } from "@/lib/seo/types";

// Snapshot + restore NEXT_PUBLIC_APP_URL so tests don't bleed.
let previousSiteUrl: string | undefined;

beforeEach(() => {
  previousSiteUrl = process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  if (previousSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = previousSiteUrl;
  }
});

function makeInput(overrides: Partial<SeoInput> = {}): SeoInput {
  return {
    title: "Pricing",
    description:
      "Learn how buyer-v2's commission rebate model works for Florida buyers.",
    path: "/pricing",
    visibility: "public",
    kind: "marketing",
    ...overrides,
  };
}

// MARK: - getSiteOrigin

describe("getSiteOrigin", () => {
  it("returns the env var when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.buyerv2.com";
    expect(getSiteOrigin()).toBe("https://staging.buyerv2.com");
  });

  it("strips trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://buyerv2.com/";
    expect(getSiteOrigin()).toBe("https://buyerv2.com");
  });

  it("falls back to default when env var missing", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getSiteOrigin()).toBe("http://localhost:3000");
  });
});

// MARK: - buildCanonicalUrl

describe("buildCanonicalUrl", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://buyerv2.com";
  });

  it("builds absolute URL from path", () => {
    expect(buildCanonicalUrl(makeInput())).toBe("https://buyerv2.com/pricing");
  });

  it("strips query string from canonical", () => {
    const url = buildCanonicalUrl(makeInput({ path: "/pricing?utm_source=x" }));
    expect(url).toBe("https://buyerv2.com/pricing");
  });

  it("strips fragment from canonical", () => {
    const url = buildCanonicalUrl(makeInput({ path: "/pricing#section" }));
    expect(url).toBe("https://buyerv2.com/pricing");
  });

  it("strips BOTH query and fragment", () => {
    const url = buildCanonicalUrl(
      makeInput({ path: "/faq?tab=1#q2" })
    );
    expect(url).toBe("https://buyerv2.com/faq");
  });

  it("adds leading slash when missing", () => {
    const url = buildCanonicalUrl(makeInput({ path: "pricing" }));
    expect(url).toBe("https://buyerv2.com/pricing");
  });

  it("respects absolute canonicalOverride", () => {
    const url = buildCanonicalUrl(
      makeInput({
        path: "/old-path",
        canonicalOverride: "https://buyerv2.com/new-canonical",
      })
    );
    expect(url).toBe("https://buyerv2.com/new-canonical");
  });

  it("treats path-like canonicalOverride as relative", () => {
    const url = buildCanonicalUrl(
      makeInput({
        path: "/original",
        canonicalOverride: "/new",
      })
    );
    expect(url).toBe("https://buyerv2.com/new");
  });

  it("uses the site origin from env var", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.buyerv2.com";
    expect(buildCanonicalUrl(makeInput())).toBe(
      "https://staging.buyerv2.com/pricing"
    );
  });
});

// MARK: - robotsFor

describe("robotsFor", () => {
  it("public → index + follow", () => {
    expect(robotsFor("public")).toEqual({ index: true, follow: true });
  });

  it("gated → noindex + nofollow", () => {
    expect(robotsFor("gated")).toEqual({ index: false, follow: false });
  });

  it("private → noindex + nofollow", () => {
    expect(robotsFor("private")).toEqual({ index: false, follow: false });
  });
});

// MARK: - validateSeoInput

describe("validateSeoInput", () => {
  it("passes with valid input", () => {
    expect(validateSeoInput(makeInput())).toEqual({ ok: true });
  });

  it("fails with empty title", () => {
    const result = validateSeoInput(makeInput({ title: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/title/);
  });

  it("fails with overly long title", () => {
    const result = validateSeoInput(makeInput({ title: "x".repeat(80) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/title is too long/);
  });

  it("fails with too-short description", () => {
    const result = validateSeoInput(makeInput({ description: "too short" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/description is too short/);
  });

  it("fails with too-long description", () => {
    const result = validateSeoInput(
      makeInput({ description: "x".repeat(301) })
    );
    expect(result.ok).toBe(false);
  });

  it("fails with path missing leading slash", () => {
    const result = validateSeoInput(makeInput({ path: "pricing" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("path"))).toBe(true);
    }
  });

  it("fails with invalid lastModified format", () => {
    const result = validateSeoInput(
      makeInput({ lastModified: "last tuesday" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("lastModified"))).toBe(true);
    }
  });

  it("passes with valid ISO lastModified", () => {
    expect(
      validateSeoInput(makeInput({ lastModified: "2026-04-01" }))
    ).toEqual({ ok: true });
  });

  it("collects multiple errors at once", () => {
    const result = validateSeoInput(
      makeInput({ title: "", description: "x", path: "no-slash" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// MARK: - buildMetadata

describe("buildMetadata", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://buyerv2.com";
  });

  it("builds a complete Metadata object for a public marketing page", () => {
    const md = buildMetadata(makeInput());
    expect(md.title).toBe("Pricing | buyer-v2");
    expect(md.description).toContain("buyer-v2");
    expect(md.alternates?.canonical).toBe("https://buyerv2.com/pricing");
    // Robots: public = index + follow
    expect(md.robots).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("applies noindex to gated routes", () => {
    const md = buildMetadata(
      makeInput({
        path: "/dashboard",
        visibility: "gated",
        kind: "product",
        title: "Dashboard",
      })
    );
    expect(md.robots).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("applies noindex to private routes", () => {
    const md = buildMetadata(
      makeInput({
        path: "/console",
        visibility: "private",
        kind: "product",
        title: "Console",
      })
    );
    expect(md.robots).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("emits OpenGraph with canonical URL", () => {
    const md = buildMetadata(makeInput());
    expect(md.openGraph).toMatchObject({
      title: "Pricing",
      url: "https://buyerv2.com/pricing",
      siteName: "buyer-v2",
      type: "website",
    });
  });

  it("emits OpenGraph type=article for article kind", () => {
    const md = buildMetadata(
      makeInput({
        kind: "article",
        path: "/blog/first-post",
        lastModified: "2026-04-01",
      })
    );
    // Narrow via a runtime cast — OpenGraph is a discriminated union
    // on `type`, and TypeScript can't know which variant we got until
    // runtime. The builder sets `article` for article kind.
    const og = md.openGraph as { type?: string } | undefined;
    expect(og?.type).toBe("article");
  });

  it("emits Twitter summary_large_image card", () => {
    const md = buildMetadata(makeInput());
    expect(md.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Pricing",
    });
  });

  it("uses social override when provided", () => {
    const md = buildMetadata(
      makeInput({
        social: {
          title: "Custom OG",
          description: "Custom OG description for social sharing.",
          imageUrl: "https://buyerv2.com/og-custom.png",
          imageAlt: "Custom alt",
        },
      })
    );
    expect(md.openGraph?.title).toBe("Custom OG");
    expect(md.twitter?.title).toBe("Custom OG");
  });

  it("falls back to default OG image when social.imageUrl missing", () => {
    const md = buildMetadata(makeInput());
    const images = md.openGraph?.images as
      | Array<{ url: string; alt: string }>
      | undefined;
    expect(images?.[0].url).toBe("https://buyerv2.com/og-default.png");
  });
});

// MARK: - buildStructuredData

describe("buildStructuredData", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://buyerv2.com";
  });

  it("emits WebPage for marketing kind", () => {
    const data = buildStructuredData(makeInput());
    expect(data["@type"]).toBe("WebPage");
    expect(data.url).toBe("https://buyerv2.com/pricing");
  });

  it("emits FAQPage with mainEntity list", () => {
    const data = buildStructuredData(
      makeInput({ kind: "faq", path: "/faq" }),
      {
        faqEntries: [
          { question: "Q1?", answer: "A1" },
          { question: "Q2?", answer: "A2" },
        ],
      }
    );
    expect(data["@type"]).toBe("FAQPage");
    expect(data.inLanguage).toBe("en-US");
    const mainEntity = data.mainEntity as Array<Record<string, unknown>>;
    expect(mainEntity).toHaveLength(2);
    expect((mainEntity[0] as Record<string, unknown>).name).toBe("Q1?");
    // Backwards compat: no slug supplied → no url field on the entry.
    expect((mainEntity[0] as Record<string, unknown>).url).toBeUndefined();
  });

  it("emits FAQPage with per-entry url when slug provided", () => {
    const data = buildStructuredData(
      makeInput({ kind: "faq", path: "/faq" }),
      {
        faqEntries: [
          { question: "Q1?", answer: "A1", slug: "q-one" },
          { question: "Q2?", answer: "A2", slug: "q-two" },
        ],
      }
    );
    expect(data["@type"]).toBe("FAQPage");
    expect(data.inLanguage).toBe("en-US");
    const mainEntity = data.mainEntity as Array<Record<string, unknown>>;
    expect(mainEntity).toHaveLength(2);
    expect(mainEntity[0].url).toBe("https://buyerv2.com/faq#q-one");
    expect(mainEntity[1].url).toBe("https://buyerv2.com/faq#q-two");
  });

  it("emits Article with datePublished for article kind", () => {
    const data = buildStructuredData(
      makeInput({
        kind: "article",
        path: "/blog/first",
        lastModified: "2026-04-01",
      })
    );
    expect(data["@type"]).toBe("Article");
    expect(data.datePublished).toBe("2026-04-01");
    expect(data.dateModified).toBe("2026-04-01");
  });

  it("emits WebPage with dateModified for legal kind", () => {
    const data = buildStructuredData(
      makeInput({
        kind: "legal",
        path: "/legal/terms",
        lastModified: "2026-04-01",
        title: "Terms",
      })
    );
    expect(data["@type"]).toBe("WebPage");
    expect(data.dateModified).toBe("2026-04-01");
  });

  it("uses custom author for article", () => {
    const data = buildStructuredData(
      makeInput({ kind: "article", path: "/blog/post" }),
      { articleAuthor: "Jane Buyer" }
    );
    const author = data.author as Record<string, unknown>;
    expect(author.name).toBe("Jane Buyer");
  });

  // Codex PR #51 regression — publishedAt vs lastModified split

  it("Article JSON-LD uses publishedAt for datePublished", () => {
    const data = buildStructuredData(
      makeInput({
        kind: "article",
        path: "/blog/x",
        publishedAt: "2026-03-01",
        lastModified: "2026-04-10",
      })
    );
    expect(data.datePublished).toBe("2026-03-01");
    expect(data.dateModified).toBe("2026-04-10");
  });

  it("Article JSON-LD falls back to lastModified when publishedAt missing", () => {
    const data = buildStructuredData(
      makeInput({
        kind: "article",
        path: "/blog/x",
        lastModified: "2026-04-10",
      })
    );
    expect(data.datePublished).toBe("2026-04-10");
    expect(data.dateModified).toBe("2026-04-10");
  });

  it("Article JSON-LD omits date fields when neither is supplied", () => {
    const data = buildStructuredData(
      makeInput({ kind: "article", path: "/blog/x" })
    );
    expect(data.datePublished).toBeUndefined();
    expect(data.dateModified).toBeUndefined();
  });
});

describe("buildMetadata article time fields (codex PR #51 regression)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://buyerv2.com";
  });

  it("sets publishedTime from publishedAt, modifiedTime from lastModified", () => {
    const md = buildMetadata(
      makeInput({
        kind: "article",
        path: "/blog/x",
        publishedAt: "2026-03-01",
        lastModified: "2026-04-10",
      })
    );
    const og = md.openGraph as
      | { publishedTime?: string; modifiedTime?: string }
      | undefined;
    expect(og?.publishedTime).toBe("2026-03-01");
    expect(og?.modifiedTime).toBe("2026-04-10");
  });

  it("non-article pages do not get publishedTime/modifiedTime", () => {
    const md = buildMetadata(
      makeInput({
        kind: "marketing",
        path: "/pricing",
        publishedAt: "2026-03-01",
        lastModified: "2026-04-10",
      })
    );
    const og = md.openGraph as
      | { publishedTime?: string; modifiedTime?: string }
      | undefined;
    expect(og?.publishedTime).toBeUndefined();
    expect(og?.modifiedTime).toBeUndefined();
  });
});
