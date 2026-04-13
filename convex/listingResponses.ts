/**
 * Listing-side response flow — Convex module (KIN-840).
 *
 * Persists structured responses submitted by external counterparties
 * (listing agents/brokers) via the limited external access token model
 * from KIN-828. Token validation happens inline before persistence;
 * internal users consume responses via broker/admin queries and the
 * review-state mutations.
 *
 * Duplicate-submission defense: a response with the same tokenHash +
 * responseType submitted within 60 seconds is rejected to guard
 * against retry storms from flaky counterparty tooling.
 *
 * Pure validation + dedupe logic lives in
 * `src/lib/externalAccess/listingResponse.ts`. This module mirrors the
 * essentials inline and adds persistence + auth.
 */

import { internal } from "./_generated/api";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { Id } from "./_generated/dataModel";
import type { TokenDenialReason } from "../packages/shared/src/external-access";
import { authorizeExternalAccessSession } from "./lib/externalAccessSession";

// ═══ Shared validators ═══

const counterpartyRoleValidator = v.union(
  v.literal("listing_agent"),
  v.literal("listing_broker"),
  v.literal("cooperating_broker"),
  v.literal("other"),
);

const responseTypeValidator = v.union(
  v.literal("offer_acknowledged"),
  v.literal("offer_countered"),
  v.literal("offer_rejected"),
  v.literal("compensation_confirmed"),
  v.literal("compensation_disputed"),
  v.literal("generic_acknowledged"),
);

const reviewStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("acknowledged"),
  v.literal("actioned"),
  v.literal("dismissed"),
);

// `convex/_generated/api.d.ts` is stale in this checkout and does not expose
// the checked-in `externalAccess` module, even though the runtime module exists.
const externalAccessRecordEvent = (
  internal as unknown as {
    externalAccess: { recordEvent: any };
  }
).externalAccess.recordEvent;

// ═══ Inline validation (mirrors src/lib/externalAccess/listingResponse.ts) ═══

const MAX_MESSAGE_LENGTH = 4000;
const MAX_COUNTER_PRICE = 100_000_000;
const MAX_EARNEST_MONEY = 10_000_000;
const DEDUPE_WINDOW_MS = 60_000;

interface ValidationInput {
  responseType: string;
  offerId?: string;
  message?: string;
  counterPrice?: number;
  counterEarnestMoney?: number;
  counterClosingDate?: string;
  confirmedPct?: number;
  confirmedFlat?: number;
  disputeReason?: string;
}

function validateInline(input: ValidationInput, nowIso: string): void {
  if (input.message && input.message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(
      `MESSAGE_TOO_LONG: message must be ≤${MAX_MESSAGE_LENGTH} characters`,
    );
  }

  if (input.responseType === "offer_countered") {
    if (!input.offerId) {
      throw new Error(
        "OFFER_REQUIRED_FOR_COUNTER: counter-offer requires an associated offerId",
      );
    }
    if (
      input.counterPrice === undefined &&
      input.counterEarnestMoney === undefined &&
      input.counterClosingDate === undefined
    ) {
      throw new Error(
        "MISSING_COUNTER_OFFER_PAYLOAD: counter-offer must specify at least one of price, earnest money, or closing date",
      );
    }
    if (
      typeof input.counterPrice === "number" &&
      (input.counterPrice <= 0 || input.counterPrice > MAX_COUNTER_PRICE)
    ) {
      throw new Error(
        `INVALID_COUNTER_PRICE: counter price must be > 0 and ≤ $${MAX_COUNTER_PRICE.toLocaleString()}`,
      );
    }
    if (
      typeof input.counterEarnestMoney === "number" &&
      (input.counterEarnestMoney < 0 ||
        input.counterEarnestMoney > MAX_EARNEST_MONEY)
    ) {
      throw new Error(
        "INVALID_EARNEST_MONEY: earnest money must be ≥ 0 and ≤ $10M",
      );
    }
    if (input.counterClosingDate !== undefined) {
      const d = Date.parse(input.counterClosingDate);
      if (Number.isNaN(d)) {
        throw new Error(
          "INVALID_CLOSING_DATE: closing date must be a parseable ISO date",
        );
      }
      const nowMs = Date.parse(nowIso);
      if (!Number.isNaN(nowMs) && d <= nowMs) {
        throw new Error(
          "INVALID_CLOSING_DATE: closing date must be in the future",
        );
      }
    }
  }

  if (
    input.responseType === "compensation_confirmed" ||
    input.responseType === "compensation_disputed"
  ) {
    // Require at least one concrete compensation field — otherwise the
    // response is a vacuous "confirmed" with no actual data, which
    // creates invalid review records.
    if (
      input.confirmedPct === undefined &&
      input.confirmedFlat === undefined
    ) {
      throw new Error(
        "MISSING_COMPENSATION_PAYLOAD: compensation_* responses require confirmedPct or confirmedFlat",
      );
    }
    if (
      typeof input.confirmedPct === "number" &&
      (input.confirmedPct < 0 || input.confirmedPct > 100)
    ) {
      throw new Error(
        "INVALID_COMPENSATION_PCT: compensation percent must be 0-100",
      );
    }
    if (
      typeof input.confirmedFlat === "number" &&
      (input.confirmedFlat < 0 || input.confirmedFlat > MAX_COUNTER_PRICE)
    ) {
      throw new Error("INVALID_COMPENSATION_FLAT: compensation flat must be ≥ 0");
    }
    if (input.responseType === "compensation_disputed" && !input.disputeReason) {
      throw new Error(
        "MISSING_DISPUTE_REASON: compensation_disputed requires disputeReason",
      );
    }
  }
}

