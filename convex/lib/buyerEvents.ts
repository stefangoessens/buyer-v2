// ═══════════════════════════════════════════════════════════════════════════

import type {
  ExternalNotificationChannel,
  NotificationRoutingRule,
} from "@/lib/notifications/types";
// Buyer Update Events (KIN-905) — CONVEX MIRROR
//
// This file is a hand-maintained mirror of
// `src/lib/dealroom/buyer-events.ts`. Convex's tsconfig cannot import
// modules from `../src`, so the pure helpers have to live twice.
// ═══════════════════════════════════════════════════════════════════════════

export type BuyerEventType =
  | "tour_confirmed"
  | "tour_canceled"
  | "tour_reminder"
  | "agent_assigned"
  | "offer_countered"
  | "offer_accepted"
  | "offer_rejected"
  | "agreement_received"
  | "agreement_signed_reminder"
  | "document_ready"
  | "milestone_upcoming"
  | "price_changed"
  | "new_comp_arrived"
  | "ai_analysis_ready"
  | "broker_message";

export type BuyerEventStatus = "pending" | "seen" | "resolved" | "superseded";

export type BuyerEventPriority = "low" | "normal" | "high";

export type BuyerEventResolvedBy = "buyer" | "system" | "broker";

export type BuyerEventDeliveryCategory =
  | "transactional"
  | "tours"
  | "offers"
  | "closing"
  | "disclosures"
  | "market_updates"
  | "marketing"
  | "safety";

export type BuyerEventDeliveryUrgency =
  | "transactional_must_deliver"
  | "transactional"
  | "relationship"
  | "digest_only";

export type BuyerEventDeliveryState =
  | "pending"
  | "dispatched"
  | "delivered"
  | "failed"
  | "skipped_by_preference";

type BuyerEventStateBase<K extends BuyerEventType> = {
  kind: K;
  referenceId: string;
};

export type BuyerEventState =
  | (BuyerEventStateBase<"tour_confirmed"> & {
      scheduledStartAt?: string;
    })
  | (BuyerEventStateBase<"tour_canceled"> & {
      canceledAt?: string;
      reasonCode?: string;
    })
  | (BuyerEventStateBase<"tour_reminder"> & {
      scheduledStartAt?: string;
    })
  | (BuyerEventStateBase<"agent_assigned"> & {
      agentName?: string;
    })
  | (BuyerEventStateBase<"offer_countered"> & {
      amountCents?: number;
    })
  | (BuyerEventStateBase<"offer_accepted"> & {
      amountCents?: number;
    })
  | (BuyerEventStateBase<"offer_rejected"> & {
      amountCents?: number;
    })
  | (BuyerEventStateBase<"agreement_received"> & {
      agreementType?: "tour_pass" | "full_representation";
    })
  | (BuyerEventStateBase<"agreement_signed_reminder"> & {
      agreementType?: "tour_pass" | "full_representation";
      dueAt?: string;
    })
  | (BuyerEventStateBase<"document_ready"> & {
      documentType?: "agreement" | "disclosure" | "closing" | "other";
    })
  | (BuyerEventStateBase<"milestone_upcoming"> & {
      milestoneName?: string;
      dueAt?: string;
    })
  | (BuyerEventStateBase<"price_changed"> & {
      previousPriceCents?: number;
      currentPriceCents?: number;
    })
  | (BuyerEventStateBase<"new_comp_arrived"> & {
      compCount?: number;
    })
  | (BuyerEventStateBase<"ai_analysis_ready"> & {
      analysisType?: "pricing" | "leverage" | "offer" | "cost" | "case_synthesis" | "other";
    })
  | (BuyerEventStateBase<"broker_message"> & {
      senderRole?: "broker" | "agent" | "system";
    });

