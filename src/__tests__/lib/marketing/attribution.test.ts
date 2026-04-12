import { describe, it, expect } from "vitest";
import {
  parseUtmParams,
  inferSourceFromReferrer,
  isDistinctTouch,
  SEARCH_ENGINE_HOSTS,
  SOCIAL_HOSTS,
  type Touch,
} from "@/lib/marketing/attribution";

// ───────────────────────────────────────────────────────────────────────────
// Test helpers
// ───────────────────────────────────────────────────────────────────────────

const T = "2026-04-12T00:00:00.000Z";
const LANDING = "/florida/miami";

function baseTouch(overrides: Partial<Touch> = {}): Touch {
  return {
    source: "direct",
    medium: "none",
    landingPage: LANDING,
    timestamp: T,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// inferSourceFromReferrer — fallback inference
// ───────────────────────────────────────────────────────────────────────────

describe("inferSourceFromReferrer — missing and direct traffic", () => {
  it("returns direct / none when referrer is undefined", () => {
    const res = inferSourceFromReferrer(undefined);
    expect(res).toEqual({ source: "direct", medium: "none" });
  });

  it("returns direct / none when referrer is an empty string", () => {
    const res = inferSourceFromReferrer("");
    expect(res).toEqual({ source: "direct", medium: "none" });
  });

  it("returns direct / none when referrer is whitespace", () => {
    const res = inferSourceFromReferrer("   ");
    expect(res).toEqual({ source: "direct", medium: "none" });
  });

  it("returns direct / none when referrer is malformed", () => {
    // URL constructor throws for this kind of junk.
    const res = inferSourceFromReferrer(":::not a url:::");
    expect(res).toEqual({ source: "direct", medium: "none" });
  });
});

describe("inferSourceFromReferrer — search engines", () => {
  it("classifies google.com as organic/google", () => {
    const res = inferSourceFromReferrer("https://www.google.com/search?q=buyer");
    expect(res).toEqual({ source: "google", medium: "organic" });
  });

  it("classifies duckduckgo.com as organic/duckduckgo", () => {
    const res = inferSourceFromReferrer("https://duckduckgo.com/?q=hosman");
    expect(res).toEqual({ source: "duckduckgo", medium: "organic" });
  });

  it("classifies subdomain news.google.com as organic/google", () => {
    const res = inferSourceFromReferrer("https://news.google.com/articles/xyz");
    expect(res).toEqual({ source: "google", medium: "organic" });
  });

  it("classifies every host in SEARCH_ENGINE_HOSTS as organic", () => {
    for (const host of SEARCH_ENGINE_HOSTS) {
      const res = inferSourceFromReferrer(`https://${host}/`);
      expect(res.medium).toBe("organic");
    }
  });
});

describe("inferSourceFromReferrer — social hosts", () => {
  it("classifies facebook.com as social/facebook", () => {
    const res = inferSourceFromReferrer("https://facebook.com/share/abc");
    expect(res).toEqual({ source: "facebook", medium: "social" });
  });

  it("classifies x.com as social/x", () => {
    const res = inferSourceFromReferrer("https://x.com/anthropic/status/123");
    expect(res).toEqual({ source: "x", medium: "social" });
  });

  it("classifies m.facebook.com (subdomain) as social/facebook", () => {
    const res = inferSourceFromReferrer("https://m.facebook.com/share/abc");
    expect(res).toEqual({ source: "facebook", medium: "social" });
  });

  it("classifies every host in SOCIAL_HOSTS as social", () => {
    for (const host of SOCIAL_HOSTS) {
      const res = inferSourceFromReferrer(`https://${host}/`);
      expect(res.medium).toBe("social");
    }
  });
});

describe("inferSourceFromReferrer — unknown referrers", () => {
  it("classifies an unknown host as referral with the raw hostname", () => {
    const res = inferSourceFromReferrer("https://someblog.example/post/1");
    expect(res).toEqual({ source: "someblog.example", medium: "referral" });
  });

  it("strips www. from unknown referral hosts", () => {
    const res = inferSourceFromReferrer("https://www.someblog.example/post/1");
    expect(res).toEqual({ source: "someblog.example", medium: "referral" });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// parseUtmParams — UTM precedence
// ───────────────────────────────────────────────────────────────────────────

describe("parseUtmParams — direct traffic (no UTMs, no referrer)", () => {
  it("produces a direct/none touch when nothing is present", () => {
    const touch = parseUtmParams({ landingPage: LANDING, timestamp: T });
    expect(touch).toEqual({
      source: "direct",
      medium: "none",
      landingPage: LANDING,
      timestamp: T,
    });
  });

  it("omits optional fields when not supplied", () => {
    const touch = parseUtmParams({ landingPage: LANDING, timestamp: T });
    expect(touch.campaign).toBeUndefined();
    expect(touch.content).toBeUndefined();
    expect(touch.term).toBeUndefined();
    expect(touch.referrer).toBeUndefined();
  });

  it("defaults timestamp to now when not provided", () => {
    const touch = parseUtmParams({ landingPage: LANDING });
    // ISO 8601 parse check — if this throws, the timestamp is broken.
    const parsed = new Date(touch.timestamp);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });
});

describe("parseUtmParams — UTM-driven touches", () => {
  it("uses utm_source + utm_medium when both present", () => {
    const touch = parseUtmParams({
      utm_source: "newsletter",
      utm_medium: "email",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.source).toBe("newsletter");
    expect(touch.medium).toBe("email");
  });

  it("defaults medium to 'unknown' when utm_source is present without utm_medium", () => {
    const touch = parseUtmParams({
      utm_source: "partner_portal",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.source).toBe("partner_portal");
    expect(touch.medium).toBe("unknown");
  });

  it("propagates utm_campaign, utm_content, utm_term onto the touch", () => {
    const touch = parseUtmParams({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "spring_launch",
      utm_content: "hero_cta",
      utm_term: "florida buyer agent",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.campaign).toBe("spring_launch");
    expect(touch.content).toBe("hero_cta");
    expect(touch.term).toBe("florida buyer agent");
  });

  it("UTM source beats a known search referrer", () => {
    // Even if the user arrived from Google, a paid campaign utm_source
    // should win — that's the marketer's explicit signal.
    const touch = parseUtmParams({
      utm_source: "google",
      utm_medium: "cpc",
      referrer: "https://www.google.com/search?q=xyz",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.source).toBe("google");
    expect(touch.medium).toBe("cpc");
  });

  it("treats empty-string utm_source as absent and falls back to referrer", () => {
    const touch = parseUtmParams({
      utm_source: "",
      utm_medium: "cpc",
      referrer: "https://www.google.com/search?q=xyz",
      landingPage: LANDING,
      timestamp: T,
    });
    // Empty utm_source → falls back to referrer inference.
    expect(touch.source).toBe("google");
    expect(touch.medium).toBe("organic");
  });

  it("trims whitespace from UTM values", () => {
    const touch = parseUtmParams({
      utm_source: "  newsletter  ",
      utm_medium: "  email  ",
      utm_campaign: "  spring  ",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.source).toBe("newsletter");
    expect(touch.medium).toBe("email");
    expect(touch.campaign).toBe("spring");
  });

  it("treats whitespace-only UTM campaign as absent", () => {
    const touch = parseUtmParams({
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "   ",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.campaign).toBeUndefined();
  });

  it("persists the raw referrer string on the touch when present", () => {
    const touch = parseUtmParams({
      referrer: "https://example.com/page",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.referrer).toBe("https://example.com/page");
  });
});

describe("parseUtmParams — referrer fallback", () => {
  it("infers google/organic when referrer is google.com and no UTM", () => {
    const touch = parseUtmParams({
      referrer: "https://www.google.com/search?q=xyz",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.source).toBe("google");
    expect(touch.medium).toBe("organic");
  });

  it("infers facebook/social when referrer is facebook.com and no UTM", () => {
    const touch = parseUtmParams({
      referrer: "https://www.facebook.com/share/xyz",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.source).toBe("facebook");
    expect(touch.medium).toBe("social");
  });

  it("classifies unknown referrer as referral with raw host", () => {
    const touch = parseUtmParams({
      referrer: "https://somepartner.io/article",
      landingPage: LANDING,
      timestamp: T,
    });
    expect(touch.source).toBe("somepartner.io");
    expect(touch.medium).toBe("referral");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// isDistinctTouch — touch-update decision
// ───────────────────────────────────────────────────────────────────────────

describe("isDistinctTouch", () => {
  it("returns false when source, medium, and campaign all match", () => {
    const prev = baseTouch({ source: "google", medium: "cpc", campaign: "spring" });
    const next = baseTouch({ source: "google", medium: "cpc", campaign: "spring" });
    expect(isDistinctTouch(prev, next)).toBe(false);
  });

  it("returns true when source differs", () => {
    const prev = baseTouch({ source: "google", medium: "cpc" });
    const next = baseTouch({ source: "facebook", medium: "cpc" });
    expect(isDistinctTouch(prev, next)).toBe(true);
  });

  it("returns true when medium differs", () => {
    const prev = baseTouch({ source: "google", medium: "cpc" });
    const next = baseTouch({ source: "google", medium: "organic" });
    expect(isDistinctTouch(prev, next)).toBe(true);
  });

  it("returns true when campaign differs", () => {
    const prev = baseTouch({ source: "google", medium: "cpc", campaign: "spring" });
    const next = baseTouch({ source: "google", medium: "cpc", campaign: "summer" });
    expect(isDistinctTouch(prev, next)).toBe(true);
  });

  it("returns false when campaign is absent on both", () => {
    const prev = baseTouch({ source: "google", medium: "organic" });
    const next = baseTouch({ source: "google", medium: "organic" });
    expect(isDistinctTouch(prev, next)).toBe(false);
  });

  it("returns true when campaign is present on one side only", () => {
    const prev = baseTouch({ source: "google", medium: "cpc" });
    const next = baseTouch({ source: "google", medium: "cpc", campaign: "spring" });
    expect(isDistinctTouch(prev, next)).toBe(true);
  });

  it("ignores landing page differences — same campaign on different pages is one touch", () => {
    const prev = baseTouch({
      source: "google",
      medium: "cpc",
      campaign: "spring",
      landingPage: "/florida/miami",
    });
    const next = baseTouch({
      source: "google",
      medium: "cpc",
      campaign: "spring",
      landingPage: "/florida/tampa",
    });
    expect(isDistinctTouch(prev, next)).toBe(false);
  });

  it("ignores referrer differences — same source/medium from different urls is one touch", () => {
    const prev = baseTouch({
      source: "google",
      medium: "organic",
      referrer: "https://www.google.com/search?q=xyz",
    });
    const next = baseTouch({
      source: "google",
      medium: "organic",
      referrer: "https://www.google.com/search?q=abc",
    });
    expect(isDistinctTouch(prev, next)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// End-to-end acceptance — direct, campaign, and missing attribution paths
// ───────────────────────────────────────────────────────────────────────────

describe("acceptance — direct path", () => {
  it("direct-first + direct-second = single touch, no update needed", () => {
    const first = parseUtmParams({ landingPage: "/", timestamp: T });
    const second = parseUtmParams({ landingPage: "/florida", timestamp: T });
    expect(first.source).toBe("direct");
    expect(second.source).toBe("direct");
    expect(isDistinctTouch(first, second)).toBe(false);
  });
});

describe("acceptance — campaign path", () => {
  it("organic-first + cpc-campaign-second = two distinct touches", () => {
    const first = parseUtmParams({
      referrer: "https://www.google.com/search?q=florida+buyer",
      landingPage: "/",
      timestamp: T,
    });
    const second = parseUtmParams({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "spring_launch",
      landingPage: "/florida",
      timestamp: T,
    });

    expect(first.source).toBe("google");
    expect(first.medium).toBe("organic");
    expect(second.source).toBe("google");
    expect(second.medium).toBe("cpc");
    // Same source, different medium → distinct.
    expect(isDistinctTouch(first, second)).toBe(true);
  });
});

describe("acceptance — missing attribution path", () => {
  it("no UTMs + no referrer + only landing page = direct/none touch", () => {
    const touch = parseUtmParams({ landingPage: "/", timestamp: T });
    expect(touch).toMatchObject({
      source: "direct",
      medium: "none",
      landingPage: "/",
      timestamp: T,
    });
    expect(touch.campaign).toBeUndefined();
    expect(touch.content).toBeUndefined();
    expect(touch.term).toBeUndefined();
    expect(touch.referrer).toBeUndefined();
  });
});
