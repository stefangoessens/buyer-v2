// ═══════════════════════════════════════════════════════════════════════════
// Offer Eligibility Computation (KIN-822) — CONVEX MIRROR
//
// This file is a hand-maintained mirror of
// `src/lib/dealroom/offer-eligibility-compute.ts`. Convex's tsconfig cannot
// import modules from `../src`, so the pure computation logic has to live
// twice: once for the Next.js app, once for Convex functions.
//
// RULES:
//   - Any change here MUST be mirrored in src/lib/dealroom/offer-eligibility-compute.ts
//   - Any change there MUST be mirrored here
//   - Keep the module small — ideally the only thing that ever changes is
//     the ordered list of blocking reasons and their messages
//   - The exported shapes (types + function signature) are identical
//
// The module is pure: no DB, no auth, no time-dependent logic. Good for
// unit tests and for use from both query and mutation handlers.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal snapshot of an agreement row used by the eligibility computation.
 * Matches the shape of the Convex `agreements` table but keeps all ids as
 * plain strings so the helper is usable from any runtime.
 */
export interface AgreementSnapshot {
  _id: string;
  dealRoomId: string;
  buyerId: string;
  type: "tour_pass" | "full_representation";
  status: "draft" | "sent" | "signed" | "canceled" | "replaced";
  signedAt?: string;
}

/**
 * Machine-readable blocking reason codes. Mirrored in the Convex validator
 * `eligibilityBlockingReason` in `convex/lib/validators.ts` — keep in sync.
 *
 * The two "environmental" reasons — `buyer_not_found` and `not_authenticated`
 * — are intentionally NOT emitted by the pure compute helper. They describe
 * caller-side conditions (no session, no buyer record) that the compute
 * function cannot observe from an agreements array. The Convex query layer
 * adds them when wrapping the compute result.
 */
export type BlockingReasonCode =
  | "no_signed_agreement"
  | "tour_pass_only_no_full_rep"
  | "agreement_canceled"
  | "agreement_replaced_pending_new";

/**
 * Result of `computeOfferEligibility`. Discriminated by `isEligible` so the
 * caller gets a narrowed type without optional chaining: if `isEligible` is
 * true, `blockingReasonCode` is null and `governingAgreementId` is set; if
 * false, `blockingReasonCode` and `blockingReasonMessage` are set.
 */
export type EligibilityComputation =
  | {
      isEligible: true;
      currentAgreementType: "full_representation";
      governingAgreementId: string;
      blockingReasonCode: null;
      blockingReasonMessage: null;
      requiredAction: "none";
    }
  | {
      isEligible: false;
      currentAgreementType: "none" | "tour_pass" | "full_representation";
      governingAgreementId: string | null;
      blockingReasonCode: BlockingReasonCode;
      blockingReasonMessage: string;
      requiredAction: "sign_agreement" | "upgrade_to_full_rep";
    };

/**
 * Compute offer eligibility for a buyer on a given deal room from a list of
 * agreements. Pure function — no DB, no auth, no time-dependent logic.
 *
 * Decision order:
 *   1. Any signed `full_representation` scoped to this deal room → eligible.
 *   2. Any signed `tour_pass` scoped to this deal room → not eligible,
 *      `tour_pass_only_no_full_rep` (upgrade path).
 *   3. A `replaced` agreement with no pending successor in draft/sent state
 *      → `agreement_replaced_pending_new`.
 *   4. A `canceled` agreement with nothing else live → `agreement_canceled`.
 *   5. Otherwise → `no_signed_agreement`.
 */
export function computeOfferEligibility(
  agreements: AgreementSnapshot[],
  dealRoomId: string
): EligibilityComputation {
  // Scope to this deal room only — callers may pass a buyer-wide collection.
  const scoped = agreements.filter((a) => a.dealRoomId === dealRoomId);

  // 1. Signed full representation trumps everything.
  const signedFullRep = scoped.find(
    (a) => a.type === "full_representation" && a.status === "signed"
  );
  if (signedFullRep) {
    return {
      isEligible: true,
      currentAgreementType: "full_representation",
      governingAgreementId: signedFullRep._id,
      blockingReasonCode: null,
      blockingReasonMessage: null,
      requiredAction: "none",
    };
  }

  // 2. Signed tour pass — not offer-eligible, upgrade required.
  const signedTourPass = scoped.find(
    (a) => a.type === "tour_pass" && a.status === "signed"
  );
  if (signedTourPass) {
    return {
      isEligible: false,
      currentAgreementType: "tour_pass",
      governingAgreementId: signedTourPass._id,
      blockingReasonCode: "tour_pass_only_no_full_rep",
      blockingReasonMessage:
        "Tour Pass signed. Upgrade to Full Representation required to make offers.",
      requiredAction: "upgrade_to_full_rep",
    };
  }

  // 3. Replaced agreement with no pending successor — we're mid-transition.
  const replaced = scoped.find((a) => a.status === "replaced");
  if (replaced) {
    const pendingSuccessor = scoped.find(
      (a) => a.status === "draft" || a.status === "sent"
    );
    if (!pendingSuccessor) {
      return {
        isEligible: false,
        currentAgreementType: "none",
        governingAgreementId: replaced._id,
        blockingReasonCode: "agreement_replaced_pending_new",
        blockingReasonMessage:
          "Previous agreement was replaced but no new agreement is in progress yet.",
        requiredAction: "sign_agreement",
      };
    }
    // If there IS a pending successor, fall through to the generic
    // no_signed_agreement reason below — the buyer still can't make offers,
    // but the message should focus on the fact that nothing is signed yet.
  }

  // 4. Canceled with nothing else live.
  const canceled = scoped.find((a) => a.status === "canceled");
  const hasAnythingElse = scoped.some(
    (a) =>
      a._id !== canceled?._id &&
      (a.status === "draft" ||
        a.status === "sent" ||
        a.status === "signed" ||
        a.status === "replaced")
  );
  if (canceled && !hasAnythingElse) {
    return {
      isEligible: false,
      currentAgreementType: "none",
      governingAgreementId: canceled._id,
      blockingReasonCode: "agreement_canceled",
      blockingReasonMessage:
        "Most recent agreement was canceled. A new Full Representation agreement must be signed.",
      requiredAction: "sign_agreement",
    };
  }

  // 5. Default — nothing on file (or only drafts/sent that haven't closed).
  return {
    isEligible: false,
    currentAgreementType: "none",
    governingAgreementId: null,
    blockingReasonCode: "no_signed_agreement",
    blockingReasonMessage:
      "No signed agreement found. Sign a Full Representation agreement to make offers.",
    requiredAction: "sign_agreement",
  };
}
