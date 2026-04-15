import type {
  BuyerEventDeliveryCategory,
  BuyerEventDeliveryUrgency,
  BuyerEventType,
} from "../lib/buyerEvents";

export interface ConvexNotificationRoutingRule {
  eventType: BuyerEventType;
  category: BuyerEventDeliveryCategory;
  urgency: BuyerEventDeliveryUrgency;
  externalChannels: ReadonlyArray<"email" | "sms" | "push">;
  templateKey: string;
  quietHoursBypass?: boolean;
  suppressionBypass?: boolean;
  safetyBypass?: boolean;
}

// Mirror of the canonical routing catalog in `src/lib/notifications/routing-rules.ts`.
// Convex cannot import from `src/`, so this file keeps the runtime subset
// needed for current buyer update events in sync until the rules move into a
// shared package.
export const CONVEX_NOTIFICATION_ROUTING_RULES: ReadonlyArray<ConvexNotificationRoutingRule> =
  [
    {
      eventType: "tour_confirmed",
      category: "tours",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "tour_confirmed",
    },
    {
      eventType: "tour_canceled",
      category: "tours",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "tour_canceled",
    },
    {
      eventType: "tour_reminder",
      category: "tours",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "tour_reminder",
    },
    {
      eventType: "agent_assigned",
      category: "transactional",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "agent_assigned",
    },
    {
      eventType: "offer_countered",
      category: "offers",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "offer_countered",
    },
    {
      eventType: "offer_accepted",
      category: "offers",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "offer_accepted",
    },
    {
      eventType: "offer_rejected",
      category: "offers",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "offer_rejected",
    },
    {
      eventType: "agreement_received",
      category: "disclosures",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "agreement_received",
    },
    {
      eventType: "agreement_signed_reminder",
      category: "disclosures",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "agreement_signed_reminder",
    },
    {
      eventType: "document_ready",
      category: "closing",
      urgency: "transactional",
      externalChannels: ["push", "email"],
      templateKey: "document_ready",
    },
    {
      eventType: "milestone_upcoming",
      category: "transactional",
      urgency: "transactional",
      externalChannels: ["push", "email"],
      templateKey: "milestone_upcoming",
    },
    {
      eventType: "price_changed",
      category: "market_updates",
      urgency: "relationship",
      externalChannels: ["push", "email"],
      templateKey: "price_changed",
    },
    {
      eventType: "new_comp_arrived",
      category: "market_updates",
      urgency: "digest_only",
      externalChannels: ["email"],
      templateKey: "new_comp_arrived",
    },
    {
      eventType: "ai_analysis_ready",
      category: "transactional",
      urgency: "relationship",
      externalChannels: ["push", "email"],
      templateKey: "ai_analysis_ready",
    },
    {
      eventType: "broker_message",
      category: "transactional",
      urgency: "transactional_must_deliver",
      externalChannels: ["push", "sms", "email"],
      templateKey: "broker_message",
    },
  ] as const;

const ROUTING_RULES_BY_EVENT_TYPE = new Map(
  CONVEX_NOTIFICATION_ROUTING_RULES.map((rule) => [rule.eventType, rule] as const),
);

export function getConvexNotificationRoutingRule(
  eventType: BuyerEventType,
): ConvexNotificationRoutingRule {
  return (
    ROUTING_RULES_BY_EVENT_TYPE.get(eventType) ?? {
      eventType,
      category: "transactional",
      urgency: "transactional",
      externalChannels: ["email"],
      templateKey: eventType,
    }
  );
}