export interface BuyerEventStorageRecord {
  id: string;
  buyerId: string;
  dealRoomId: string;
  eventType: BuyerEventType;
  state: BuyerEventState;
  category: BuyerEventDeliveryCategory;
  urgency: BuyerEventDeliveryUrgency;
  deliveryState: BuyerEventDeliveryState;
  dedupeKey: string;
  status: BuyerEventStatus;
  priority: BuyerEventPriority;
  emittedAt: string;
  resolvedAt?: string;
  resolvedBy?: BuyerEventResolvedBy;
  dispatchedAt?: string;
  deliveredAt?: string;
  failedReason?: string;
  dedupeCount: number;
  lastDedupedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerEventSummaryItem {
  key: string;
  value: string;
}

export interface BuyerEventReadModel {
  id: string;
  buyerId: string;
  dealRoomId: string;
  eventType: BuyerEventType;
  state: BuyerEventState;
  summary: {
    label: string;
    detailItems: BuyerEventSummaryItem[];
  };
  lifecycle: {
    status: BuyerEventStatus;
    isLive: boolean;
    emittedAt: string;
    resolvedAt?: string;
    resolvedBy?: BuyerEventResolvedBy;
  };
  delivery: {
    priority: BuyerEventPriority;
    dedupeKey: string;
    dedupeCount: number;
    lastDedupedAt?: string;
  };
}

export interface BuyerEventFeedReadModel {
  items: BuyerEventReadModel[];
  counts: {
    total: number;
    live: number;
    resolved: number;
    superseded: number;
  };
}

export interface BuyerEventEmissionInput {
  buyerId: string;
  dealRoomId: string;
  state: BuyerEventState;
  priority?: BuyerEventPriority;
}

export interface BuyerEventNotificationDefaults {
  category: BuyerEventDeliveryCategory;
  urgency: BuyerEventDeliveryUrgency;
  deliveryState: BuyerEventDeliveryState;
}

function buyerEventRoutingRule(
  eventType: BuyerEventType,
  label: string,
  category: BuyerEventDeliveryCategory,
  urgency: BuyerEventDeliveryUrgency,
  preferredChannels: readonly (
    | "email"
    | "sms"
    | "push"
    | "in_app"
  )[],
  templateKey: string,
): NotificationRoutingRule {
  return {
    eventType,
    label,
    category,
    urgency,
    preferredChannels,
    templateKey,
    safetyBypass: category === "safety",
    quietHoursBypass: category === "safety",
    suppressionBypass: category === "safety",
  };
}

const BUYER_EVENT_ROUTING_RULES = [
  buyerEventRoutingRule(
    "tour_confirmed",
    "Tour confirmed",
    "tours",
    "transactional_must_deliver",
    ["in_app", "push", "sms", "email"],
    "tour_confirmed",
  ),
  buyerEventRoutingRule(
    "tour_canceled",
    "Tour canceled",
    "tours",
    "transactional_must_deliver",
    ["in_app", "push", "sms", "email"],
    "tour_canceled",
  ),
  buyerEventRoutingRule(
    "tour_reminder",
    "Tour reminder",
    "tours",
    "transactional_must_deliver",
    ["push", "sms", "email"],
    "tour_reminder",
  ),
  buyerEventRoutingRule(
    "agent_assigned",
    "Agent assigned",
    "transactional",
    "transactional_must_deliver",
    ["in_app", "push", "sms", "email"],
    "agent_assigned",
  ),
  buyerEventRoutingRule(
    "offer_countered",
    "Offer countered",
    "offers",
    "transactional_must_deliver",
    ["in_app", "push", "sms", "email"],
    "offer_countered",
  ),
  buyerEventRoutingRule(
    "offer_accepted",
    "Offer accepted",
    "offers",
    "transactional_must_deliver",
    ["in_app", "push", "sms", "email"],
    "offer_accepted",
  ),
  buyerEventRoutingRule(
    "offer_rejected",
    "Offer rejected",
    "offers",
    "transactional_must_deliver",
    ["in_app", "push", "sms", "email"],
    "offer_rejected",
  ),
  buyerEventRoutingRule(
    "agreement_received",
    "Agreement received",
    "disclosures",
    "transactional_must_deliver",
    ["in_app", "push", "sms", "email"],
    "agreement_received",
  ),
  buyerEventRoutingRule(
    "agreement_signed_reminder",
    "Agreement reminder",
    "disclosures",
    "transactional_must_deliver",
    ["push", "sms", "email"],
    "agreement_signed_reminder",
  ),
  buyerEventRoutingRule(
    "document_ready",
    "Document ready",
    "closing",
    "transactional",
    ["in_app", "push", "email"],
    "document_ready",
  ),
  buyerEventRoutingRule(
    "milestone_upcoming",
    "Milestone upcoming",
    "transactional",
    "transactional",
    ["in_app", "push", "email"],
    "milestone_upcoming",
  ),
  buyerEventRoutingRule(
    "price_changed",
    "Price changed",
    "market_updates",
    "relationship",
    ["in_app", "push", "email"],
    "price_changed",
  ),
  buyerEventRoutingRule(
    "new_comp_arrived",
    "New comp arrived",
    "market_updates",
    "relationship",
    ["in_app", "email"],
    "new_comp_arrived",
  ),
  buyerEventRoutingRule(
    "ai_analysis_ready",
    "AI analysis ready",
    "transactional",
    "relationship",
    ["in_app", "push", "email"],
    "ai_analysis_ready",
  ),
  buyerEventRoutingRule(
    "broker_message",
    "Broker message",
    "transactional",
    "transactional_must_deliver",
    ["in_app", "push", "sms", "email"],
    "broker_message",
  ),
] as const satisfies readonly NotificationRoutingRule[];

const BUYER_EVENT_ROUTING_RULE_BY_TYPE = new Map(
  BUYER_EVENT_ROUTING_RULES.map((rule) => [rule.eventType, rule] as const),
);

export type BuyerEventEmissionDecision =
  | {
      action: "insert";
      record: BuyerEventStorageRecord;
    }
  | {
      action: "bump";
      record: BuyerEventStorageRecord;
    }
  | {
      action: "ignore";
      record: BuyerEventStorageRecord;
    };

export function makeDedupeKey(
  eventType: BuyerEventType,
  referenceId: string,
): string {
  return `${eventType}:${referenceId}`;
}

export function defaultPriorityFor(
  eventType: BuyerEventType,
): BuyerEventPriority {
  switch (eventType) {
    case "tour_reminder":
    case "agreement_signed_reminder":
    case "milestone_upcoming":
    case "broker_message":
    case "offer_accepted":
    case "offer_rejected":
      return "high";
    case "price_changed":
    case "new_comp_arrived":
      return "low";
    default:
      return "normal";
  }
}

export function defaultNotificationCategoryFor(
  eventType: BuyerEventType,
): BuyerEventDeliveryCategory {
  return getBuyerEventRoutingRule(eventType).category;
}

export function defaultNotificationUrgencyFor(
  eventType: BuyerEventType,
): BuyerEventDeliveryUrgency {
  return getBuyerEventRoutingRule(eventType).urgency;
}

export function defaultBuyerEventNotificationDefaults(
  eventType: BuyerEventType,
): BuyerEventNotificationDefaults {
  return {
    category: defaultNotificationCategoryFor(eventType),
    urgency: defaultNotificationUrgencyFor(eventType),
    deliveryState: "pending",
  };
}

export function defaultBuyerEventDeliveryState(): BuyerEventDeliveryState {
  return "pending";
}

export function getBuyerEventRoutingRule(
  eventType: BuyerEventType,
): NotificationRoutingRule {
  return (
    BUYER_EVENT_ROUTING_RULE_BY_TYPE.get(eventType) ??
    buyerEventRoutingRule(
      eventType,
      eventType,
      "transactional",
      "transactional",
      ["in_app", "email"],
      eventType,
    )
  );
}

export function externalChannelsForBuyerEvent(
  eventType: BuyerEventType,
): ExternalNotificationChannel[] {
  return getBuyerEventRoutingRule(eventType).preferredChannels.filter(
    (
      channel,
    ): channel is ExternalNotificationChannel => channel !== "in_app",
  );
}

export function dedupeResolutionFor(
  _eventType: BuyerEventType,
): "bump" | "ignore" {
  return "bump";
}

export function priorityRank(priority: BuyerEventPriority): number {
  switch (priority) {
    case "high":
      return 3;
    case "normal":
      return 2;
    case "low":
      return 1;
  }
}

export function compareEventsForDisplay(
  a: { priority: BuyerEventPriority; emittedAt: string },
  b: { priority: BuyerEventPriority; emittedAt: string },
): number {
  const pa = priorityRank(a.priority);
  const pb = priorityRank(b.priority);
  if (pa !== pb) return pb - pa;
  if (a.emittedAt > b.emittedAt) return -1;
  if (a.emittedAt < b.emittedAt) return 1;
  return 0;
}

export function isLiveStatus(status: BuyerEventStatus): boolean {
  return status === "pending" || status === "seen";
}

export const ALL_BUYER_EVENT_TYPES: readonly BuyerEventType[] = [
  "tour_confirmed",
  "tour_canceled",
  "tour_reminder",
  "agent_assigned",
  "offer_countered",
  "offer_accepted",
  "offer_rejected",
  "agreement_received",
  "agreement_signed_reminder",
  "document_ready",
  "milestone_upcoming",
  "price_changed",
  "new_comp_arrived",
  "ai_analysis_ready",
  "broker_message",
] as const;

export function summarizeBuyerEventState(
  state: BuyerEventState,
): BuyerEventReadModel["summary"] {
  switch (state.kind) {
    case "tour_confirmed":
      return {
        label: "Tour confirmed",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["scheduledStartAt", state.scheduledStartAt],
        ]),
      };
    case "tour_canceled":
      return {
        label: "Tour canceled",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["canceledAt", state.canceledAt],
          ["reasonCode", state.reasonCode],
        ]),
      };
    case "tour_reminder":
      return {
        label: "Tour reminder",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["scheduledStartAt", state.scheduledStartAt],
        ]),
      };
    case "agent_assigned":
      return {
        label: "Agent assigned",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["agentName", state.agentName],
        ]),
      };
    case "offer_countered":
      return {
        label: "Offer countered",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["amountCents", state.amountCents],
        ]),
      };
    case "offer_accepted":
      return {
        label: "Offer accepted",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["amountCents", state.amountCents],
        ]),
      };
    case "offer_rejected":
      return {
        label: "Offer rejected",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["amountCents", state.amountCents],
        ]),
      };
    case "agreement_received":
      return {
        label: "Agreement received",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["agreementType", state.agreementType],
        ]),
      };
    case "agreement_signed_reminder":
      return {
        label: "Agreement signature reminder",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["agreementType", state.agreementType],
          ["dueAt", state.dueAt],
        ]),
      };
    case "document_ready":
      return {
        label: "Document ready",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["documentType", state.documentType],
        ]),
      };
    case "milestone_upcoming":
      return {
        label: "Milestone upcoming",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["milestoneName", state.milestoneName],
          ["dueAt", state.dueAt],
        ]),
      };
    case "price_changed":
      return {
        label: "Price changed",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["previousPriceCents", state.previousPriceCents],
          ["currentPriceCents", state.currentPriceCents],
        ]),
      };
    case "new_comp_arrived":
      return {
        label: "New comp arrived",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["compCount", state.compCount],
        ]),
      };
    case "ai_analysis_ready":
      return {
        label: "AI analysis ready",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["analysisType", state.analysisType],
        ]),
      };
    case "broker_message":
      return {
        label: "Broker message",
        detailItems: detailItems([
          ["referenceId", state.referenceId],
          ["senderRole", state.senderRole],
        ]),
      };
  }
}

