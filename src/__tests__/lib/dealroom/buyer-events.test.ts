import { describe, it, expect } from "vitest";
import {
  ALL_BUYER_EVENT_TYPES,
  compareEventsForDisplay,
  dedupeResolutionFor,
  defaultPriorityFor,
  isLiveStatus,
  makeDedupeKey,
  priorityRank,
  type BuyerEventPriority,
  type BuyerEventStatus,
  type BuyerEventType,
} from "@/lib/dealroom/buyer-events";

describe("makeDedupeKey", () => {
  it("joins eventType and referenceId with a colon", () => {
    expect(makeDedupeKey("tour_confirmed", "tour_abc")).toBe(
      "tour_confirmed:tour_abc"
    );
  });

  it("is deterministic — same inputs produce same key", () => {
    const a = makeDedupeKey("offer_countered", "offer_1");
    const b = makeDedupeKey("offer_countered", "offer_1");
    expect(a).toBe(b);
  });

  it("produces distinct keys for different event types on the same reference", () => {
    const confirmed = makeDedupeKey("tour_confirmed", "tour_1");
    const canceled = makeDedupeKey("tour_canceled", "tour_1");
    expect(confirmed).not.toBe(canceled);
  });

  it("produces distinct keys for different reference ids on the same event type", () => {
    const one = makeDedupeKey("new_comp_arrived", "comp_1");
    const two = makeDedupeKey("new_comp_arrived", "comp_2");
    expect(one).not.toBe(two);
  });

  it("handles empty reference id without crashing", () => {
    expect(makeDedupeKey("tour_reminder", "")).toBe("tour_reminder:");
  });
});

describe("defaultPriorityFor", () => {
  it("returns 'high' for tour_reminder", () => {
    expect(defaultPriorityFor("tour_reminder")).toBe("high");
  });

  it("returns 'high' for agreement_signed_reminder", () => {
    expect(defaultPriorityFor("agreement_signed_reminder")).toBe("high");
  });

  it("returns 'high' for milestone_upcoming", () => {
    expect(defaultPriorityFor("milestone_upcoming")).toBe("high");
  });

  it("returns 'high' for broker_message", () => {
    expect(defaultPriorityFor("broker_message")).toBe("high");
  });

  it("returns 'high' for terminal offer states (accepted / rejected)", () => {
    expect(defaultPriorityFor("offer_accepted")).toBe("high");
    expect(defaultPriorityFor("offer_rejected")).toBe("high");
  });

  it("returns 'low' for passive market updates", () => {
    expect(defaultPriorityFor("price_changed")).toBe("low");
    expect(defaultPriorityFor("new_comp_arrived")).toBe("low");
  });

  it("returns 'normal' for tour_confirmed and tour_canceled", () => {
    expect(defaultPriorityFor("tour_confirmed")).toBe("normal");
    expect(defaultPriorityFor("tour_canceled")).toBe("normal");
  });

  it("returns 'normal' for offer_countered", () => {
    expect(defaultPriorityFor("offer_countered")).toBe("normal");
  });

  it("returns 'normal' for agent_assigned, agreement_received, document_ready, ai_analysis_ready", () => {
    expect(defaultPriorityFor("agent_assigned")).toBe("normal");
    expect(defaultPriorityFor("agreement_received")).toBe("normal");
    expect(defaultPriorityFor("document_ready")).toBe("normal");
    expect(defaultPriorityFor("ai_analysis_ready")).toBe("normal");
  });

  it("returns a valid priority for every event type in ALL_BUYER_EVENT_TYPES", () => {
    const valid: BuyerEventPriority[] = ["low", "normal", "high"];
    for (const t of ALL_BUYER_EVENT_TYPES) {
      expect(valid).toContain(defaultPriorityFor(t));
    }
  });
});

describe("dedupeResolutionFor", () => {
  it("returns 'bump' for every currently known event type", () => {
    for (const t of ALL_BUYER_EVENT_TYPES) {
      expect(dedupeResolutionFor(t)).toBe("bump");
    }
  });

  it("returns 'bump' specifically for tour_reminder (most common bump case)", () => {
    expect(dedupeResolutionFor("tour_reminder")).toBe("bump");
  });

  it("never returns 'ignore' today — guard against accidental regressions", () => {
    for (const t of ALL_BUYER_EVENT_TYPES) {
      expect(dedupeResolutionFor(t)).not.toBe("ignore");
    }
  });
});

describe("priorityRank", () => {
  it("ranks high > normal > low", () => {
    expect(priorityRank("high")).toBeGreaterThan(priorityRank("normal"));
    expect(priorityRank("normal")).toBeGreaterThan(priorityRank("low"));
  });

  it("returns 3 / 2 / 1 for high / normal / low", () => {
    expect(priorityRank("high")).toBe(3);
    expect(priorityRank("normal")).toBe(2);
    expect(priorityRank("low")).toBe(1);
  });
});

