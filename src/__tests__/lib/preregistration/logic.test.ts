import { describe, it, expect } from "vitest";
import {
  validateAndNormalize,
  resolveDuplicate,
  canTransition,
  applyConversion,
  computeMetrics,
} from "@/lib/preregistration/logic";
import type {
  PreregistrationFormInput,
  VisitorPreregistration,
} from "@/lib/preregistration/types";

// MARK: - Fixtures

function makeFormInput(
  overrides: Partial<PreregistrationFormInput> = {}
): PreregistrationFormInput {
  return {
    propertyId: "prop_123",
    eventStartAt: "2026-04-18T14:00:00.000Z",
    eventEndAt: "2026-04-18T16:00:00.000Z",
    visitorName: "Jane Buyer",
    visitorEmail: "jane@example.com",
    partySize: 2,
    ...overrides,
  };
}

function makeRecord(
  overrides: Partial<VisitorPreregistration> = {}
): VisitorPreregistration {
  return {
    id: "rec_1",
    propertyId: "prop_123",
    eventStartAt: "2026-04-18T14:00:00.000Z",
    eventEndAt: "2026-04-18T16:00:00.000Z",
    visitorName: "Jane Buyer",
    visitorEmail: "jane@example.com",
    partySize: 2,
    status: "created",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    ...overrides,
  };
}

// MARK: - validateAndNormalize

