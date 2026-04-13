import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getSessionContext, requireAuth } from "./lib/session";
import {
  eligibilityAgreementType,
  eligibilityBlockingReason,
  eligibilityRequiredAction,
} from "./lib/validators";
import {
  computeOfferEligibility,
  type AgreementSnapshot,
  type EligibilityComputation,
} from "./lib/offerEligibilityCompute";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { applySupersessionState } from "./agreementSupersession";

// ═══════════════════════════════════════════════════════════════════════════
// Offer Eligibility (KIN-822 + KIN-834)
//
// The public `checkEligibility` query is the original surface used by the
// dashboard and offer-start flows. It reads the auth session, loads the
// buyer's agreements, and returns a compact eligibility verdict. It was
// added in KIN-834 and MUST keep its signature stable.
//
// KIN-822 adds a persisted `offerEligibilityState` table — a denormalized
// snapshot of the latest computed verdict for a (buyer, dealRoom) pair — so
// other systems (offer mutations, AI engines, broker dashboards) can read
// eligibility in one indexed lookup, and so we get an audit trail whenever
// eligibility changes. The shared computation lives in
// `convex/lib/offerEligibilityCompute.ts` and is mirrored in
// `src/lib/dealroom/offer-eligibility-compute.ts`.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Persisted state object validator (shared by query + mutation returns) ─

const persistedStateValidator = v.object({
  _id: v.id("offerEligibilityState"),
  _creationTime: v.number(),
  buyerId: v.id("users"),
  dealRoomId: v.id("dealRooms"),
  isEligible: v.boolean(),
  currentAgreementType: eligibilityAgreementType,
  governingAgreementId: v.optional(v.id("agreements")),
  blockingReasonCode: v.optional(eligibilityBlockingReason),
  blockingReasonMessage: v.optional(v.string()),
  requiredAction: eligibilityRequiredAction,
  computedAt: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
});

// ─── Shared helpers ────────────────────────────────────────────────────────

/**
 * Load agreements scoped to one buyer, shaped for the pure compute helper.
 * Uses the by_buyerId index so we never do a full-table scan.
 */
async function loadBuyerAgreementSnapshots(
  ctx: QueryCtx | MutationCtx,
  buyerId: Id<"users">
): Promise<AgreementSnapshot[]> {
  const rows = await ctx.db
    .query("agreements")
    .withIndex("by_buyerId", (q) => q.eq("buyerId", buyerId))
    .collect();

  return rows.map((a) => ({
    _id: a._id as unknown as string,
    dealRoomId: a.dealRoomId as unknown as string,
    buyerId: a.buyerId as unknown as string,
    type: a.type,
    status: a.status,
    signedAt: a.signedAt,
  }));
}

/**
 * Core recalculation used by both the public and internal mutation forms.
 * Reads agreements, runs the pure compute helper, upserts the persisted
 * state row, and emits an auditLog entry only when the verdict actually
 * changed from the previous persisted snapshot.
 */