function deniedSubmissionError(reason: TokenDenialReason): string {
  switch (reason) {
    case "not_found":
      return "TOKEN_NOT_FOUND: invalid or unknown token";
    case "expired":
      return "TOKEN_EXPIRED: token is expired";
    case "revoked":
      return "TOKEN_REVOKED: token has been revoked";
    case "action_not_allowed":
      return "ACTION_NOT_ALLOWED: token does not permit submit_response";
    case "scope_mismatch":
      return "TOKEN_SCOPE_MISMATCH: token is not scoped to this submission";
  }
}

// ═══ Queries ═══

/**
 * List responses for a deal room (broker/admin only). Internal review
 * surface — buyers never hit this query.
 */
export const listByDealRoom = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    reviewStatus: v.optional(reviewStatusValidator),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    const all = await ctx.db
      .query("listingResponses")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    const filtered = args.reviewStatus
      ? all.filter((r) => r.reviewStatus === args.reviewStatus)
      : all;

    return filtered.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },
});

/**
 * List responses for a specific offer (broker/admin only).
 * Used by the offer cockpit to show listing-side acknowledgements
 * and counters alongside the buyer's offer history.
 */
export const listByOffer = query({
  args: { offerId: v.id("offers") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    const all = await ctx.db
      .query("listingResponses")
      .withIndex("by_offerId", (q) => q.eq("offerId", args.offerId))
      .collect();
    return all.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },
});

/**
 * Unreviewed queue — responses that still need broker/admin triage.
 * Ordered oldest-first so the most time-sensitive items surface first.
 */
export const listUnreviewed = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    const unreviewed = await ctx.db
      .query("listingResponses")
      .withIndex("by_reviewStatus", (q) => q.eq("reviewStatus", "unreviewed"))
      .collect();

    return unreviewed
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .slice(0, args.limit ?? 50);
  },
});

// ═══ Mutations ═══

/**
 * Submit a listing-side response. Authorized by an external access
 * token (KIN-828). Does NOT require requireAuth — instead, the caller
 * supplies a valid token that was previously issued by a broker/admin.
 *
 * Note: in a production flow this mutation would be called from a
 * public HTTP action that also verifies the token signature. For the
 * Convex-direct path (used by internal tools for testing), the token
 * is looked up by its hash directly.
 */