describe("validateAndNormalize", () => {
  it("accepts a complete valid input", () => {
    const result = validateAndNormalize(makeFormInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.visitorEmail).toBe("jane@example.com");
    }
  });

  it("lowercases and trims email", () => {
    const result = validateAndNormalize(
      makeFormInput({ visitorEmail: "  JANE@EXAMPLE.COM  " })
    );
    if (result.ok) {
      expect(result.normalized.visitorEmail).toBe("jane@example.com");
    }
  });

  it("trims visitor name", () => {
    const result = validateAndNormalize(
      makeFormInput({ visitorName: "  Jane  " })
    );
    if (result.ok) {
      expect(result.normalized.visitorName).toBe("Jane");
    }
  });

  it("treats empty visitorPhone as undefined", () => {
    const result = validateAndNormalize(
      makeFormInput({ visitorPhone: "   " })
    );
    if (result.ok) {
      expect(result.normalized.visitorPhone).toBeUndefined();
    }
  });

  it("preserves non-empty visitorPhone trimmed", () => {
    const result = validateAndNormalize(
      makeFormInput({ visitorPhone: "  +1-305-555-1234  " })
    );
    if (result.ok) {
      expect(result.normalized.visitorPhone).toBe("+1-305-555-1234");
    }
  });

  it("floors fractional partySize", () => {
    const result = validateAndNormalize(
      makeFormInput({ partySize: 2.7 })
    );
    if (result.ok) {
      expect(result.normalized.partySize).toBe(2);
    }
  });

  it("rejects missing propertyId", () => {
    const result = validateAndNormalize(makeFormInput({ propertyId: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "missingField" && e.field === "propertyId"
        )
      ).toBe(true);
    }
  });

  it("rejects missing visitorName", () => {
    const result = validateAndNormalize(makeFormInput({ visitorName: "" }));
    expect(result.ok).toBe(false);
  });

  it("rejects empty email", () => {
    const result = validateAndNormalize(makeFormInput({ visitorEmail: "" }));
    expect(result.ok).toBe(false);
  });

  it("rejects malformed email", () => {
    const result = validateAndNormalize(
      makeFormInput({ visitorEmail: "not-an-email" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "invalidEmail")
      ).toBe(true);
    }
  });

  it("rejects partySize < 1", () => {
    const result = validateAndNormalize(makeFormInput({ partySize: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "invalidPartySize")
      ).toBe(true);
    }
  });

  it("rejects partySize > 10", () => {
    const result = validateAndNormalize(makeFormInput({ partySize: 11 }));
    expect(result.ok).toBe(false);
  });

  it("rejects NaN partySize", () => {
    const result = validateAndNormalize(
      makeFormInput({ partySize: NaN })
    );
    expect(result.ok).toBe(false);
  });

  it("rejects event window where start >= end", () => {
    const result = validateAndNormalize(
      makeFormInput({
        eventStartAt: "2026-04-18T16:00:00.000Z",
        eventEndAt: "2026-04-18T16:00:00.000Z",
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "invalidEventWindow")
      ).toBe(true);
    }
  });

  it("collects multiple errors at once", () => {
    const result = validateAndNormalize(
      makeFormInput({
        visitorName: "",
        visitorEmail: "bad",
        partySize: -1,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// MARK: - resolveDuplicate

describe("resolveDuplicate", () => {
  it("returns newRegistration when no existing records match", () => {
    const decision = resolveDuplicate([], makeFormInput());
    expect(decision.kind).toBe("newRegistration");
  });

  it("returns newRegistration when property differs", () => {
    const existing = [makeRecord({ propertyId: "prop_other" })];
    const decision = resolveDuplicate(existing, makeFormInput());
    expect(decision.kind).toBe("newRegistration");
  });

  it("returns newRegistration when event window differs", () => {
    const existing = [
      makeRecord({ eventStartAt: "2026-04-25T14:00:00.000Z" }),
    ];
    const decision = resolveDuplicate(existing, makeFormInput());
    expect(decision.kind).toBe("newRegistration");
  });

  it("returns updateExisting when a matching created record exists", () => {
    const existing = [makeRecord({ status: "created" })];
    const decision = resolveDuplicate(existing, makeFormInput());
    expect(decision.kind).toBe("updateExisting");
    if (decision.kind === "updateExisting") {
      expect(decision.existingId).toBe("rec_1");
    }
  });

  it("returns updateExisting when a matching reminded record exists", () => {
    const existing = [makeRecord({ status: "reminded" })];
    const decision = resolveDuplicate(existing, makeFormInput());
    expect(decision.kind).toBe("updateExisting");
  });

  it("returns blockedByConversion when a prior converted record exists", () => {
    const existing = [
      makeRecord({
        status: "converted",
        conversion: {
          kind: "buyer_agreement_signed",
          targetRefId: "agr_1",
          convertedAt: "2026-04-13T00:00:00.000Z",
        },
      }),
    ];
    const decision = resolveDuplicate(existing, makeFormInput());
    expect(decision.kind).toBe("blockedByConversion");
    if (decision.kind === "blockedByConversion") {
      expect(decision.conversionKind).toBe("buyer_agreement_signed");
    }
  });

  it("blockedByConversion takes priority over updateExisting", () => {
    const existing = [
      makeRecord({ id: "rec_created", status: "created" }),
      makeRecord({
        id: "rec_converted",
        status: "converted",
        conversion: {
          kind: "deal_room_created",
          targetRefId: "dr_1",
          convertedAt: "2026-04-13T00:00:00.000Z",
        },
      }),
    ];
    const decision = resolveDuplicate(existing, makeFormInput());
    expect(decision.kind).toBe("blockedByConversion");
  });

  it("returns newRegistration when only canceled/attended/noShow matches exist", () => {
    const existing = [
      makeRecord({ id: "rec_canceled", status: "canceled" }),
      makeRecord({ id: "rec_attended", status: "attended" }),
      makeRecord({ id: "rec_noshow", status: "noShow" }),
    ];
    const decision = resolveDuplicate(existing, makeFormInput());
    expect(decision.kind).toBe("newRegistration");
  });

  it("normalizes email matching case-sensitively (caller must lowercase)", () => {
    const existing = [makeRecord({ visitorEmail: "jane@example.com" })];
    // Input has lowercased email — should match
    const decision = resolveDuplicate(existing, makeFormInput());
    expect(decision.kind).toBe("updateExisting");
  });
});

// MARK: - canTransition

describe("canTransition", () => {
  it("allows created → reminded/attended/noShow/converted/canceled", () => {
    expect(canTransition("created", "reminded")).toBe(true);
    expect(canTransition("created", "attended")).toBe(true);
    expect(canTransition("created", "noShow")).toBe(true);
    expect(canTransition("created", "converted")).toBe(true);
    expect(canTransition("created", "canceled")).toBe(true);
  });

  it("allows reminded → attended/noShow/converted/canceled", () => {
    expect(canTransition("reminded", "attended")).toBe(true);
    expect(canTransition("reminded", "converted")).toBe(true);
    expect(canTransition("reminded", "canceled")).toBe(true);
  });

  it("forbids going back to created", () => {
    expect(canTransition("reminded", "created")).toBe(false);
    expect(canTransition("attended", "created")).toBe(false);
  });

  it("allows attended → converted (late conversion)", () => {
    expect(canTransition("attended", "converted")).toBe(true);
  });

  it("allows noShow → converted (late conversion)", () => {
    expect(canTransition("noShow", "converted")).toBe(true);
  });

  it("terminal states (converted, canceled) reject all transitions", () => {
    expect(canTransition("converted", "created")).toBe(false);
    expect(canTransition("converted", "attended")).toBe(false);
    expect(canTransition("canceled", "created")).toBe(false);
    expect(canTransition("canceled", "converted")).toBe(false);
  });

  it("attended and noShow cannot be canceled (codex PR #55 regression)", () => {
    // Codex P2 finding: the Convex `cancel` mutation used to allow
    // attended → canceled and noShow → canceled, diverging from this
    // pure state machine. Both the mutation and this guard must
    // reject the retroactive cancel — attended/noShow are attendance
    // states that can only forward-transition to converted.
    expect(canTransition("attended", "canceled")).toBe(false);
    expect(canTransition("noShow", "canceled")).toBe(false);
  });
});

// MARK: - applyConversion

describe("applyConversion", () => {
  it("produces a converted record with the conversion payload", () => {
    const record = makeRecord({ status: "created" });
    const updated = applyConversion(record, {
      kind: "buyer_agreement_signed",
      targetRefId: "agr_xyz",
      now: "2026-04-20T12:00:00.000Z",
    });
    expect(updated.status).toBe("converted");
    expect(updated.conversion?.kind).toBe("buyer_agreement_signed");
    expect(updated.conversion?.targetRefId).toBe("agr_xyz");
    expect(updated.conversion?.convertedAt).toBe("2026-04-20T12:00:00.000Z");
    expect(updated.updatedAt).toBe("2026-04-20T12:00:00.000Z");
  });

  it("works from attended → converted", () => {
    const record = makeRecord({ status: "attended" });
    const updated = applyConversion(record, {
      kind: "private_tour_requested",
      targetRefId: "tour_1",
      now: "2026-04-21T10:00:00.000Z",
    });
    expect(updated.status).toBe("converted");
  });

  it("throws when source state is terminal (converted)", () => {
    const record = makeRecord({
      status: "converted",
      conversion: {
        kind: "deal_room_created",
        targetRefId: "dr_1",
        convertedAt: "2026-04-20T00:00:00.000Z",
      },
    });
    expect(() =>
      applyConversion(record, {
        kind: "buyer_agreement_signed",
        targetRefId: "agr_2",
        now: "2026-04-21T00:00:00.000Z",
      })
    ).toThrow(/transition not allowed/);
  });

  it("throws when source state is canceled", () => {
    const record = makeRecord({ status: "canceled" });
    expect(() =>
      applyConversion(record, {
        kind: "deal_room_created",
        targetRefId: "dr_1",
        now: "2026-04-21T00:00:00.000Z",
      })
    ).toThrow();
  });

  it("does not mutate the source record", () => {
    const record = makeRecord({ status: "created" });
    const snapshot = JSON.stringify(record);
    applyConversion(record, {
      kind: "deal_room_created",
      targetRefId: "dr_1",
      now: "2026-04-20T00:00:00.000Z",
    });
    expect(JSON.stringify(record)).toBe(snapshot);
  });
});

// MARK: - computeMetrics

describe("computeMetrics", () => {
  it("returns zeros for empty input", () => {
    const metrics = computeMetrics([]);
    expect(metrics.total).toBe(0);
    expect(metrics.conversionRate).toBe(0);
    expect(metrics.attendanceRate).toBe(0);
  });

  it("counts each status correctly", () => {
    const records: VisitorPreregistration[] = [
      makeRecord({ id: "a", status: "created" }),
      makeRecord({ id: "b", status: "reminded" }),
      makeRecord({ id: "c", status: "attended" }),
      makeRecord({ id: "d", status: "attended" }),
      makeRecord({ id: "e", status: "noShow" }),
      makeRecord({
        id: "f",
        status: "converted",
        conversion: {
          kind: "buyer_agreement_signed",
          targetRefId: "agr_1",
          convertedAt: "2026-04-20T00:00:00.000Z",
        },
      }),
      makeRecord({ id: "g", status: "canceled" }),
    ];
    const metrics = computeMetrics(records);
    expect(metrics.total).toBe(7);
    expect(metrics.created).toBe(1);
    expect(metrics.reminded).toBe(1);
    expect(metrics.attended).toBe(2);
    expect(metrics.noShow).toBe(1);
    expect(metrics.converted).toBe(1);
    expect(metrics.canceled).toBe(1);
  });

  it("computes conversion rate as converted / total", () => {
    const records: VisitorPreregistration[] = [
      makeRecord({
        id: "a",
        status: "converted",
        conversion: {
          kind: "deal_room_created",
          targetRefId: "dr_1",
          convertedAt: "2026-04-20T00:00:00.000Z",
        },
      }),
      makeRecord({ id: "b", status: "attended" }),
      makeRecord({ id: "c", status: "created" }),
      makeRecord({ id: "d", status: "created" }),
    ];
    const metrics = computeMetrics(records);
    expect(metrics.conversionRate).toBe(0.25);
  });

  it("computes attendance rate as attended / (attended + noShow)", () => {
    const records: VisitorPreregistration[] = [
      makeRecord({ id: "a", status: "attended" }),
      makeRecord({ id: "b", status: "attended" }),
      makeRecord({ id: "c", status: "attended" }),
      makeRecord({ id: "d", status: "noShow" }),
    ];
    const metrics = computeMetrics(records);
    expect(metrics.attendanceRate).toBe(0.75);
  });

  it("attendance rate is 0 when no attendance data yet", () => {
    const records: VisitorPreregistration[] = [
      makeRecord({ id: "a", status: "created" }),
      makeRecord({ id: "b", status: "reminded" }),
    ];
    const metrics = computeMetrics(records);
    expect(metrics.attendanceRate).toBe(0);
  });
});
