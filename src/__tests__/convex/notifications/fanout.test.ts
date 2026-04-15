import { describe, expect, it } from "vitest";
import {
  applyFanoutBackpressure,
  deriveEventDeliveryState,
  FANOUT_BACKPRESSURE_THRESHOLD,
  getRetryDelayMs,
} from "../../../../convex/notifications/deliveryFanout";
import { EVENT_METADATA, listEventsByCategory } from "@/lib/analytics";

function makeCandidate(
  eventType: string,
  emittedAt: string,
): Parameters<typeof applyFanoutBackpressure>[0][number] {
  return {
    _id: `${eventType}:${emittedAt}`,
    _creationTime: 0,
    buyerId: "buyer_1",
    dealRoomId: "deal_room_1",
    eventType,
    state: { kind: eventType, referenceId: "reference_1" },
    title: eventType,
    dedupeKey: `${eventType}:reference_1`,
    status: "pending",
    priority: "normal",
    emittedAt,
    dedupeCount: 1,
    createdAt: emittedAt,
    updatedAt: emittedAt,
  } as Parameters<typeof applyFanoutBackpressure>[0][number];
}

describe("notification fanout helpers", () => {
  it("exposes the expected retry delay ladder", () => {
    expect(getRetryDelayMs(0)).toBeNull();
    expect(getRetryDelayMs(1)).toBe(2_000);
    expect(getRetryDelayMs(2)).toBe(8_000);
    expect(getRetryDelayMs(3)).toBe(30_000);
    expect(getRetryDelayMs(4)).toBe(120_000);
    expect(getRetryDelayMs(5)).toBe(600_000);
    expect(getRetryDelayMs(6)).toBeNull();
  });

  it("keeps preference skips distinct from terminal failures", () => {
    expect(
      deriveEventDeliveryState({
        anyDelivered: false,
        anyDispatched: false,
        waitingForLater: false,
        skippedByPreferenceOrSuppression: true,
        allTerminalFailures: false,
      }),
    ).toBe("skipped_by_preference");

    expect(
      deriveEventDeliveryState({
        anyDelivered: false,
        anyDispatched: false,
        waitingForLater: false,
        skippedByPreferenceOrSuppression: false,
        allTerminalFailures: true,
      }),
    ).toBe("failed");
  });

  it("sheds relationship events once the queue crosses the backpressure threshold", () => {
    const transactionalCandidates = Array.from(
      { length: FANOUT_BACKPRESSURE_THRESHOLD },
      (_, index) =>
        makeCandidate(
          "tour_confirmed",
          `2026-04-15T12:${String(index).padStart(2, "0")}:00.000Z`,
        ),
    );
    const olderRelationshipCandidate = makeCandidate(
      "price_changed",
      "2026-04-15T11:59:58.000Z",
    );
    const newerRelationshipCandidate = makeCandidate(
      "new_comp_arrived",
      "2026-04-15T11:59:59.000Z",
    );

    const { selected, shed } = applyFanoutBackpressure([
      ...transactionalCandidates,
      olderRelationshipCandidate,
      newerRelationshipCandidate,
    ]);

    expect(selected).toHaveLength(FANOUT_BACKPRESSURE_THRESHOLD);
    expect(shed.map((candidate) => candidate.eventType)).toEqual([
      "new_comp_arrived",
      "price_changed",
    ]);
  });
});

describe("notification analytics catalog", () => {
  it("includes the new notification delivery lifecycle events in communication", () => {
    const eventNames = listEventsByCategory("communication");

    expect(eventNames).toEqual(
      expect.arrayContaining([
        "message_sent",
        "message_failed",
        "message_bounced",
        "message_suppressed",
        "notification_fanout_backpressure",
        "notification_delivery_fanout_started",
        "notification_delivery_backpressure_applied",
        "notification_delivery_attempt_recorded",
        "notification_delivery_state_changed",
        "notification_webhook_receipt_recorded",
      ]),
    );

    expect(EVENT_METADATA.notification_delivery_fanout_started.piiSafe).toBe(
      true,
    );
    expect(
      EVENT_METADATA.notification_delivery_backpressure_applied.piiSafe,
    ).toBe(true);
    expect(EVENT_METADATA.notification_fanout_backpressure.piiSafe).toBe(true);
    expect(EVENT_METADATA.notification_delivery_attempt_recorded.piiSafe).toBe(
      true,
    );
    expect(EVENT_METADATA.notification_delivery_state_changed.piiSafe).toBe(
      true,
    );
    expect(EVENT_METADATA.notification_webhook_receipt_recorded.piiSafe).toBe(
      true,
    );
  });
});
