import { describe, it, expect } from "vitest";
import { generateMetadata } from "@/app/(marketing)/legal/[slug]/page";

/**
 * Regression test for the codex finding on PR #49: unknown legal
 * slugs must NOT be indexed. The page calls `notFound()` but
 * `generateMetadata` runs first — if its fallback returns
 * `visibility: "public"`, the 404 page would emit `index,follow`
 * meta tags, letting Googlebot index stray `/legal/<wrong-slug>`
 * variants.
 *
 * Known slugs (terms, privacy, brokerage-disclosures) must remain
 * indexable — we only want the noindex guard to apply to unknown
 * slugs.
 */

describe("legal [slug] generateMetadata (codex PR #49 regression)", () => {
  it("known slug 'terms' is indexable", async () => {
    const md = await generateMetadata({
      params: Promise.resolve({ slug: "terms" }),
    });
    expect(md.robots).toMatchObject({ index: true, follow: true });
  });

  it("known slug 'privacy' is indexable", async () => {
    const md = await generateMetadata({
      params: Promise.resolve({ slug: "privacy" }),
    });
    expect(md.robots).toMatchObject({ index: true, follow: true });
  });

  it("known slug 'brokerage-disclosures' is indexable", async () => {
    const md = await generateMetadata({
      params: Promise.resolve({ slug: "brokerage-disclosures" }),
    });
    expect(md.robots).toMatchObject({ index: true, follow: true });
  });

  it("unknown slug is NOT indexable (noindex,nofollow)", async () => {
    const md = await generateMetadata({
      params: Promise.resolve({ slug: "this-does-not-exist" }),
    });
    expect(md.robots).toMatchObject({ index: false, follow: false });
  });

  it("unknown slug returns a 'Not found' title", async () => {
    const md = await generateMetadata({
      params: Promise.resolve({ slug: "bogus" }),
    });
    // Title goes through the builder's template → "Not found | buyer-v2"
    expect(md.title).toMatch(/Not found/);
  });
});