describe("compareEventsForDisplay", () => {
  it("puts higher priority first", () => {
    const high = { priority: "high" as const, emittedAt: "2026-04-10T00:00:00Z" };
    const low = { priority: "low" as const, emittedAt: "2026-04-12T00:00:00Z" };
    const sorted = [low, high].sort(compareEventsForDisplay);
    expect(sorted[0]).toBe(high);
  });

  it("at equal priority, puts the most recent emittedAt first", () => {
    const older = {
      priority: "normal" as const,
      emittedAt: "2026-04-01T00:00:00Z",
    };
    const newer = {
      priority: "normal" as const,
      emittedAt: "2026-04-12T00:00:00Z",
    };
    const sorted = [older, newer].sort(compareEventsForDisplay);
    expect(sorted[0]).toBe(newer);
    expect(sorted[1]).toBe(older);
  });

  it("returns 0 for two identically-shaped events", () => {
    const a = { priority: "normal" as const, emittedAt: "2026-04-05T00:00:00Z" };
    const b = { priority: "normal" as const, emittedAt: "2026-04-05T00:00:00Z" };
    expect(compareEventsForDisplay(a, b)).toBe(0);
  });

  it("normal beats low regardless of timestamps", () => {
    const normalOld = {
      priority: "normal" as const,
      emittedAt: "2026-01-01T00:00:00Z",
    };
    const lowNew = {
      priority: "low" as const,
      emittedAt: "2026-12-31T00:00:00Z",
    };
    const sorted = [lowNew, normalOld].sort(compareEventsForDisplay);
    expect(sorted[0]).toBe(normalOld);
  });

  it("stably orders a mixed priority + timestamp list", () => {
    const a = {
      id: "a",
      priority: "low" as const,
      emittedAt: "2026-04-05T00:00:00Z",
    };
    const b = {
      id: "b",
      priority: "high" as const,
      emittedAt: "2026-04-01T00:00:00Z",
    };
    const c = {
      id: "c",
      priority: "normal" as const,
      emittedAt: "2026-04-10T00:00:00Z",
    };
    const d = {
      id: "d",
      priority: "high" as const,
      emittedAt: "2026-04-12T00:00:00Z",
    };
    const sorted = [a, b, c, d].sort(compareEventsForDisplay);
    // Expected: d (high, newest) → b (high, older) → c (normal) → a (low)
    expect(sorted.map((x) => x.id)).toEqual(["d", "b", "c", "a"]);
  });
});

describe("isLiveStatus", () => {
  it("returns true for pending and seen", () => {
    expect(isLiveStatus("pending")).toBe(true);
    expect(isLiveStatus("seen")).toBe(true);
  });

  it("returns false for resolved and superseded", () => {
    expect(isLiveStatus("resolved")).toBe(false);
    expect(isLiveStatus("superseded")).toBe(false);
  });

  it("covers every BuyerEventStatus without throwing", () => {
    const statuses: BuyerEventStatus[] = [
      "pending",
      "seen",
      "resolved",
      "superseded",
    ];
    for (const s of statuses) {
      const result = isLiveStatus(s);
      expect(typeof result).toBe("boolean");
    }
  });
});

describe("ALL_BUYER_EVENT_TYPES", () => {
  it("contains exactly 15 event types", () => {
    expect(ALL_BUYER_EVENT_TYPES.length).toBe(15);
  });

  it("contains no duplicates", () => {
    const set = new Set<BuyerEventType>(ALL_BUYER_EVENT_TYPES);
    expect(set.size).toBe(ALL_BUYER_EVENT_TYPES.length);
  });

  it("includes the core tour, offer, agreement, and comp events", () => {
    expect(ALL_BUYER_EVENT_TYPES).toContain("tour_confirmed");
    expect(ALL_BUYER_EVENT_TYPES).toContain("offer_countered");
    expect(ALL_BUYER_EVENT_TYPES).toContain("agreement_received");
    expect(ALL_BUYER_EVENT_TYPES).toContain("new_comp_arrived");
    expect(ALL_BUYER_EVENT_TYPES).toContain("broker_message");
  });
});

describe("integration — dedupe key behavior for common emit flows", () => {
  it("re-emitting the same tour_reminder produces the same dedupe key", () => {
    const first = makeDedupeKey("tour_reminder", "tour_42");
    const second = makeDedupeKey("tour_reminder", "tour_42");
    expect(first).toBe(second);
    expect(dedupeResolutionFor("tour_reminder")).toBe("bump");
  });

  it("two distinct comps on the same buyer produce two distinct keys", () => {
    const comp1 = makeDedupeKey("new_comp_arrived", "comp_alpha");
    const comp2 = makeDedupeKey("new_comp_arrived", "comp_beta");
    expect(comp1).not.toBe(comp2);
  });

  it("offer_countered and offer_accepted on the same offer produce different keys", () => {
    const countered = makeDedupeKey("offer_countered", "offer_99");
    const accepted = makeDedupeKey("offer_accepted", "offer_99");
    expect(countered).not.toBe(accepted);
  });
});
