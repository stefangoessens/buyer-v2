/**
 * Agreement supersession — Convex module (KIN-851).
 *
 * Adds chain-walk queries and a typed supersede mutation on top of the
 * existing agreements table. Pairs with the existing `replaceAgreement`
 * flow in `convex/agreements.ts` — `supersede` here is used when the
 * successor agreement already exists (or is created atomically) and
 * needs to be linked to the predecessor with a structured reason.
 *
 * The pure chain resolution logic lives in
 * `src/lib/agreements/supersession.ts` — this module only handles
 * persistence, auth, and audit logging.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { supersessionReason } from "./lib/validators";

// ═══ Helpers ═══

async function canReadBuyer(
  ctx: QueryCtx,
  buyerId: Id<"users">,
): Promise<boolean> {
  const user = await requireAuth(ctx);
  if (user._id === buyerId) return true;
  return user.role === "broker" || user.role === "admin";
}

// ═══ Pure helpers (duplicated from src/lib/agreements/supersession.ts) ═══
//
// These mirror the pure resolver in src/lib/agreements/supersession.ts.
// Duplicating here keeps Convex self-contained (it doesn't cross-import
// from src/), and the src/ version is tested in isolation. Any change
// to the algorithm must be made in BOTH places.

type AgreementLike = Doc<"agreements">;

export const SUPERSESSION_REASONS = [
  "upgrade_to_full_representation",
  "correction",
  "amendment",
  "renewal",
  "replace_expired",
  "broker_decision",
] as const;

export type SupersessionReason = (typeof SUPERSESSION_REASONS)[number];

function walkChainInternal(
  head: AgreementLike,
  byId: Map<Id<"agreements">, AgreementLike>,
): AgreementLike[] {
  const lineage: AgreementLike[] = [];
  const seen = new Set<Id<"agreements">>();
  let current: AgreementLike | undefined = head;
  while (current) {
    if (seen.has(current._id)) break;
    seen.add(current._id);
    lineage.push(current);
    if (!current.replacedById) break;
    current = byId.get(current.replacedById);
  }
  return lineage;
}

function buildChainsInternal(
  agreements: AgreementLike[],
): AgreementLike[][] {
  const successorIds = new Set<Id<"agreements">>();
  for (const a of agreements) {
    if (a.replacedById) successorIds.add(a.replacedById);
  }
  const heads = agreements.filter((a) => !successorIds.has(a._id));
  const byId = new Map(agreements.map((a) => [a._id, a]));
  return heads.map((head) => walkChainInternal(head, byId));
}

export function resolveCurrentGoverningFromRows(
  agreements: AgreementLike[],
): AgreementLike | null {
  const chains = buildChainsInternal(agreements);
  const signedTails = chains
    .map((chain) => chain[chain.length - 1])
    .filter((a) => a.status === "signed");
  if (signedTails.length === 0) return null;

  const fullRep = signedTails
    .filter((a) => a.type === "full_representation")
    .sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""));
  if (fullRep.length > 0) return fullRep[0];

  const tourPass = signedTails
    .filter((a) => a.type === "tour_pass")
    .sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""));
  return tourPass[0] ?? null;
}

export async function applySupersessionState(
  ctx: MutationCtx,
  args: {
    predecessor: AgreementLike;
    successor: AgreementLike;
    reason: SupersessionReason;
    actorUserId?: Id<"users">;
  },
): Promise<{ supersededAt: string }> {
  const { predecessor, successor } = args;

  if (predecessor._id === successor._id) {
    throw new Error("An agreement cannot supersede itself");
  }

  if (predecessor.buyerId !== successor.buyerId) {
    throw new Error(
      "Predecessor and successor must belong to the same buyer",
    );
  }

  if (predecessor.status !== "signed") {
    throw new Error(
      `Cannot supersede predecessor in status "${predecessor.status}" — only signed agreements can be superseded`,
    );
  }

  if (predecessor.replacedById !== undefined) {
    throw new Error(
      "Predecessor has already been superseded — resolve the existing chain first",
    );
  }

  if (successor.status === "canceled" || successor.status === "replaced") {
    throw new Error(
      `Cannot use successor in status "${successor.status}" — successor must still be active in the chain`,
    );
  }

  const allForBuyer = await ctx.db
    .query("agreements")
    .withIndex("by_buyerId", (q) => q.eq("buyerId", predecessor.buyerId))
    .collect();

  const existingPredecessorOfSuccessor = allForBuyer.find(
    (agreement) => agreement.replacedById === successor._id,
  );
  if (existingPredecessorOfSuccessor) {
    throw new Error(
      `Successor is already the replacement for ${existingPredecessorOfSuccessor._id} — a successor can have at most one predecessor (linear chain invariant)`,
    );
  }

  const byId = new Map(allForBuyer.map((agreement) => [agreement._id, agreement]));
  let cursor: AgreementLike | undefined = successor;
  const visited = new Set<Id<"agreements">>();
  while (cursor) {
    if (visited.has(cursor._id)) break;
    visited.add(cursor._id);
    if (cursor._id === predecessor._id) {
      throw new Error(
        "Cycle detected — successor's chain points back at predecessor",
      );
    }
    if (!cursor.replacedById) break;
    cursor = byId.get(cursor.replacedById);
  }

  const supersededAt = new Date().toISOString();
  await ctx.db.patch(predecessor._id, {
    status: "replaced",
    replacedById: successor._id,
    canceledAt: supersededAt,
    supersededAt,
    supersessionReason: args.reason,
  });

  await ctx.db.insert("auditLog", {
    userId: args.actorUserId,
    action: "agreement_superseded",
    entityType: "agreements",
    entityId: predecessor._id,
    details: JSON.stringify({
      predecessorId: predecessor._id,
      successorId: successor._id,
      reason: args.reason,
      supersededAt,
    }),
    timestamp: supersededAt,
  });

  return { supersededAt };
}

// ═══ Queries ═══

/**
 * Get the currently governing agreement for a buyer. This is the
 * AUTHORITATIVE resolver — walks every supersession chain and returns
 * the terminal signed agreement (preferring full_representation over
 * tour_pass, most recently signed first).
 *
 * Replaces the older `getCurrentGoverning` in agreements.ts which only
 * did a flat "most recent signed" lookup and missed chains.
 */