async function recalculateInternal(
  ctx: MutationCtx,
  buyerId: Id<"users">,
  dealRoomId: Id<"dealRooms">,
  actorUserId: Id<"users"> | null
): Promise<Doc<"offerEligibilityState">> {
  // Validate deal room exists and matches this buyer — guards against
  // callers recomputing eligibility for mismatched pairs.
  const dealRoom = await ctx.db.get(dealRoomId);
  if (!dealRoom) {
    throw new Error("Deal room not found");
  }
  if (dealRoom.buyerId !== buyerId) {
    throw new Error("Deal room does not belong to this buyer");
  }

  const snapshots = await loadBuyerAgreementSnapshots(ctx, buyerId);
  const verdict = computeOfferEligibility(snapshots, dealRoomId as unknown as string);

  const now = new Date().toISOString();

  const existing = await ctx.db
    .query("offerEligibilityState")
    .withIndex("by_buyerId_and_dealRoomId", (q) =>
      q.eq("buyerId", buyerId).eq("dealRoomId", dealRoomId)
    )
    .unique();

  const persistedFields = verdictToPersistedFields(verdict);

  if (!existing) {
    const id = await ctx.db.insert("offerEligibilityState", {
      buyerId,
      dealRoomId,
      ...persistedFields,
      computedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // First-time persistence always writes an audit entry so the initial
    // verdict is reconstructable from the log.
    await ctx.db.insert("auditLog", {
      userId: actorUserId ?? undefined,
      action: "offer_eligibility_changed",
      entityType: "offerEligibilityState",
      entityId: id,
      details: JSON.stringify({
        buyerId,
        dealRoomId,
        previous: null,
        next: {
          isEligible: persistedFields.isEligible,
          currentAgreementType: persistedFields.currentAgreementType,
          blockingReasonCode: persistedFields.blockingReasonCode ?? null,
          requiredAction: persistedFields.requiredAction,
        },
      }),
      timestamp: now,
    });

    const inserted = await ctx.db.get(id);
    if (!inserted) {
      throw new Error("Failed to read back inserted eligibility state");
    }
    return inserted;
  }

  const changed = didVerdictChange(existing, persistedFields);

  await ctx.db.patch(existing._id, {
    ...persistedFields,
    computedAt: now,
    updatedAt: now,
  });

  if (changed) {
    await ctx.db.insert("auditLog", {
      userId: actorUserId ?? undefined,
      action: "offer_eligibility_changed",
      entityType: "offerEligibilityState",
      entityId: existing._id,
      details: JSON.stringify({
        buyerId,
        dealRoomId,
        previous: {
          isEligible: existing.isEligible,
          currentAgreementType: existing.currentAgreementType,
          blockingReasonCode: existing.blockingReasonCode ?? null,
          requiredAction: existing.requiredAction,
        },
        next: {
          isEligible: persistedFields.isEligible,
          currentAgreementType: persistedFields.currentAgreementType,
          blockingReasonCode: persistedFields.blockingReasonCode ?? null,
          requiredAction: persistedFields.requiredAction,
        },
      }),
      timestamp: now,
    });
  }

  const updated = await ctx.db.get(existing._id);
  if (!updated) {
    throw new Error("Failed to read back updated eligibility state");
  }
  return updated;
}

/**
 * Pick the subset of fields from a compute verdict that live on the
 * persisted row. Kept separate so the insert / patch / change-detection
 * paths all agree on the exact shape.
 */
function verdictToPersistedFields(verdict: EligibilityComputation): {
  isEligible: boolean;
  currentAgreementType: "none" | "tour_pass" | "full_representation";
  governingAgreementId: Id<"agreements"> | undefined;
  blockingReasonCode:
    | "no_signed_agreement"
    | "tour_pass_only_no_full_rep"
    | "agreement_canceled"
    | "agreement_replaced_pending_new"
    | undefined;
  blockingReasonMessage: string | undefined;
  requiredAction: "none" | "sign_agreement" | "upgrade_to_full_rep";
} {
  if (verdict.isEligible) {
    return {
      isEligible: true,
      currentAgreementType: "full_representation",
      governingAgreementId: verdict.governingAgreementId as unknown as Id<"agreements">,
      blockingReasonCode: undefined,
      blockingReasonMessage: undefined,
      requiredAction: "none",
    };
  }
  return {
    isEligible: false,
    currentAgreementType: verdict.currentAgreementType,
    governingAgreementId:
      verdict.governingAgreementId === null
        ? undefined
        : (verdict.governingAgreementId as unknown as Id<"agreements">),
    blockingReasonCode: verdict.blockingReasonCode,
    blockingReasonMessage: verdict.blockingReasonMessage,
    requiredAction: verdict.requiredAction,
  };
}

/**
 * Compare a freshly-computed verdict against the previously persisted row.
 * Returns true iff anything meaningful changed — we deliberately ignore
 * `computedAt`, `updatedAt`, and `blockingReasonMessage` (message copy
 * changes should not spam the audit log).
 */
function didVerdictChange(
  existing: Doc<"offerEligibilityState">,
  next: ReturnType<typeof verdictToPersistedFields>
): boolean {
  if (existing.isEligible !== next.isEligible) return true;
  if (existing.currentAgreementType !== next.currentAgreementType) return true;
  if (existing.requiredAction !== next.requiredAction) return true;
  if ((existing.blockingReasonCode ?? null) !== (next.blockingReasonCode ?? null)) {
    return true;
  }
  if (
    (existing.governingAgreementId ?? null) !==
    (next.governingAgreementId ?? null)
  ) {
    return true;
  }
  return false;
}

// ═══ QUERIES ═══

/**
 * Back-compat query from KIN-834. Returns the compact eligibility summary
 * for the currently authenticated user — does NOT read the persisted table
 * (it runs the shared compute over the live agreements each time so it is
 * always consistent with the underlying truth).
 *
 * The KIN-822 persisted state is intended for callers that need machine-
 * readable codes and audit history; this one is for simple UI hints.
 */
export const checkEligibility = query({
  args: {},
  returns: v.object({
    eligible: v.boolean(),
    currentAgreementType: v.union(
      v.literal("tour_pass"),
      v.literal("full_representation"),
      v.literal("none")
    ),
    requiredAction: v.union(
      v.literal("none"),
      v.literal("upgrade_to_full_rep"),
      v.literal("sign_agreement")
    ),
    reason: v.string(),
    blockingReasonCode: v.optional(eligibilityBlockingReason),
  }),
  handler: async (ctx) => {
    const session = await getSessionContext(ctx);
    if (session.kind === "anonymous") {
      return {
        eligible: false,
        currentAgreementType: "none" as const,
        requiredAction: "sign_agreement" as const,
        reason: "Not authenticated",
        blockingReasonCode: "not_authenticated" as const,
      };
    }

    if (session.kind === "unknown_user") {
      return {
        eligible: false,
        currentAgreementType: "none" as const,
        requiredAction: "sign_agreement" as const,
        reason: "User not found",
        blockingReasonCode: "buyer_not_found" as const,
      };
    }
    const user = session.user;

    // Run the shared compute across ALL of this buyer's agreements, not
    // scoped to a particular deal room. We synthesize a sentinel dealRoomId
    // of "__buyer_global__" by copying each agreement into a single bucket,
    // so the decision logic reuses the exact same branches.
    const snapshots = await loadBuyerAgreementSnapshots(ctx, user._id);
    const GLOBAL = "__buyer_global__";
    const globalSnapshots: AgreementSnapshot[] = snapshots.map((a) => ({
      ...a,
      dealRoomId: GLOBAL,
    }));
    const verdict = computeOfferEligibility(globalSnapshots, GLOBAL);

    if (verdict.isEligible) {
      return {
        eligible: true,
        currentAgreementType: "full_representation" as const,
        requiredAction: "none" as const,
        reason: "Full representation agreement is signed.",
        blockingReasonCode: undefined,
      };
    }

    return {
      eligible: false,
      currentAgreementType: verdict.currentAgreementType,
      requiredAction: verdict.requiredAction,
      reason: verdict.blockingReasonMessage,
      blockingReasonCode: verdict.blockingReasonCode,
    };
  },
});

/**
 * Read the persisted eligibility state for a specific (buyer, dealRoom)
 * pair. Buyers may read their own; brokers and admins may read any.
 *
 * Returns `null` if no state row has been computed yet — callers that
 * require a row should call `recalculateEligibility` first.
 */
export const getPersistedState = query({
  args: {
    buyerId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
  },
  returns: v.union(persistedStateValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const isSelf = user._id === args.buyerId;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isSelf && !isStaff) {
      throw new Error("Not authorized to read this eligibility state");
    }

    const row = await ctx.db
      .query("offerEligibilityState")
      .withIndex("by_buyerId_and_dealRoomId", (q) =>
        q.eq("buyerId", args.buyerId).eq("dealRoomId", args.dealRoomId)
      )
      .unique();
    return row;
  },
});

// ═══ MUTATIONS ═══

/**
 * Recalculate and persist the eligibility state for a (buyer, dealRoom)
 * pair. Broker/admin only — buyers trigger this indirectly via agreement
 * lifecycle events (e.g. sign, cancel, replace) that the agreements module
 * will call through to the internal variant.
 */
export const recalculateEligibility = mutation({
  args: {
    buyerId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
  },
  returns: persistedStateValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can recalculate eligibility");
    }

    return await recalculateInternal(ctx, args.buyerId, args.dealRoomId, user._id);
  },
});

