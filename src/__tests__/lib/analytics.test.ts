import { describe, it, expect } from "vitest";
import { track, trackFunnelStep } from "@/lib/analytics";

describe("track", () => {
  it("does not throw when PostHog is not loaded", () => {
    expect(() => track("link_pasted", { url: "https://zillow.com/123" })).not.toThrow();
  });

  it("strips PII from properties", () => {
    expect(() =>
      track("registration_completed", {
        email: "test@example.com",
        name: "John Doe",
      })
    ).not.toThrow();
  });

  it("handles undefined properties", () => {
    expect(() => track("teaser_viewed")).not.toThrow();
  });
});

describe("trackFunnelStep", () => {
  it("does not throw", () => {
    expect(() =>
      trackFunnelStep("link_pasted", "acquisition", 1, { source: "homepage" })
    ).not.toThrow();
  });

  it("handles missing optional properties", () => {
    expect(() =>
      trackFunnelStep("deal_room_entered", "conversion", 3)
    ).not.toThrow();
  });
});