export const resolveCurrentGoverning = query({
  args: { buyerId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const allowed = await canReadBuyer(ctx, args.buyerId);
    if (!allowed) return null;

    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", args.buyerId))
      .collect();

    return resolveCurrentGoverningFromRows(agreements);
  },
});

/**
 * Get the full supersession chain for a specific agreement — used by
 * the audit panel to show the lineage of replacements for one row.
 */
export const getChainForAgreement = query({
  args: { agreementId: v.id("agreements") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement) return [];

    // Auth: buyer owner or broker/admin
    if (
      agreement.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return [];
    }

    // Load all of this buyer's agreements — needed to walk the chain.
    const allForBuyer = await ctx.db
      .query("agreements")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", agreement.buyerId))
      .collect();

    const chains = buildChainsInternal(allForBuyer);
    const containing = chains.find((chain) =>
      chain.some((a) => a._id === args.agreementId),
    );
    return containing ?? [];
  },
});

/**
 * List all chains for a buyer with their head, tail, and depth.
 * Broker/admin view of the supersession history.
 */
export const listChainsForBuyer = query({
  args: { buyerId: v.id("users") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const allowed = await canReadBuyer(ctx, args.buyerId);
    if (!allowed) return [];

    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", args.buyerId))
      .collect();

    const chains = buildChainsInternal(agreements);
    return chains.map((chain) => ({
      head: chain[0],
      tail: chain[chain.length - 1],
      depth: chain.length,
      lineage: chain,
    }));
  },
});

// ═══ Mutations ═══

/**
 * Supersede an existing agreement with a successor that already exists.
 * This is the "link an existing successor" variant — compared to the
 * existing `replaceAgreement` in convex/agreements.ts which creates a
 * new draft atomically, this one is used when the successor was already
 * created (e.g., upgrade flow that drafted the successor first).
 *
 * Requires that both agreements belong to the same buyer AND neither is
 * already part of a closed chain. Broker/admin only.
 */
export const supersede = mutation({
  args: {
    predecessorId: v.id("agreements"),
    successorId: v.id("agreements"),
    reason: supersessionReason,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can supersede agreements");
    }

    const predecessor = await ctx.db.get(args.predecessorId);
    if (!predecessor) throw new Error("Predecessor agreement not found");

    const successor = await ctx.db.get(args.successorId);
    if (!successor) throw new Error("Successor agreement not found");

    await applySupersessionState(ctx, {
      predecessor,
      successor,
      reason: args.reason,
      actorUserId: user._id,
    });

    return null;
  },
});
