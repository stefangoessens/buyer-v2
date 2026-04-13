import { describe, expect, it } from "vitest";
import { parseUtmParams } from "@/lib/marketing/attribution";
import {
  appendLeadAttributionTouch,
  buildLeadAttributionReadModel,
  convertLeadAttribution,
  createAnonymousLeadAttribution,
  createSyntheticRegisteredLeadAttribution,
  handoffLeadAttribution,
} from "@/lib/leadAttribution/logic";

const T1 = "2026-04-12T12:00:00.000Z";
const T2 = "2026-04-12T12:05:00.000Z";
const T3 = "2026-04-12T12:15:00.000Z";

describe("acceptance — direct path", () => {
  it("persists direct first-touch attribution through registration and conversion", () => {
    const firstTouch = parseUtmParams({
      landingPage: "/",
      timestamp: T1,
    });

    const anonymous = createAnonymousLeadAttribution(
      "sess_direct",
      firstTouch,
      T1
    );
    const revisited = appendLeadAttributionTouch(
      anonymous,
      parseUtmParams({
        landingPage: "/faq",
        timestamp: T2,
      }),
      T2
    );
    const registered = handoffLeadAttribution(revisited, "user_direct", T2);
    const converted = convertLeadAttribution(registered, T3);

    expect(converted).not.toBeNull();
    const model = buildLeadAttributionReadModel(converted!);

    expect(model.status).toBe("converted");
    expect(model.source).toBe("direct");
    expect(model.medium).toBe("none");
    expect(model.landingPage).toBe("/");
    expect(model.touchCount).toBe(1);
    expect(model.registeredAt).toBe(T2);
    expect(model.convertedAt).toBe(T3);
    expect(model.lastTouchContext.landingPage).toBe("/");
  });
});

describe("acceptance — campaign path", () => {
  it("keeps campaign first-touch attribution after handoff while tracking later touches", () => {
    const firstTouch = parseUtmParams({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "spring_launch",
      landingPage: "/miami",
      timestamp: T1,
    });

    const anonymous = createAnonymousLeadAttribution(
      "sess_campaign",
      firstTouch,
      T1
    );
    const updated = appendLeadAttributionTouch(
      anonymous,
      parseUtmParams({
        referrer: "https://www.google.com/search?q=miami+buyer",
        landingPage: "/pricing",
        timestamp: T2,
      }),
      T2
    );
    const registered = handoffLeadAttribution(updated, "user_campaign", T2);
    const model = buildLeadAttributionReadModel(registered);

    expect(model.status).toBe("registered");
    expect(model.touchCount).toBe(2);
    expect(model.source).toBe("google");
    expect(model.medium).toBe("cpc");
    expect(model.campaign).toBe("spring_launch");
    expect(model.landingPage).toBe("/miami");
    expect(model.firstTouchContext.campaign).toBe("spring_launch");
    expect(model.lastTouchContext.medium).toBe("organic");
    expect(model.lastTouchContext.landingPage).toBe("/pricing");
  });
});

describe("acceptance — missing attribution path", () => {
  it("creates a synthetic direct attribution row when registration has no prior touch", () => {
    const synthetic = createSyntheticRegisteredLeadAttribution(
      "sess_missing",
      "user_missing",
      T1
    );
    const model = buildLeadAttributionReadModel(synthetic);

    expect(model.status).toBe("registered");
    expect(model.source).toBe("direct");
    expect(model.medium).toBe("none");
    expect(model.campaign).toBeUndefined();
    expect(model.landingPage).toBe("/");
    expect(model.touchCount).toBe(1);
    expect(model.firstTouchOccurredAt).toBe(T1);
    expect(model.registeredAt).toBe(T1);
    expect(model.convertedAt).toBeUndefined();
  });
});