export function composeBuyerEventReadModel(
  record: BuyerEventStorageRecord,
): BuyerEventReadModel {
  return {
    id: record.id,
    buyerId: record.buyerId,
    dealRoomId: record.dealRoomId,
    eventType: record.eventType,
    state: record.state,
    summary: summarizeBuyerEventState(record.state),
    lifecycle: {
      status: record.status,
      isLive: isLiveStatus(record.status),
      emittedAt: record.emittedAt,
      resolvedAt: record.resolvedAt,
      resolvedBy: record.resolvedBy,
    },
    delivery: {
      priority: record.priority,
      dedupeKey: record.dedupeKey,
      dedupeCount: record.dedupeCount,
      lastDedupedAt: record.lastDedupedAt,
    },
  };
}

export function composeBuyerEventFeed(
  records: BuyerEventStorageRecord[],
): BuyerEventFeedReadModel {
  const items = [...records]
    .sort((a, b) =>
      compareEventsForDisplay(
        { priority: a.priority, emittedAt: a.emittedAt },
        { priority: b.priority, emittedAt: b.emittedAt },
      ),
    )
    .map(composeBuyerEventReadModel);

  return {
    items,
    counts: {
      total: items.length,
      live: items.filter((item) => item.lifecycle.isLive).length,
      resolved: items.filter((item) => item.lifecycle.status === "resolved").length,
      superseded: items.filter(
        (item) => item.lifecycle.status === "superseded",
      ).length,
    },
  };
}

