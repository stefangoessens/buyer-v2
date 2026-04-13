// ═══════════════════════════════════════════════════════════════════════════
// Counteroffer Version History (KIN-792)
//
// Typed query + mutation surface over `counterOffers` that returns a
// role-aware chain projection (buyer-safe or internal). Chain
// construction, turn-taking, and state-transition rules live in the
// pure helper `convex/lib/counterofferHistory.ts`.
// ═══════════════════════════════════════════════════════════════════════════

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  buildBuyerChain,
  buildInternalChain,
  canAppendCounter,
  canTransition,
  type CounterOfferParty,
  type CounterOfferStatus,
  type RawCounterOffer,
} from "./lib/counterofferHistory";

// ───────────────────────────────────────────────────────────────────────────
// Validators for return shape
// ───────────────────────────────────────────────────────────────────────────

const partyValidator = v.union(v.literal("seller"), v.literal("buyer"));

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("expired"),
  v.literal("withdrawn"),
  v.literal("superseded"),
);

const terminalStatusValidator = v.union(
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("expired"),
  v.literal("withdrawn"),
);

const buyerNodeValidator = v.object({
  counterOfferId: v.string(),
  version: v.number(),
  fromParty: partyValidator,
  price: v.number(),
  terms: v.union(v.string(), v.null()),
  createdAt: v.string(),
  status: statusValidator,
  isCurrent: v.boolean(),
  priceDelta: v.union(v.number(), v.null()),
  respondedAt: v.union(v.string(), v.null()),
  expiresAt: v.union(v.string(), v.null()),
  supersededAt: v.union(v.string(), v.null()),
});

const internalNodeValidator = v.object({
  counterOfferId: v.string(),
  version: v.number(),
  fromParty: partyValidator,
  price: v.number(),
  terms: v.union(v.string(), v.null()),
  createdAt: v.string(),
  status: statusValidator,
  isCurrent: v.boolean(),
  priceDelta: v.union(v.number(), v.null()),
  respondedAt: v.union(v.string(), v.null()),
  expiresAt: v.union(v.string(), v.null()),
  supersededAt: v.union(v.string(), v.null()),
  brokerNotes: v.union(v.string(), v.null()),
  responderUserId: v.union(v.string(), v.null()),
});

const commonSummaryFields = {
  offerId: v.string(),
  totalRounds: v.number(),
  awaitingResponseFrom: v.union(partyValidator, v.null()),
  currentPrice: v.union(v.number(), v.null()),
  firstPrice: v.union(v.number(), v.null()),
  netPriceDelta: v.union(v.number(), v.null()),
  isTerminal: v.boolean(),
  terminalStatus: v.union(terminalStatusValidator, v.null()),
};

const buyerSummaryValidator = v.object({
  ...commonSummaryFields,
  chain: v.array(buyerNodeValidator),
});

