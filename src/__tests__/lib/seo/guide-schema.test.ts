import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildGuideArticleSchema } from "@/lib/seo/builder";

/**
 * Unit tests for `buildGuideArticleSchema` (KIN-1090).
 *
 * Guarantees the guide Article JSON-LD payload renders with all
 * the fields Google requires for rich-result eligibility and that
 * the canonical URL always points at `/guides/${slug}`.
 */

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

describe("buildGuideArticleSchema", () => {
  it("returns a schema.org Article with required fields", () => {
    const schema = buildGuideArticleSchema({
      title: "Florida Homestead Exemption: A First-Time Owner's Guide",
      summary:
        "What the Florida homestead exemption actually does to your tax bill, who qualifies, and how to file before March 1.",
      slug: "florida-homestead-exemption",
      datePublished: "2026-04-15",
    });

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Article");
    expect(schema.headline).toBe(
      "Florida Homestead Exemption: A First-Time Owner's Guide",
    );
    expect(schema.description).toMatch(
      /homestead exemption actually does/i,
    );
  });

  it("builds the canonical URL from the site origin and slug", () => {
    const schema = buildGuideArticleSchema({
      title: "t",
      summary: "s",
      slug: "florida-buyer-rebate-explained",
      datePublished: "2026-04-15",
    });
    expect(schema.url).toBe(
      "https://buyerv2.com/guides/florida-buyer-rebate-explained",
    );

    const mainEntity = schema.mainEntityOfPage as Record<string, unknown>;
    expect(mainEntity).toBeDefined();
    expect(mainEntity["@type"]).toBe("WebPage");
    expect(mainEntity["@id"]).toBe(
      "https://buyerv2.com/guides/florida-buyer-rebate-explained",
    );
  });

  it("emits datePublished and dateModified when datePublished is set", () => {
    const schema = buildGuideArticleSchema({
      title: "t",
      summary: "s",
      slug: "florida-homestead-exemption",
      datePublished: "2026-04-15",
      dateModified: "2026-05-01",
    });
    expect(schema.datePublished).toBe("2026-04-15");
    expect(schema.dateModified).toBe("2026-05-01");
  });

  it("defaults dateModified to datePublished when not provided", () => {
    const schema = buildGuideArticleSchema({
      title: "t",
      summary: "s",
      slug: "florida-homestead-exemption",
      datePublished: "2026-04-15",
    });
    expect(schema.dateModified).toBe("2026-04-15");
  });

  it("omits date fields when datePublished is an empty string", () => {
    const schema = buildGuideArticleSchema({
      title: "t",
      summary: "s",
      slug: "florida-homestead-exemption",
      datePublished: "",
    });
    expect(schema.datePublished).toBeUndefined();
    expect(schema.dateModified).toBeUndefined();
  });

  it("emits author and publisher as buyer-v2 Organization", () => {
    const schema = buildGuideArticleSchema({
      title: "t",
      summary: "s",
      slug: "florida-homestead-exemption",
      datePublished: "2026-04-15",
    });
    const author = schema.author as Record<string, unknown>;
    expect(author["@type"]).toBe("Organization");
    expect(author.name).toBe("buyer-v2");

    const publisher = schema.publisher as Record<string, unknown>;
    expect(publisher["@type"]).toBe("Organization");
    expect(publisher.name).toBe("buyer-v2");
  });

  it("emits ISO-8601 duration when readingTimeMinutes is provided", () => {
    const schema = buildGuideArticleSchema({
      title: "t",
      summary: "s",
      slug: "florida-homestead-exemption",
      datePublished: "2026-04-15",
      readingTimeMinutes: 9,
    });
    expect(schema.timeRequired).toBe("PT9M");
  });

  it("emits articleSection when category is provided", () => {
    const schema = buildGuideArticleSchema({
      title: "t",
      summary: "s",
      slug: "florida-homestead-exemption",
      datePublished: "2026-04-15",
      category: "homestead",
    });
    expect(schema.articleSection).toBe("homestead");
  });

  it("omits optional fields when not provided", () => {
    const schema = buildGuideArticleSchema({
      title: "t",
      summary: "s",
      slug: "florida-homestead-exemption",
      datePublished: "2026-04-15",
    });
    expect(schema.timeRequired).toBeUndefined();
    expect(schema.articleSection).toBeUndefined();
  });
});