export function applyBuyerEventEmission(
  existing: BuyerEventStorageRecord | null,
  input: BuyerEventEmissionInput & { now: string },
): BuyerEventEmissionDecision {
  const priority = input.priority ?? defaultPriorityFor(input.state.kind);
  const dedupeKey = makeDedupeKey(input.state.kind, input.state.referenceId);
  const defaults = defaultBuyerEventNotificationDefaults(input.state.kind);

  if (!existing) {
    return {
      action: "insert",
      record: {
        id: "",
        buyerId: input.buyerId,
        dealRoomId: input.dealRoomId,
        eventType: input.state.kind,
        state: input.state,
        category: defaults.category,
        urgency: defaults.urgency,
        deliveryState: defaults.deliveryState,
        dedupeKey,
        status: "pending",
        priority,
        emittedAt: input.now,
        dedupeCount: 1,
        createdAt: input.now,
        updatedAt: input.now,
      },
    };
  }

  if (dedupeResolutionFor(input.state.kind) === "ignore") {
    return { action: "ignore", record: existing };
  }

  return {
    action: "bump",
    record: {
      ...existing,
      eventType: input.state.kind,
      state: input.state,
      category: defaults.category,
      urgency: defaults.urgency,
      deliveryState: defaults.deliveryState,
      dedupeKey,
      status: "pending",
      priority,
      emittedAt: input.now,
      resolvedAt: undefined,
      resolvedBy: undefined,
      dispatchedAt: undefined,
      deliveredAt: undefined,
      failedReason: undefined,
      dedupeCount: existing.dedupeCount + 1,
      lastDedupedAt: input.now,
      updatedAt: input.now,
    },
  };
}

export function applyBuyerEventResolution(
  record: BuyerEventStorageRecord,
  resolvedBy: BuyerEventResolvedBy,
  now: string,
): BuyerEventStorageRecord {
  if (record.status === "resolved" || record.status === "superseded") {
    return record;
  }

  return {
    ...record,
    status: "resolved",
    resolvedAt: now,
    resolvedBy,
    updatedAt: now,
  };
}

function detailItems(
  values: Array<[string, string | number | undefined]>,
): BuyerEventSummaryItem[] {
  return values.flatMap(([key, value]) => {
    if (value === undefined) return [];
    return [{ key, value: String(value) }];
  });
}