const internalSummaryValidator = v.object({
  ...commonSummaryFields,
  chain: v.array(internalNodeValidator),
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function toRaw(doc: Doc<"counterOffers">): RawCounterOffer {
  return {
    _id: doc._id,
    offerId: doc.offerId,
    version: doc.version,
    fromParty: doc.fromParty,
    price: doc.price,
    terms: doc.terms,
    createdAt: doc.createdAt,
    status: doc.status as CounterOfferStatus,
    supersededAt: doc.supersededAt,
    respondedAt: doc.respondedAt,
    responderUserId: doc.responderUserId,
    brokerNotes: doc.brokerNotes,
    expiresAt: doc.expiresAt,
  };
}

async function loadOfferWithAuthz(
  ctx: { db: { get: (id: Id<"offers">) => Promise<Doc<"offers"> | null> } },
  offerId: Id<"offers">,
  user: { _id: Id<"users">; role: string },
) {
  const offer = await ctx.db.get(offerId);
  if (!offer) return null;
  const isOwner = offer.buyerId === user._id;
  const isStaff = user.role === "broker" || user.role === "admin";
  if (!isOwner && !isStaff) return null;
  return { offer, isOwner, isStaff };
}

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * Load the counteroffer chain for an offer. Buyers get the buyer-safe
 * projection (no broker notes, no responder ids). Brokers and admins
 * get the full internal chain. Returns null on missing/unauthorized.
 */
export const getChainForOffer = query({
  args: { offerId: v.id("offers") },
  returns: v.union(
    v.null(),
    v.object({
      role: v.union(v.literal("buyer"), v.literal("internal")),
      summary: v.union(buyerSummaryValidator, internalSummaryValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const loaded = await loadOfferWithAuthz(ctx, args.offerId, user);
    if (!loaded) return null;

    const rows = await ctx.db
      .query("counterOffers")
      .withIndex("by_offerId_and_version", (q) =>
        q.eq("offerId", args.offerId),
      )
      .collect();
    const raw = rows.map(toRaw);

    if (user.role === "buyer") {
      return {
        role: "buyer" as const,
        summary: buildBuyerChain(args.offerId, raw),
      };
    }
    return {
      role: "internal" as const,
      summary: buildInternalChain(args.offerId, raw),
    };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────

/**
 * Append a new counter to an offer's chain. Marks the previous current
 * node as `superseded` (with `supersededAt`), inserts the new row with
 * `status: "pending"`, version = prev + 1, and writes an audit log
 * entry. Only broker/admin can append (acting on behalf of either
 * party) — in this brokerage model, the buyer's broker owns the
 * outgoing communication channel.
 */
export const appendCounter = mutation({
  args: {
    offerId: v.id("offers"),
    fromParty: partyValidator,
    price: v.number(),
    terms: v.optional(v.string()),
    brokerNotes: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  returns: v.id("counterOffers"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error(
        "Only brokers or admins can append counteroffers on behalf of a party.",
      );
    }
    const offer = await ctx.db.get(args.offerId);
    if (!offer) throw new Error("Offer not found");
    if (args.price <= 0) throw new Error("Counter price must be positive");

    const rows = await ctx.db
      .query("counterOffers")
      .withIndex("by_offerId_and_version", (q) =>
        q.eq("offerId", args.offerId),
      )
      .collect();
    const raw = rows.map(toRaw);
    const summary = buildBuyerChain(args.offerId, raw);

    const check = canAppendCounter(summary, args.fromParty);
    if (!check.ok) throw new Error(check.reason);

    const now = new Date().toISOString();
    const prevCurrent = summary.chain.find((n) => n.isCurrent);
    if (prevCurrent) {
      await ctx.db.patch(
        prevCurrent.counterOfferId as Id<"counterOffers">,
        {
          status: "superseded",
          supersededAt: now,
        },
      );
    }

    const nextVersion =
      summary.chain.length === 0
        ? 1
        : summary.chain[summary.chain.length - 1].version + 1;

    const newId = await ctx.db.insert("counterOffers", {
      offerId: args.offerId,
      version: nextVersion,
      fromParty: args.fromParty,
      price: args.price,
      terms: args.terms,
      createdAt: now,
      status: "pending",
      brokerNotes: args.brokerNotes,
      expiresAt: args.expiresAt,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "counter_offer_appended",
      entityType: "counterOffers",
      entityId: newId,
      details: JSON.stringify({
        offerId: args.offerId,
        version: nextVersion,
        fromParty: args.fromParty,
        price: args.price,
        hasBrokerNotes: args.brokerNotes != null,
      }),
      timestamp: now,
    });

    // Promote the parent offer's status so downstream surfaces see the
    // deal as "countered" until it terminates. We only bump into
    // "countered" from statuses that make sense — already-accepted or
    // already-rejected offers stay put.
    if (
      offer.status === "submitted" ||
      offer.status === "countered" ||
      offer.status === "approved"
    ) {
      await ctx.db.patch(offer._id, { status: "countered" });
    }

    return newId;
  },
});

/**
 * Respond to the currently pending counter: accept, reject, or let it
 * expire/withdraw. The responder is the opposite party — we don't
 * enforce that at the schema level (the caller identity is just a
 * broker/admin user), but the audit log captures who marked it and
 * which party the response was recorded for.
 */
export const respondToCounter = mutation({
  args: {
    counterOfferId: v.id("counterOffers"),
    decision: v.union(
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("expired"),
      v.literal("withdrawn"),
    ),
    brokerNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers or admins can record counteroffer decisions.");
    }
    const row = await ctx.db.get(args.counterOfferId);
    if (!row) throw new Error("Counter offer not found");

    const transitionCheck = canTransition(
      row.status as CounterOfferStatus,
      args.decision,
    );
    if (!transitionCheck.ok) throw new Error(transitionCheck.reason);

    const now = new Date().toISOString();
    await ctx.db.patch(args.counterOfferId, {
      status: args.decision,
      respondedAt: now,
      responderUserId: user._id,
      // Only overwrite broker notes if new ones were provided — caller
      // might be recording a simple accept without adding rationale.
      ...(args.brokerNotes !== undefined
        ? { brokerNotes: args.brokerNotes }
        : {}),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: `counter_offer_${args.decision}`,
      entityType: "counterOffers",
      entityId: args.counterOfferId,
      details: JSON.stringify({
        offerId: row.offerId,
        version: row.version,
        fromParty: row.fromParty,
      }),
      timestamp: now,
    });

    // If this counter was accepted, roll the parent offer into a
    // terminal state. Rejected/expired/withdrawn leave the offer in
    // "countered" so the UI can still show the history.
    if (args.decision === "accepted") {
      const offer = await ctx.db.get(row.offerId);
      if (
        offer &&
        offer.status !== "accepted" &&
        offer.status !== "rejected" &&
        offer.status !== "withdrawn" &&
        offer.status !== "expired"
      ) {
        await ctx.db.patch(row.offerId, { status: "accepted" });
      }
    }

    return null;
  },
});

// Re-export types so clients can import a single canonical shape.
export type { CounterOfferParty, CounterOfferStatus };
