import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";
import { buildStructuredData } from "@/lib/seo/builder";
import { staticSeoInput } from "@/lib/seo/pageDefinitions";

/**
 * End-to-end JSON-LD test for /faq (KIN-1085).
 *
 * Verifies the FAQPage payload that ships in the page <head>:
 *   - one Question per public FAQ entry (hard internal-leakage guard)
 *   - per-entry deep-link `url` derived from the slug
 *   - top-level `inLanguage` and canonical `url`
 *
 * Snapshot/restore NEXT_PUBLIC_APP_URL the same way `builder.test.ts`
 * does so test ordering doesn't bleed env state.
 */

let previousSiteUrl: string | undefined;

beforeEach(() => {
  previousSiteUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://buyerv2.com";
});

afterEach(() => {
  if (previousSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = previousSiteUrl;
  }
});

describe("FAQ JSON-LD structured data", () => {
  function build() {
    const publicEntries = filterPublic(FAQ_ENTRIES);
    return {
      publicEntries,
      data: buildStructuredData(staticSeoInput("faq"), {
        faqEntries: publicEntries.map((e) => ({
          question: e.question,
          answer: e.answer,
          slug: e.id,
        })),
      }),
    };
  }

  it("emits one mainEntity per public FAQ entry (no internal leakage)", () => {
    const { publicEntries, data } = build();
    const mainEntity = data.mainEntity as Array<Record<string, unknown>>;
    expect(mainEntity).toHaveLength(publicEntries.length);
    expect(mainEntity).toHaveLength(18);
  });

  it("never includes internal-only questions in the JSON-LD payload", () => {
    const { data } = build();
    const mainEntity = data.mainEntity as Array<Record<string, unknown>>;
    for (const entity of mainEntity) {
      const name = entity.name as string;
      expect(name.startsWith("Internal:")).toBe(false);
    }
  });

  it("emits per-entry url derived from the entry slug", () => {
    const { publicEntries, data } = build();
    const mainEntity = data.mainEntity as Array<Record<string, unknown>>;
    publicEntries.forEach((entry, idx) => {
      expect(mainEntity[idx].url).toBe(
        `https://buyerv2.com/faq#${entry.id}`
      );
    });
  });

  it("declares inLanguage en-US at the top level", () => {
    const { data } = build();
    expect(data.inLanguage).toBe("en-US");
  });

  it("emits @type FAQPage", () => {
    const { data } = build();
    expect(data["@type"]).toBe("FAQPage");
  });

  it("emits the canonical url with no fragment", () => {
    const { data } = build();
    expect(data.url).toBe("https://buyerv2.com/faq");
  });
});
