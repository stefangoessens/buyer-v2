// ═══════════════════════════════════════════════════════════════════════════
// Buyer Update Events (KIN-905)
//
// Pure TS helpers for typed buyer-facing update event state. Used by both
// the Convex backend and frontend consumers. The backend stores typed event
// state and lifecycle metadata; delivery channels render from shared read
// models rather than inventing their own write-time state.
//
// NOTE: There is a Convex-side mirror of this file at
// `convex/lib/buyerEvents.ts`. The Convex tsconfig cannot import from
// `../src`, so the two files must be kept in sync manually.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Machine-readable buyer event types. These align with the analytics
 * taxonomy (KIN-860) but not every event fires both a buyer update and an
 * analytics event.
 */
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

/**
 * Event lifecycle status.
 *   - pending: newly emitted, not yet seen by buyer
 *   - seen: buyer has viewed it (but not dismissed)
 *   - resolved: dismissed or acted upon
 *   - superseded: replaced by a newer event on the same dedupeKey
 */
export type BuyerEventStatus = "pending" | "seen" | "resolved" | "superseded";

/** Priority ordering used by the UI when listing events. */
export type BuyerEventPriority = "low" | "normal" | "high";

/** Who resolved the event, for lifecycle/audit provenance. */
export type BuyerEventResolvedBy = "buyer" | "system" | "broker";

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
  dedupeKey: string;
  status: BuyerEventStatus;
  priority: BuyerEventPriority;
  emittedAt: string;
  resolvedAt?: string;
  resolvedBy?: BuyerEventResolvedBy;
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

/**
 * Build the canonical dedupe key for an event type + reference ID pair.
 * Two events with the same key for the same (buyerId, dealRoomId) are
 * treated as duplicates and coalesced rather than inserted twice.
 */
export function makeDedupeKey(
  eventType: BuyerEventType,
  referenceId: string,
): string {
  return `${eventType}:${referenceId}`;
}

/**
 * Default priority mapping for event types. Most events are "normal";
 * reminders and terminal offer states are "high"; passive market updates
 * are "low".
 */
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

/**
 * Decide how a dedupe collision should be handled. Separate event types
 * have different dedupe keys, so this only runs when the keys already
 * match.
 */
export function dedupeResolutionFor(
  _eventType: BuyerEventType,
): "bump" | "ignore" {
  return "bump";
}

/**
 * Numeric rank for a priority — higher is more important. Exposed so the
 * UI and the backend agree on ordering without duplicating a map.
 */
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

/**
 * Compare two events for display ordering: highest priority first, then
 * most recent `emittedAt` first. Stable when the two events are equal.
 */
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

/**
 * Whether the given status represents a "live" event that the buyer can
 * still act on. Resolved and superseded events are historical.
 */
export function isLiveStatus(status: BuyerEventStatus): boolean {
  return status === "pending" || status === "seen";
}

/**
 * Complete list of every known event type. Handy for exhaustive tests and
 * for building admin dropdowns without re-typing the union.
 */
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

  if (!existing) {
    return {
      action: "insert",
      record: {
        id: "",
        buyerId: input.buyerId,
        dealRoomId: input.dealRoomId,
        eventType: input.state.kind,
        state: input.state,
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
      dedupeKey,
      status: "pending",
      priority,
      emittedAt: input.now,
      resolvedAt: undefined,
      resolvedBy: undefined,
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