/**
 * Internal recalculation — no auth check. For use by other Convex
 * functions that already know they are running in a trusted context
 * (agreement lifecycle hooks, scheduled recomputes, etc.). The other
 * session that owns `agreements.ts` will call this from each state
 * transition.
 */
export const recalculateEligibilityInternal = internalMutation({
  args: {
    buyerId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
    actorUserId: v.optional(v.id("users")),
  },
  returns: persistedStateValidator,
  handler: async (ctx, args) => {
    return await recalculateInternal(
      ctx,
      args.buyerId,
      args.dealRoomId,
      args.actorUserId ?? null
    );
  },
});

/**
 * Initiate upgrade from Tour Pass to Full Representation. Originally from
 * KIN-834 — kept as-is here so the public API is stable. After swapping
 * the agreement lifecycle state we also recompute eligibility so the
 * persisted row reflects the new "pending full rep" state.
 */
export const initiateUpgrade = mutation({
  args: {
    buyerId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
    documentStorageId: v.optional(v.id("_storage")),
  },
  returns: v.union(v.id("agreements"), v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can initiate upgrades");
    }

    // Validate deal room belongs to this buyer
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom || dealRoom.buyerId !== args.buyerId) {
      throw new Error("Deal room not found or does not belong to this buyer");
    }

    // Find the current signed tour_pass scoped to this deal room
    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const currentTourPass = agreements.find(
      (a) => a.type === "tour_pass" && a.status === "signed" && a.buyerId === args.buyerId
    );

    if (!currentTourPass) {
      throw new Error("No signed Tour Pass found for this deal room");
    }

    // Create new full_representation draft scoped to same buyer/deal room
    const newId = await ctx.db.insert("agreements", {
      dealRoomId: currentTourPass.dealRoomId,
      buyerId: currentTourPass.buyerId,
      type: "full_representation",
      status: "draft",
      documentStorageId: args.documentStorageId,
    });

    const successor = await ctx.db.get(newId);
    if (!successor) {
      throw new Error("Upgrade agreement was not created");
    }

    await applySupersessionState(ctx, {
      predecessor: currentTourPass,
      successor,
      reason: "upgrade_to_full_representation",
      actorUserId: user._id,
    });

    // Audit the agreement-level change
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "agreement_upgrade_initiated",
      entityType: "agreements",
      entityId: currentTourPass._id,
      details: JSON.stringify({
        from: "tour_pass",
        to: "full_representation",
        newAgreementId: newId,
        reason: "upgrade_to_full_representation",
      }),
      timestamp: new Date().toISOString(),
    });

    // Recompute eligibility — the buyer just moved from "tour_pass_only"
    // into "no signed full rep yet" state. This writes an audit entry on
    // offerEligibilityState if the verdict changed.
    await recalculateInternal(ctx, args.buyerId, args.dealRoomId, user._id);

    return newId;
  },
});
