import { describe, it, expect } from "vitest";
import {
  defaultPreferences,
  shouldDeliver,
  shouldAlwaysDeliverInApp,
  mergePreferences,
  optOutAllChannels,
  isGloballyOptedOut,
  MESSAGE_CATEGORIES,
  MESSAGE_CHANNELS,
  type MessagePreferences,
} from "@/lib/messagePreferences";

describe("defaultPreferences", () => {
  it("enables essential transactional channels", () => {
    const prefs = defaultPreferences();
    expect(prefs.channels.email).toBe(true);
    expect(prefs.channels.push).toBe(true);
    expect(prefs.channels.inApp).toBe(true);
  });

  it("disables SMS by default (opt-in only)", () => {
    expect(defaultPreferences().channels.sms).toBe(false);
  });

  it("enables day-to-day deal categories", () => {
    const prefs = defaultPreferences();
    expect(prefs.categories.transactional).toBe(true);
    expect(prefs.categories.tours).toBe(true);
    expect(prefs.categories.offers).toBe(true);
    expect(prefs.categories.updates).toBe(true);
  });

  it("disables marketing by default (CAN-SPAM/GDPR hygiene)", () => {
    expect(defaultPreferences().categories.marketing).toBe(false);
  });

  it("contains every declared channel and category key", () => {
    const prefs = defaultPreferences();
    for (const channel of MESSAGE_CHANNELS) {
      expect(typeof prefs.channels[channel]).toBe("boolean");
    }
    for (const category of MESSAGE_CATEGORIES) {
      expect(typeof prefs.categories[category]).toBe("boolean");
    }
  });
});

describe("shouldDeliver", () => {
  it("delivers when both channel and category are enabled", () => {
    const prefs = defaultPreferences();
    expect(shouldDeliver(prefs, "email", "transactional")).toBe(true);
    expect(shouldDeliver(prefs, "push", "tours")).toBe(true);
  });

  it("blocks when channel is disabled", () => {
    const prefs = defaultPreferences();
    expect(shouldDeliver(prefs, "sms", "transactional")).toBe(false);
  });

  it("blocks when category is disabled", () => {
    const prefs = defaultPreferences();
    expect(shouldDeliver(prefs, "email", "marketing")).toBe(false);
  });

  it("blocks when both channel and category are disabled", () => {
    const prefs = defaultPreferences();
    expect(shouldDeliver(prefs, "sms", "marketing")).toBe(false);
  });

  it("delivers marketing when the user has explicitly opted in", () => {
    const prefs = mergePreferences(defaultPreferences(), {
      categories: { marketing: true },
    });
    expect(shouldDeliver(prefs, "email", "marketing")).toBe(true);
  });
});

describe("shouldAlwaysDeliverInApp", () => {
  it("is true for transactional so audit trail is never muted", () => {
    expect(shouldAlwaysDeliverInApp("transactional")).toBe(true);
  });

  it("is false for all non-transactional categories", () => {
    expect(shouldAlwaysDeliverInApp("marketing")).toBe(false);
    expect(shouldAlwaysDeliverInApp("tours")).toBe(false);
    expect(shouldAlwaysDeliverInApp("offers")).toBe(false);
    expect(shouldAlwaysDeliverInApp("updates")).toBe(false);
  });
});

describe("mergePreferences", () => {
  it("returns a new object and does not mutate the existing prefs", () => {
    const existing = defaultPreferences();
    const snapshot = JSON.stringify(existing);
    const merged = mergePreferences(existing, {
      categories: { marketing: true },
    });
    expect(merged).not.toBe(existing);
    expect(JSON.stringify(existing)).toBe(snapshot);
    expect(merged.categories.marketing).toBe(true);
  });

  it("applies partial channel updates without touching unset channels", () => {
    const existing = defaultPreferences();
    const merged = mergePreferences(existing, {
      channels: { sms: true },
    });
    expect(merged.channels.sms).toBe(true);
    expect(merged.channels.email).toBe(true); // unchanged
    expect(merged.channels.push).toBe(true); // unchanged
  });

  it("applies partial category updates without touching unset categories", () => {
    const existing = defaultPreferences();
    const merged = mergePreferences(existing, {
      categories: { updates: false },
    });
    expect(merged.categories.updates).toBe(false);
    expect(merged.categories.transactional).toBe(true); // unchanged
  });

  it("handles an empty update object as a no-op", () => {
    const existing = defaultPreferences();
    const merged = mergePreferences(existing, {});
    expect(merged).toEqual(existing);
  });

  it("is commutative for independent partial updates", () => {
    const base = defaultPreferences();
    const a = mergePreferences(base, { channels: { sms: true } });
    const ab = mergePreferences(a, { categories: { marketing: true } });
    const b = mergePreferences(base, { categories: { marketing: true } });
    const ba = mergePreferences(b, { channels: { sms: true } });
    expect(ab).toEqual(ba);
  });
});

describe("optOutAllChannels", () => {
  it("disables every channel but preserves categories", () => {
    const existing = defaultPreferences();
    const opted = optOutAllChannels(existing);
    expect(opted.channels.email).toBe(false);
    expect(opted.channels.sms).toBe(false);
    expect(opted.channels.push).toBe(false);
    expect(opted.channels.inApp).toBe(false);
    expect(opted.categories).toEqual(existing.categories);
  });

  it("does not mutate the existing prefs", () => {
    const existing = defaultPreferences();
    const snapshot = JSON.stringify(existing);
    optOutAllChannels(existing);
    expect(JSON.stringify(existing)).toBe(snapshot);
  });
});

describe("isGloballyOptedOut", () => {
  it("is false for default preferences", () => {
    expect(isGloballyOptedOut(defaultPreferences())).toBe(false);
  });

  it("is true when every channel is disabled", () => {
    const prefs = optOutAllChannels(defaultPreferences());
    expect(isGloballyOptedOut(prefs)).toBe(true);
  });

  it("is false if any single channel remains enabled", () => {
    const prefs: MessagePreferences = {
      channels: { email: false, sms: false, push: false, inApp: true },
      categories: defaultPreferences().categories,
    };
    expect(isGloballyOptedOut(prefs)).toBe(false);
  });
});
