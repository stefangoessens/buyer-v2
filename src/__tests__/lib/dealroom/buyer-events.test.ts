import { describe, expect, it } from "vitest";
import {
  ALL_BUYER_EVENT_TYPES,
  applyBuyerEventEmission,
  applyBuyerEventResolution,
  compareEventsForDisplay,
  composeBuyerEventFeed,
  composeBuyerEventReadModel,
  dedupeResolutionFor,
  defaultPriorityFor,
  isLiveStatus,
  makeDedupeKey,
  priorityRank,
  type BuyerEventPriority,
  type BuyerEventResolvedBy,
  type BuyerEventState,
  type BuyerEventStatus,
  type BuyerEventStorageRecord,
  type BuyerEventType,
} from "@/lib/dealroom/buyer-events";

const mkState = (
  overrides: Partial<BuyerEventState> = {},
): BuyerEventState => ({
  kind: "offer_countered",
  referenceId: "offer_1",
  amountCents: 65000000,
  ...overrides,
} as BuyerEventState);

const mkRecord = (
  overrides: Partial<BuyerEventStorageRecord> = {},
): BuyerEventStorageRecord => {
  const state = mkState();
  return {
    id: "event_1",
    buyerId: "buyer_1",
    dealRoomId: "deal_1",
    eventType: state.kind,
    state,
    dedupeKey: makeDedupeKey(state.kind, state.referenceId),
    status: "pending",
    priority: "normal",
    emittedAt: "2026-04-12T12:00:00.000Z",
    dedupeCount: 1,
    createdAt: "2026-04-12T12:00:00.000Z",
    updatedAt: "2026-04-12T12:00:00.000Z",
    ...overrides,
  };
};

describe("makeDedupeKey", () => {
  it("joins eventType and referenceId with a colon", () => {
    expect(makeDedupeKey("tour_confirmed", "tour_abc")).toBe(
      "tour_confirmed:tour_abc",
    );
  });

  it("is deterministic for the same inputs", () => {
    expect(makeDedupeKey("offer_countered", "offer_1")).toBe(
      makeDedupeKey("offer_countered", "offer_1"),
    );
  });

  it("produces distinct keys for distinct event types or references", () => {
    expect(makeDedupeKey("tour_confirmed", "tour_1")).not.toBe(
      makeDedupeKey("tour_canceled", "tour_1"),
    );
    expect(makeDedupeKey("new_comp_arrived", "comp_1")).not.toBe(
      makeDedupeKey("new_comp_arrived", "comp_2"),
    );
  });
});

describe("defaultPriorityFor", () => {
  it("returns high priority for reminders, broker messages, and terminal offers", () => {
    expect(defaultPriorityFor("tour_reminder")).toBe("high");
    expect(defaultPriorityFor("agreement_signed_reminder")).toBe("high");
    expect(defaultPriorityFor("milestone_upcoming")).toBe("high");
    expect(defaultPriorityFor("broker_message")).toBe("high");
    expect(defaultPriorityFor("offer_accepted")).toBe("high");
    expect(defaultPriorityFor("offer_rejected")).toBe("high");
  });

  it("returns low priority for passive market updates", () => {
    expect(defaultPriorityFor("price_changed")).toBe("low");
    expect(defaultPriorityFor("new_comp_arrived")).toBe("low");
  });

  it("returns a valid priority for every known type", () => {
    const valid: BuyerEventPriority[] = ["low", "normal", "high"];
    for (const eventType of ALL_BUYER_EVENT_TYPES) {
      expect(valid).toContain(defaultPriorityFor(eventType));
    }
  });
});

describe("dedupeResolutionFor", () => {
  it("returns bump for every current event type", () => {
    for (const eventType of ALL_BUYER_EVENT_TYPES) {
      expect(dedupeResolutionFor(eventType)).toBe("bump");
    }
  });
});

describe("priorityRank", () => {
  it("ranks high > normal > low", () => {
    expect(priorityRank("high")).toBeGreaterThan(priorityRank("normal"));
    expect(priorityRank("normal")).toBeGreaterThan(priorityRank("low"));
  });
});

describe("compareEventsForDisplay", () => {
  it("orders by priority first, then emittedAt descending", () => {
    const sorted = [
      { id: "a", priority: "low" as const, emittedAt: "2026-04-12T00:00:00Z" },
      { id: "b", priority: "high" as const, emittedAt: "2026-04-10T00:00:00Z" },
      { id: "c", priority: "high" as const, emittedAt: "2026-04-13T00:00:00Z" },
    ].sort(compareEventsForDisplay);

    expect(sorted.map((item) => item.id)).toEqual(["c", "b", "a"]);
  });
});

describe("isLiveStatus", () => {
  it("returns true only for pending and seen", () => {
    expect(isLiveStatus("pending")).toBe(true);
    expect(isLiveStatus("seen")).toBe(true);
    expect(isLiveStatus("resolved")).toBe(false);
    expect(isLiveStatus("superseded")).toBe(false);
  });

  it("handles every status", () => {
    const statuses: BuyerEventStatus[] = [
      "pending",
      "seen",
      "resolved",
      "superseded",
    ];
    for (const status of statuses) {
      expect(typeof isLiveStatus(status)).toBe("boolean");
    }
  });
});

