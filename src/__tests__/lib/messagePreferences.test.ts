import { describe, expect, it } from "vitest";
import {
  buildMessagePreferencesView,
  defaultPreferences,
  isChannelDeferredByQuietHours,
  isWithinQuietHours,
  mergePreferences,
  migrateLegacyPreferences,
  optOutAllChannels,
  shouldDeliver,
  validateQuietHours,
} from "@/lib/messagePreferences";

describe("messagePreferences", () => {
  it("maps legacy updates to market_updates without opting marketing in", () => {
    const migrated = migrateLegacyPreferences({
      channels: {
        email: true,
        sms: false,
        push: true,
        inApp: true,
      },
      categories: {
        transactional: true,
        tours: true,
        offers: true,
        updates: true,
        marketing: false,
      },
    });

    expect(migrated.matrix.market_updates.email).toBe(true);
    expect(migrated.matrix.market_updates.push).toBe(true);
    expect(migrated.matrix.marketing.email).toBe(false);
    expect(migrated.matrix.marketing.push).toBe(false);
  });

  it("keeps the safety row locked on during merges", () => {
    const merged = mergePreferences(defaultPreferences(), {
      matrix: {
        safety: {
          email: false,
          sms: false,
          push: false,
          inApp: false,
        },
      },
    });

    expect(merged.matrix.safety).toEqual({
      email: true,
      sms: true,
      push: true,
      inApp: true,
    });
  });

  it("global opt out preserves mandatory safety delivery", () => {
    const optedOut = optOutAllChannels(defaultPreferences());

    expect(optedOut.matrix.transactional.email).toBe(false);
    expect(optedOut.matrix.marketing.push).toBe(false);
    expect(optedOut.matrix.safety.email).toBe(true);
    expect(optedOut.matrix.safety.sms).toBe(true);
  });

  it("validates quiet-hours timezone and range", () => {
    expect(() =>
      validateQuietHours({
        enabled: true,
        startMinutes: 60,
        endMinutes: 60,
        timezone: "America/New_York",
      }),
    ).toThrow(/cannot be the same/);

    expect(() =>
      validateQuietHours({
        enabled: true,
        startMinutes: 60,
        endMinutes: 120,
        timezone: "Mars/Olympus",
      }),
    ).toThrow(/Unknown IANA timezone/);
  });

  it("handles overnight quiet-hours windows", () => {
    const prefs = mergePreferences(defaultPreferences(), {
      quietHours: {
        enabled: true,
        startMinutes: 21 * 60,
        endMinutes: 8 * 60,
        timezone: "America/New_York",
      },
    });

    expect(
      isWithinQuietHours(prefs.quietHours, new Date("2026-04-16T03:00:00.000Z")),
    ).toBe(true);
    expect(
      isWithinQuietHours(prefs.quietHours, new Date("2026-04-16T17:00:00.000Z")),
    ).toBe(false);
    expect(
      isChannelDeferredByQuietHours(
        prefs,
        "sms",
        "transactional",
        new Date("2026-04-16T03:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isChannelDeferredByQuietHours(
        prefs,
        "email",
        "transactional",
        new Date("2026-04-16T03:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isChannelDeferredByQuietHours(
        prefs,
        "push",
        "safety",
        new Date("2026-04-16T03:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("suppresses SMS delivery when STOP has globally opted the buyer out", () => {
    const view = buildMessagePreferencesView({
      hasStoredPreferences: true,
      preferences: defaultPreferences(),
      smsState: {
        consentStatus: "opted_out",
        isGloballySuppressed: true,
        reason: "sms_stop",
        phoneMissing: false,
        updatedAt: "2026-04-15T12:00:00.000Z",
      },
    });

    expect(view.effective.matrix.transactional.sms).toBe(false);
    expect(view.effective.matrix.safety.sms).toBe(true);
    expect(
      shouldDeliver(defaultPreferences(), "sms", "transactional", {
        smsState: view.effective.sms,
      }),
    ).toBe(false);
    expect(
      shouldDeliver(defaultPreferences(), "sms", "safety", {
        smsState: view.effective.sms,
      }),
    ).toBe(true);
  });
});
