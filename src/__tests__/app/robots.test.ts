import { afterEach, beforeEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";

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

describe("robots.txt", () => {
  it("references the canonical sitemap and host", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://buyerv2.com/sitemap.xml");
    expect(result.host).toBe("https://buyerv2.com");
  });

  it("disallows representative gated and private route prefixes", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = Array.isArray(rule?.disallow)
      ? rule.disallow
      : [rule?.disallow].filter(Boolean);

    expect(disallow).toEqual(
      expect.arrayContaining([
        "/intake",
        "/dashboard",
        "/compare",
        "/favourites",
        "/profile",
        "/reports",
        "/property",
        "/dealroom",
        "/console",
        "/metrics",
        "/notes",
        "/overrides",
        "/preview",
        "/queues",
        "/settings",
      ])
    );
  });

  it("does not disallow supported public marketing routes", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = Array.isArray(rule?.disallow)
      ? rule.disallow
      : [rule?.disallow].filter(Boolean);

    expect(disallow).not.toContain("/");
    expect(disallow).not.toContain("/pricing");
    expect(disallow).not.toContain("/savings");
    expect(disallow).not.toContain("/faq");
    expect(disallow).not.toContain("/blog");
  });
});