describe("ALL_BUYER_EVENT_TYPES", () => {
  it("contains exactly 15 unique event types", () => {
    expect(ALL_BUYER_EVENT_TYPES).toHaveLength(15);
    expect(new Set<BuyerEventType>(ALL_BUYER_EVENT_TYPES).size).toBe(15);
  });
});

describe("composeBuyerEventReadModel", () => {
  it("materializes a shared read model from typed state", () => {
    const record = mkRecord({
      state: mkState({ amountCents: 71000000 }),
      eventType: "offer_countered",
    });

    const result = composeBuyerEventReadModel(record);

    expect(result.summary.label).toBe("Offer countered");
    expect(result.summary.detailItems).toContainEqual({
      key: "amountCents",
      value: "71000000",
    });
    expect(result.lifecycle.isLive).toBe(true);
    expect(result.delivery.dedupeCount).toBe(1);
  });
});

describe("composeBuyerEventFeed", () => {
  it("returns sorted items with lifecycle counts", () => {
    const feed = composeBuyerEventFeed([
      mkRecord({
        id: "resolved_1",
        status: "resolved",
        resolvedAt: "2026-04-13T00:00:00.000Z",
        resolvedBy: "buyer",
      }),
      mkRecord({
        id: "live_1",
        priority: "high",
        emittedAt: "2026-04-14T00:00:00.000Z",
        updatedAt: "2026-04-14T00:00:00.000Z",
      }),
      mkRecord({
        id: "superseded_1",
        status: "superseded",
      }),
    ]);

    expect(feed.items.map((item) => item.id)).toEqual([
      "live_1",
      "resolved_1",
      "superseded_1",
    ]);
    expect(feed.counts).toEqual({
      total: 3,
      live: 1,
      resolved: 1,
      superseded: 1,
    });
  });
});

describe("applyBuyerEventEmission", () => {
  it("creates a pending typed record on first emit", () => {
    const now = "2026-04-15T12:00:00.000Z";
    const decision = applyBuyerEventEmission(null, {
      buyerId: "buyer_1",
      dealRoomId: "deal_1",
      state: {
        kind: "tour_reminder",
        referenceId: "tour_42",
        scheduledStartAt: "2026-04-16T14:00:00.000Z",
      },
      now,
    });

    expect(decision.action).toBe("insert");
    expect(decision.record).toMatchObject({
      buyerId: "buyer_1",
      dealRoomId: "deal_1",
      eventType: "tour_reminder",
      dedupeKey: "tour_reminder:tour_42",
      status: "pending",
      priority: "high",
      dedupeCount: 1,
      emittedAt: now,
    });
  });

  it("bumps duplicates deterministically and resurrects resolved rows", () => {
    const existing = mkRecord({
      state: {
        kind: "tour_reminder",
        referenceId: "tour_42",
        scheduledStartAt: "2026-04-16T14:00:00.000Z",
      },
      eventType: "tour_reminder",
      dedupeKey: "tour_reminder:tour_42",
      status: "resolved",
      resolvedAt: "2026-04-15T10:00:00.000Z",
      resolvedBy: "buyer",
      dedupeCount: 2,
      priority: "high",
    });

    const decision = applyBuyerEventEmission(existing, {
      buyerId: "buyer_1",
      dealRoomId: "deal_1",
      state: {
        kind: "tour_reminder",
        referenceId: "tour_42",
        scheduledStartAt: "2026-04-16T15:30:00.000Z",
      },
      now: "2026-04-15T12:00:00.000Z",
    });

    expect(decision.action).toBe("bump");
    expect(decision.record.status).toBe("pending");
    expect(decision.record.dedupeCount).toBe(3);
    expect(decision.record.lastDedupedAt).toBe("2026-04-15T12:00:00.000Z");
    expect(decision.record.resolvedAt).toBeUndefined();
    expect(decision.record.resolvedBy).toBeUndefined();
    expect(decision.record.state).toMatchObject({
      kind: "tour_reminder",
      scheduledStartAt: "2026-04-16T15:30:00.000Z",
    });
  });
});

describe("applyBuyerEventResolution", () => {
  it("marks a live event resolved with lifecycle metadata", () => {
    const record = mkRecord();
    const resolvedBy: BuyerEventResolvedBy = "broker";

    const next = applyBuyerEventResolution(
      record,
      resolvedBy,
      "2026-04-16T10:00:00.000Z",
    );

    expect(next.status).toBe("resolved");
    expect(next.resolvedBy).toBe("broker");
    expect(next.resolvedAt).toBe("2026-04-16T10:00:00.000Z");
  });

  it("is idempotent for already resolved or superseded events", () => {
    const resolved = mkRecord({
      status: "resolved",
      resolvedAt: "2026-04-16T10:00:00.000Z",
      resolvedBy: "buyer",
    });
    const superseded = mkRecord({ status: "superseded" });

    expect(
      applyBuyerEventResolution(resolved, "system", "2026-04-17T10:00:00.000Z"),
    ).toEqual(resolved);
    expect(
      applyBuyerEventResolution(
        superseded,
        "system",
        "2026-04-17T10:00:00.000Z",
      ),
    ).toEqual(superseded);
  });
});