export const submitResponse = mutation({
  args: {
    hashedToken: v.string(),
    dealRoomId: v.id("dealRooms"),
    offerId: v.optional(v.id("offers")),
    responseType: responseTypeValidator,
    message: v.optional(v.string()),
    counterPrice: v.optional(v.number()),
    counterEarnestMoney: v.optional(v.number()),
    counterClosingDate: v.optional(v.string()),
    requestedConcessions: v.optional(v.string()),
    sellerCreditsRequested: v.optional(v.number()),
    confirmedPct: v.optional(v.number()),
    confirmedFlat: v.optional(v.number()),
    disputeReason: v.optional(v.string()),
  },
  returns: v.id("listingResponses"),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Look up and validate the token
    const token = await ctx.db
      .query("externalAccessTokens")
      .withIndex("by_hashedToken", (q) => q.eq("hashedToken", args.hashedToken))
      .unique();
    const authorized = authorizeExternalAccessSession({
      token,
      hashedToken: args.hashedToken,
      intendedAction: "submit_response",
      intendedDealRoomId: args.dealRoomId,
      intendedOfferId: args.offerId,
      now,
    });
    if (!authorized.ok) {
      await ctx.runMutation(externalAccessRecordEvent, {
        tokenId: token?._id,
        eventType: "denied",
        dealRoomId: token?.dealRoomId ?? args.dealRoomId,
        attemptedAction: "submit_response",
        denialReason: authorized.reason,
        summary: `Denied submit_response attempt (${authorized.reason})`,
      });
      throw new Error(deniedSubmissionError(authorized.reason));
    }
    const { session, token: validToken } = authorized;

    await ctx.runMutation(externalAccessRecordEvent, {
      tokenId: validToken._id,
      eventType: "accessed",
      dealRoomId: validToken.dealRoomId,
      attemptedAction: "submit_response",
      summary: `Authorized ${session.scope.resource} submission access`,
    });

    // Verify the offer (if supplied) belongs to the same deal room AND
    // matches the token's offer scope if the token was issued for a
    // specific offer. Without this check, a counterparty holding a token
    // scoped to offer A could submit a response against offer B in the
    // same room, bypassing the token's least-privilege boundary.
    if (args.offerId) {
      const offer = await ctx.db.get(args.offerId);
      if (!offer) {
        await ctx.runMutation(externalAccessRecordEvent, {
          tokenId: validToken._id,
          eventType: "denied",
          dealRoomId: validToken.dealRoomId,
          attemptedAction: "submit_response",
          denialReason: "scope_mismatch",
          summary: "Submission referenced an unknown offer",
        });
        throw new Error("Offer not found");
      }
      if (offer.dealRoomId !== args.dealRoomId) {
        await ctx.runMutation(externalAccessRecordEvent, {
          tokenId: validToken._id,
          eventType: "denied",
          dealRoomId: validToken.dealRoomId,
          attemptedAction: "submit_response",
          denialReason: "scope_mismatch",
          summary: "Submission targeted an offer outside the deal room scope",
        });
        throw new Error("Offer does not belong to the specified deal room");
      }
      if (
        validToken.offerId !== undefined &&
        validToken.offerId !== args.offerId
      ) {
        await ctx.runMutation(externalAccessRecordEvent, {
          tokenId: validToken._id,
          eventType: "denied",
          dealRoomId: validToken.dealRoomId,
          attemptedAction: "submit_response",
          denialReason: "scope_mismatch",
          summary: "Submission targeted an offer outside the token scope",
        });
        throw new Error(
          "TOKEN_OFFER_SCOPE_MISMATCH: token is scoped to a specific offer that does not match the submission",
        );
      }
    } else if (validToken.offerId !== undefined) {
      // Token is scoped to an offer but the submission didn't target one.
      // Reject: the caller must declare which offer they're responding to.
      await ctx.runMutation(externalAccessRecordEvent, {
        tokenId: validToken._id,
        eventType: "denied",
        dealRoomId: validToken.dealRoomId,
        attemptedAction: "submit_response",
        denialReason: "scope_mismatch",
        summary: "Submission omitted the required offer scope",
      });
      throw new Error(
        "TOKEN_OFFER_SCOPE_MISMATCH: token is scoped to a specific offer but submission has no offerId",
      );
    }

    // Validate the payload shape
    try {
      validateInline(
        {
          responseType: args.responseType,
          offerId: args.offerId,
          message: args.message,
          counterPrice: args.counterPrice,
          counterEarnestMoney: args.counterEarnestMoney,
          counterClosingDate: args.counterClosingDate,
          confirmedPct: args.confirmedPct,
          confirmedFlat: args.confirmedFlat,
          disputeReason: args.disputeReason,
        },
        now,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid payload";
      await ctx.runMutation(externalAccessRecordEvent, {
        tokenId: validToken._id,
        eventType: "denied",
        dealRoomId: validToken.dealRoomId,
        attemptedAction: "submit_response",
        denialReason: "payload_invalid",
        summary: message.slice(0, 200),
      });
      throw error;
    }

    // Dedupe: reject if the same token+type was submitted within 60s
    const recent = await ctx.db
      .query("listingResponses")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", validToken._id))
      .collect();
    const nowMs = Date.parse(now);
    const duplicate = recent.find((r) => {
      if (r.responseType !== args.responseType) return false;
      const submittedMs = Date.parse(r.submittedAt);
      if (Number.isNaN(submittedMs)) return false;
      return nowMs - submittedMs < DEDUPE_WINDOW_MS;
    });
    if (duplicate) {
      await ctx.runMutation(externalAccessRecordEvent, {
        tokenId: validToken._id,
        eventType: "denied",
        dealRoomId: validToken.dealRoomId,
        attemptedAction: "submit_response",
        denialReason: "duplicate_submission",
        summary: `Rejected duplicate ${args.responseType} submission`,
      });
      throw new Error(
        "DUPLICATE_SUBMISSION: identical response submitted within the last 60 seconds",
      );
    }

    // Load deal room to snapshot propertyId
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const id = await ctx.db.insert("listingResponses", {
      tokenId: validToken._id,
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      propertyId: dealRoom.propertyId,
      counterpartyRole: validToken.role,
      responseType: args.responseType,
      message: args.message?.trim(),
      counterPrice: args.counterPrice,
      counterEarnestMoney: args.counterEarnestMoney,
      counterClosingDate: args.counterClosingDate,
      requestedConcessions: args.requestedConcessions?.trim(),
      sellerCreditsRequested: args.sellerCreditsRequested,
      confirmedPct: args.confirmedPct,
      confirmedFlat: args.confirmedFlat,
      disputeReason: args.disputeReason?.trim(),
      reviewStatus: "unreviewed",
      submittedAt: now,
    });
    await ctx.runMutation(externalAccessRecordEvent, {
      tokenId: validToken._id,
      eventType: "submitted",
      dealRoomId: validToken.dealRoomId,
      attemptedAction: "submit_response",
      summary: `Submitted ${args.responseType}`,
    });

    // Audit log
    await ctx.db.insert("auditLog", {
      action: "listing_response_submitted",
      entityType: "listingResponses",
      entityId: id,
      details: JSON.stringify({
        tokenId: validToken._id,
        responseType: args.responseType,
        dealRoomId: args.dealRoomId,
      }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Mark a response reviewed. Broker/admin only. Used by the internal
 * review queue to advance unreviewed → acknowledged/actioned/dismissed.
 */
export const markReviewed = mutation({
  args: {
    responseId: v.id("listingResponses"),
    reviewStatus: v.union(
      v.literal("acknowledged"),
      v.literal("actioned"),
      v.literal("dismissed"),
    ),
    reviewNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can mark listing responses reviewed");
    }

    const response = await ctx.db.get(args.responseId);
    if (!response) throw new Error("Listing response not found");

    if (args.reviewNotes && args.reviewNotes.length > 4000) {
      throw new Error("REVIEW_NOTES_TOO_LONG: review notes must be ≤4000 chars");
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.responseId, {
      reviewStatus: args.reviewStatus,
      reviewedBy: user._id,
      reviewedAt: now,
      reviewNotes: args.reviewNotes?.trim(),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: `listing_response_${args.reviewStatus}`,
      entityType: "listingResponses",
      entityId: args.responseId,
      details: args.reviewNotes
        ? JSON.stringify({ notes: args.reviewNotes.slice(0, 200) })
        : undefined,
      timestamp: now,
    });

    return null;
  },
});
