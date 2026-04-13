import { describe, it, expect } from "vitest";
import {
  computeOfferEligibility,
  type AgreementSnapshot,
} from "@/lib/dealroom/offer-eligibility-compute";

// ───────────────────────────────────────────────────────────────────────────
// Test helpers
// ───────────────────────────────────────────────────────────────────────────

const DEAL_ROOM_A = "dealroom_a";
const DEAL_ROOM_B = "dealroom_b";
const BUYER = "buyer_1";

function makeAgreement(overrides: Partial<AgreementSnapshot> = {}): AgreementSnapshot {
  return {
    _id: overrides._id ?? `ag_${Math.random().toString(36).slice(2)}`,
    dealRoomId: overrides.dealRoomId ?? DEAL_ROOM_A,
    buyerId: overrides.buyerId ?? BUYER,
    type: overrides.type ?? "full_representation",
    status: overrides.status ?? "signed",
    signedAt: overrides.signedAt,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Happy path — eligible
// ───────────────────────────────────────────────────────────────────────────

describe("computeOfferEligibility — happy path (eligible)", () => {
  it("empty agreements array returns no_signed_agreement ineligible result", () => {
    const result = computeOfferEligibility([], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
      expect(result.requiredAction).toBe("sign_agreement");
      expect(result.currentAgreementType).toBe("none");
      expect(result.governingAgreementId).toBeNull();
    }
  });

  it("single signed full_representation scoped to the deal room → eligible", () => {
    const ag = makeAgreement({
      _id: "ag_full_1",
      type: "full_representation",
      status: "signed",
    });
    const result = computeOfferEligibility([ag], DEAL_ROOM_A);
    expect(result.isEligible).toBe(true);
    if (result.isEligible === true) {
      expect(result.currentAgreementType).toBe("full_representation");
      expect(result.governingAgreementId).toBe("ag_full_1");
      expect(result.blockingReasonCode).toBeNull();
      expect(result.blockingReasonMessage).toBeNull();
      expect(result.requiredAction).toBe("none");
    }
  });

  it("signed full_rep mixed with signed tour_pass → eligible (full_rep wins)", () => {
    const full = makeAgreement({
      _id: "ag_full_winner",
      type: "full_representation",
      status: "signed",
    });
    const tour = makeAgreement({
      _id: "ag_tour_loser",
      type: "tour_pass",
      status: "signed",
    });
    const result = computeOfferEligibility([tour, full], DEAL_ROOM_A);
    expect(result.isEligible).toBe(true);
    if (result.isEligible === true) {
      expect(result.governingAgreementId).toBe("ag_full_winner");
      expect(result.currentAgreementType).toBe("full_representation");
    }
  });

  it("signed full_rep mixed with canceled agreement → still eligible", () => {
    const canceled = makeAgreement({
      _id: "ag_canceled",
      type: "full_representation",
      status: "canceled",
    });
    const full = makeAgreement({
      _id: "ag_current_full",
      type: "full_representation",
      status: "signed",
    });
    const result = computeOfferEligibility([canceled, full], DEAL_ROOM_A);
    expect(result.isEligible).toBe(true);
    if (result.isEligible === true) {
      expect(result.governingAgreementId).toBe("ag_current_full");
    }
  });

  it("signed full_rep + draft + sent + tour_pass → eligible (full_rep beats everything)", () => {
    const agreements: AgreementSnapshot[] = [
      makeAgreement({ _id: "ag_draft", type: "full_representation", status: "draft" }),
      makeAgreement({ _id: "ag_sent", type: "full_representation", status: "sent" }),
      makeAgreement({ _id: "ag_tour", type: "tour_pass", status: "signed" }),
      makeAgreement({ _id: "ag_full", type: "full_representation", status: "signed" }),
    ];
    const result = computeOfferEligibility(agreements, DEAL_ROOM_A);
    expect(result.isEligible).toBe(true);
    if (result.isEligible === true) {
      expect(result.governingAgreementId).toBe("ag_full");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Tour pass only — upgrade path
// ───────────────────────────────────────────────────────────────────────────

describe("computeOfferEligibility — tour pass only (upgrade required)", () => {
  it("single signed tour_pass → ineligible with tour_pass_only_no_full_rep", () => {
    const tour = makeAgreement({
      _id: "ag_tour_only",
      type: "tour_pass",
      status: "signed",
    });
    const result = computeOfferEligibility([tour], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("tour_pass_only_no_full_rep");
      expect(result.requiredAction).toBe("upgrade_to_full_rep");
      expect(result.currentAgreementType).toBe("tour_pass");
      expect(result.governingAgreementId).toBe("ag_tour_only");
      expect(result.blockingReasonMessage).toContain("Tour Pass");
    }
  });

  it("signed tour_pass + draft full_rep → still ineligible (draft doesn't count)", () => {
    const tour = makeAgreement({
      _id: "ag_tour",
      type: "tour_pass",
      status: "signed",
    });
    const draftFull = makeAgreement({
      _id: "ag_draft_full",
      type: "full_representation",
      status: "draft",
    });
    const result = computeOfferEligibility([tour, draftFull], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("tour_pass_only_no_full_rep");
      expect(result.requiredAction).toBe("upgrade_to_full_rep");
    }
  });

  it("signed tour_pass + sent full_rep → still ineligible (sent != signed)", () => {
    const tour = makeAgreement({
      _id: "ag_tour",
      type: "tour_pass",
      status: "signed",
    });
    const sentFull = makeAgreement({
      _id: "ag_sent_full",
      type: "full_representation",
      status: "sent",
    });
    const result = computeOfferEligibility([tour, sentFull], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("tour_pass_only_no_full_rep");
      expect(result.requiredAction).toBe("upgrade_to_full_rep");
      expect(result.currentAgreementType).toBe("tour_pass");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// No signed agreement (drafts/sent only)
// ───────────────────────────────────────────────────────────────────────────

describe("computeOfferEligibility — no signed agreement", () => {
  it("only a draft full_representation → no_signed_agreement", () => {
    const draft = makeAgreement({
      _id: "ag_draft",
      type: "full_representation",
      status: "draft",
    });
    const result = computeOfferEligibility([draft], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
      expect(result.requiredAction).toBe("sign_agreement");
      expect(result.currentAgreementType).toBe("none");
      expect(result.governingAgreementId).toBeNull();
    }
  });

  it("only a sent full_representation → no_signed_agreement", () => {
    const sent = makeAgreement({
      _id: "ag_sent",
      type: "full_representation",
      status: "sent",
    });
    const result = computeOfferEligibility([sent], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
      expect(result.governingAgreementId).toBeNull();
    }
  });

  it("mix of draft + sent for both types → no_signed_agreement", () => {
    const agreements: AgreementSnapshot[] = [
      makeAgreement({ type: "tour_pass", status: "draft" }),
      makeAgreement({ type: "tour_pass", status: "sent" }),
      makeAgreement({ type: "full_representation", status: "draft" }),
      makeAgreement({ type: "full_representation", status: "sent" }),
    ];
    const result = computeOfferEligibility(agreements, DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
      expect(result.requiredAction).toBe("sign_agreement");
    }
  });

  it("only a draft tour_pass → no_signed_agreement (not tour_pass upgrade)", () => {
    const draftTour = makeAgreement({
      _id: "ag_draft_tour",
      type: "tour_pass",
      status: "draft",
    });
    const result = computeOfferEligibility([draftTour], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Canceled / replaced state
// ───────────────────────────────────────────────────────────────────────────

describe("computeOfferEligibility — canceled / replaced state", () => {
  it("only a canceled full_representation → agreement_canceled", () => {
    const canceled = makeAgreement({
      _id: "ag_canceled_solo",
      type: "full_representation",
      status: "canceled",
    });
    const result = computeOfferEligibility([canceled], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("agreement_canceled");
      expect(result.requiredAction).toBe("sign_agreement");
      expect(result.currentAgreementType).toBe("none");
      expect(result.governingAgreementId).toBe("ag_canceled_solo");
      expect(result.blockingReasonMessage).toContain("canceled");
    }
  });

  it("only a canceled tour_pass → agreement_canceled", () => {
    const canceled = makeAgreement({
      _id: "ag_canceled_tour",
      type: "tour_pass",
      status: "canceled",
    });
    const result = computeOfferEligibility([canceled], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("agreement_canceled");
      expect(result.governingAgreementId).toBe("ag_canceled_tour");
    }
  });

  it("replaced agreement with no pending successor → agreement_replaced_pending_new", () => {
    const replaced = makeAgreement({
      _id: "ag_replaced_alone",
      type: "full_representation",
      status: "replaced",
    });
    const result = computeOfferEligibility([replaced], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("agreement_replaced_pending_new");
      expect(result.requiredAction).toBe("sign_agreement");
      expect(result.currentAgreementType).toBe("none");
      expect(result.governingAgreementId).toBe("ag_replaced_alone");
      expect(result.blockingReasonMessage).toContain("replaced");
    }
  });

  it("replaced agreement + draft successor → falls through to no_signed_agreement", () => {
    const replaced = makeAgreement({
      _id: "ag_replaced",
      type: "full_representation",
      status: "replaced",
    });
    const pending = makeAgreement({
      _id: "ag_pending_draft",
      type: "full_representation",
      status: "draft",
    });
    const result = computeOfferEligibility([replaced, pending], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      // Pending successor exists → fall through to no_signed_agreement
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
      expect(result.requiredAction).toBe("sign_agreement");
      expect(result.governingAgreementId).toBeNull();
    }
  });

  it("replaced agreement + sent successor → falls through to no_signed_agreement", () => {
    const replaced = makeAgreement({
      _id: "ag_replaced",
      type: "full_representation",
      status: "replaced",
    });
    const pending = makeAgreement({
      _id: "ag_pending_sent",
      type: "full_representation",
      status: "sent",
    });
    const result = computeOfferEligibility([replaced, pending], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
    }
  });

  it("canceled agreement + another draft → NOT agreement_canceled (has other live things)", () => {
    const canceled = makeAgreement({
      _id: "ag_cancel",
      type: "full_representation",
      status: "canceled",
    });
    const draft = makeAgreement({
      _id: "ag_draft_new",
      type: "full_representation",
      status: "draft",
    });
    const result = computeOfferEligibility([canceled, draft], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      // Has a draft → hasAnythingElse is true → falls through to no_signed_agreement
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Stale / changed-agreement state transitions
// ───────────────────────────────────────────────────────────────────────────

describe("computeOfferEligibility — stale / changed agreement transitions", () => {
  it("signed tour_pass then signed full_rep added → eligible (full_rep wins)", () => {
    const oldTour = makeAgreement({
      _id: "ag_old_tour",
      type: "tour_pass",
      status: "signed",
    });
    const newFull = makeAgreement({
      _id: "ag_new_full",
      type: "full_representation",
      status: "signed",
    });
    const result = computeOfferEligibility([oldTour, newFull], DEAL_ROOM_A);
    expect(result.isEligible).toBe(true);
    if (result.isEligible === true) {
      expect(result.governingAgreementId).toBe("ag_new_full");
      expect(result.currentAgreementType).toBe("full_representation");
    }
  });

  it("signed full_rep then canceled full_rep then new signed tour_pass → ineligible tour_pass_only", () => {
    // Note: the canceled full_rep doesn't matter because there's a signed tour_pass
    // and no other signed full_rep — decision order puts tour_pass check before canceled.
    const canceledFull = makeAgreement({
      _id: "ag_old_full_canceled",
      type: "full_representation",
      status: "canceled",
    });
    const newTour = makeAgreement({
      _id: "ag_new_tour",
      type: "tour_pass",
      status: "signed",
    });
    const result = computeOfferEligibility([canceledFull, newTour], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("tour_pass_only_no_full_rep");
      expect(result.requiredAction).toBe("upgrade_to_full_rep");
      expect(result.governingAgreementId).toBe("ag_new_tour");
    }
  });

  it("replaced tour_pass + signed full_rep → eligible (full_rep wins even over replaced state)", () => {
    const replacedTour = makeAgreement({
      _id: "ag_replaced_tour",
      type: "tour_pass",
      status: "replaced",
    });
    const newFull = makeAgreement({
      _id: "ag_new_full",
      type: "full_representation",
      status: "signed",
    });
    const result = computeOfferEligibility([replacedTour, newFull], DEAL_ROOM_A);
    expect(result.isEligible).toBe(true);
    if (result.isEligible === true) {
      expect(result.governingAgreementId).toBe("ag_new_full");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wrong deal room filtering
// ───────────────────────────────────────────────────────────────────────────

describe("computeOfferEligibility — deal room filtering", () => {
  it("signed full_rep on a different deal room → ignored, as if no agreement", () => {
    const otherRoomFull = makeAgreement({
      _id: "ag_other_room",
      dealRoomId: DEAL_ROOM_B,
      type: "full_representation",
      status: "signed",
    });
    const result = computeOfferEligibility([otherRoomFull], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
      expect(result.governingAgreementId).toBeNull();
    }
  });

  it("mix of current and other deal room — only current counts", () => {
    const currentFull = makeAgreement({
      _id: "ag_current",
      dealRoomId: DEAL_ROOM_A,
      type: "full_representation",
      status: "signed",
    });
    const otherTour = makeAgreement({
      _id: "ag_other",
      dealRoomId: DEAL_ROOM_B,
      type: "tour_pass",
      status: "canceled",
    });
    const result = computeOfferEligibility([currentFull, otherTour], DEAL_ROOM_A);
    expect(result.isEligible).toBe(true);
    if (result.isEligible === true) {
      expect(result.governingAgreementId).toBe("ag_current");
    }
  });

  it("only other deal room signed tour_pass, current has nothing → no_signed_agreement", () => {
    const otherTour = makeAgreement({
      _id: "ag_other_tour",
      dealRoomId: DEAL_ROOM_B,
      type: "tour_pass",
      status: "signed",
    });
    const result = computeOfferEligibility([otherTour], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
    }
  });

  it("empty dealRoomId string → no matching agreements → ineligible", () => {
    const ag = makeAgreement({
      type: "full_representation",
      status: "signed",
      dealRoomId: DEAL_ROOM_A,
    });
    const result = computeOfferEligibility([ag], "");
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("no_signed_agreement");
      expect(result.governingAgreementId).toBeNull();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Return shape / discriminated union narrowing
// ───────────────────────────────────────────────────────────────────────────

describe("computeOfferEligibility — return shape", () => {
  it("eligible result has correct shape (blockingReason fields null, requiredAction='none')", () => {
    const full = makeAgreement({
      _id: "ag_eligible_shape",
      type: "full_representation",
      status: "signed",
    });
    const result = computeOfferEligibility([full], DEAL_ROOM_A);
    expect(result).toMatchObject({
      isEligible: true,
      currentAgreementType: "full_representation",
      governingAgreementId: "ag_eligible_shape",
      blockingReasonCode: null,
      blockingReasonMessage: null,
      requiredAction: "none",
    });
  });

  it("ineligible result has non-empty blockingReasonMessage and allowed requiredAction values", () => {
    const validActions = new Set(["sign_agreement", "upgrade_to_full_rep"]);
    const validCodes = new Set([
      "no_signed_agreement",
      "tour_pass_only_no_full_rep",
      "agreement_canceled",
      "agreement_replaced_pending_new",
    ]);

    // Check each blocking path produces a valid shape
    const cases: { agreements: AgreementSnapshot[]; label: string }[] = [
      { agreements: [], label: "empty" },
      {
        agreements: [makeAgreement({ type: "tour_pass", status: "signed" })],
        label: "tour_pass_only",
      },
      {
        agreements: [makeAgreement({ type: "full_representation", status: "canceled" })],
        label: "canceled",
      },
      {
        agreements: [makeAgreement({ type: "full_representation", status: "replaced" })],
        label: "replaced",
      },
      {
        agreements: [makeAgreement({ type: "full_representation", status: "draft" })],
        label: "draft_only",
      },
    ];

    for (const c of cases) {
      const result = computeOfferEligibility(c.agreements, DEAL_ROOM_A);
      expect(result.isEligible, c.label).toBe(false);
      if (result.isEligible === false) {
        expect(validCodes.has(result.blockingReasonCode), c.label).toBe(true);
        expect(validActions.has(result.requiredAction), c.label).toBe(true);
        expect(typeof result.blockingReasonMessage).toBe("string");
        expect(result.blockingReasonMessage.length, c.label).toBeGreaterThan(0);
      }
    }
  });

  it("eligible governingAgreementId is a string (not null)", () => {
    const full = makeAgreement({
      _id: "ag_string_id",
      type: "full_representation",
      status: "signed",
    });
    const result = computeOfferEligibility([full], DEAL_ROOM_A);
    if (result.isEligible === true) {
      expect(typeof result.governingAgreementId).toBe("string");
      expect(result.governingAgreementId.length).toBeGreaterThan(0);
    } else {
      throw new Error("expected eligible result");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Edge cases
// ───────────────────────────────────────────────────────────────────────────

describe("computeOfferEligibility — edge cases", () => {
  it("multiple signed full_rep → picks one deterministically (first match wins)", () => {
    const first = makeAgreement({
      _id: "ag_first",
      type: "full_representation",
      status: "signed",
    });
    const second = makeAgreement({
      _id: "ag_second",
      type: "full_representation",
      status: "signed",
    });
    const result = computeOfferEligibility([first, second], DEAL_ROOM_A);
    expect(result.isEligible).toBe(true);
    if (result.isEligible === true) {
      // .find() returns the first matching element
      expect(result.governingAgreementId).toBe("ag_first");
    }
  });

  it("buyerId mismatch is NOT filtered out (compute filters only by dealRoomId)", () => {
    const otherBuyerSignedFull = makeAgreement({
      _id: "ag_other_buyer",
      buyerId: "buyer_other",
      type: "full_representation",
      status: "signed",
      dealRoomId: DEAL_ROOM_A,
    });
    const result = computeOfferEligibility([otherBuyerSignedFull], DEAL_ROOM_A);
    // Per spec, the compute helper filters by dealRoomId only — caller is
    // expected to pass a buyer-scoped array. Mismatched buyers are included.
    expect(result.isEligible).toBe(true);
    if (result.isEligible === true) {
      expect(result.governingAgreementId).toBe("ag_other_buyer");
    }
  });

  it("multiple signed tour_pass (no full_rep) → returns tour_pass_only with first match", () => {
    const t1 = makeAgreement({
      _id: "ag_tour_first",
      type: "tour_pass",
      status: "signed",
    });
    const t2 = makeAgreement({
      _id: "ag_tour_second",
      type: "tour_pass",
      status: "signed",
    });
    const result = computeOfferEligibility([t1, t2], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      expect(result.blockingReasonCode).toBe("tour_pass_only_no_full_rep");
      expect(result.governingAgreementId).toBe("ag_tour_first");
    }
  });

  it("does not mutate the input agreements array", () => {
    const agreements: AgreementSnapshot[] = [
      makeAgreement({ _id: "ag_a", type: "tour_pass", status: "draft" }),
      makeAgreement({ _id: "ag_b", type: "full_representation", status: "signed" }),
    ];
    const snapshot = JSON.parse(JSON.stringify(agreements));
    computeOfferEligibility(agreements, DEAL_ROOM_A);
    expect(agreements).toEqual(snapshot);
  });

  it("is pure — same input yields same output across calls", () => {
    const agreements: AgreementSnapshot[] = [
      makeAgreement({ _id: "ag_stable", type: "full_representation", status: "signed" }),
    ];
    const first = computeOfferEligibility(agreements, DEAL_ROOM_A);
    const second = computeOfferEligibility(agreements, DEAL_ROOM_A);
    expect(first).toEqual(second);
  });

  it("tour_pass canceled + full_rep replaced (no pending) → agreement_replaced_pending_new", () => {
    // No signed anything, but a replaced full_rep is found before the canceled path.
    // Replaced is checked at step 3, canceled at step 4 — replaced wins here only if
    // there's no pending successor.
    const canceledTour = makeAgreement({
      _id: "ag_cancel_tour",
      type: "tour_pass",
      status: "canceled",
    });
    const replacedFull = makeAgreement({
      _id: "ag_replaced_full",
      type: "full_representation",
      status: "replaced",
    });
    const result = computeOfferEligibility([canceledTour, replacedFull], DEAL_ROOM_A);
    expect(result.isEligible).toBe(false);
    if (result.isEligible === false) {
      // Step 3 (replaced without pending successor) wins before step 4 (canceled)
      expect(result.blockingReasonCode).toBe("agreement_replaced_pending_new");
      expect(result.governingAgreementId).toBe("ag_replaced_full");
    }
  });
});
