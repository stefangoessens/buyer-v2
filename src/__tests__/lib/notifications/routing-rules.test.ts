import { describe, expect, it } from "vitest";
import {
  compareNotificationRoutingRules,
  getNotificationRoutingRule,
  isExternalNotificationChannel,
  NOTIFICATION_ROUTING_RULES,
} from "@/lib/notifications/routing-rules";

describe("notification routing rules", () => {
  it("exposes the current canonical buyer-update rules", () => {
    const tourConfirmed = getNotificationRoutingRule("tour_confirmed");
    const newCompArrived = getNotificationRoutingRule("new_comp_arrived");

    expect(tourConfirmed).toMatchObject({
      category: "tours",
      urgency: "transactional_must_deliver",
      templateKey: "tour_confirmed",
    });
    expect(tourConfirmed?.preferredChannels).toEqual([
      "in_app",
      "push",
      "sms",
      "email",
    ]);

    expect(newCompArrived).toMatchObject({
      category: "market_updates",
      urgency: "relationship",
      templateKey: "new_comp_arrived",
    });
    expect(newCompArrived?.preferredChannels.filter(isExternalNotificationChannel))
      .toEqual(["email"]);
  });

  it("treats the safety escalation routes as server-side bypasses", () => {
    const rule = getNotificationRoutingRule("safety_broker_escalation");

    expect(rule).not.toBeNull();
    expect(rule).toMatchObject({
      category: "safety",
      urgency: "transactional_must_deliver",
      safetyBypass: true,
      quietHoursBypass: true,
      suppressionBypass: true,
    });
    expect(rule?.preferredChannels.every(isExternalNotificationChannel)).toBe(
      true,
    );
  });

  it("orders higher-urgency routes before digest-only routes", () => {
    const rules = NOTIFICATION_ROUTING_RULES.filter((rule) =>
      ["tour_confirmed", "price_changed", "marketing_weekly_digest"].includes(
        rule.eventType,
      ),
    ).sort(compareNotificationRoutingRules);

    expect(rules.map((rule) => rule.eventType)).toEqual([
      "tour_confirmed",
      "price_changed",
      "marketing_weekly_digest",
    ]);
  });

  it("returns null for routes that are not in the source catalog", () => {
    expect(getNotificationRoutingRule("not_a_real_event")).toBeNull();
  });
});
