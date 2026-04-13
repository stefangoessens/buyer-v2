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
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { Id } from "./_generated/dataModel";
import type { TokenDenialReason } from "../packages/shared/src/external-access";
import {
  authorizeListingResponseSubmission,
  buildListingResponseReviewModel,
  type ListingResponseReviewModel,
} from "./lib/listingResponses";

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

const listingResponsesInternal = (
  internal as unknown as {
    listingResponses: {
      submitResponseInternal: any;
    };
  }
).listingResponses;

// ═══ Inline validation (mirrors src/lib/externalAccess/listingResponse.ts) ═══

const MAX_MESSAGE_LENGTH = 4000;
const MAX_COUNTER_PRICE = 100_000_000;
const MAX_EARNEST_MONEY = 10_000_000;

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

const accessContextValidator = v.object({
  kind: v.literal("external_access"),
  tokenId: v.id("externalAccessTokens"),
  resource: v.literal("offer"),
  dealRoomId: v.id("dealRooms"),
  offerId: v.optional(v.id("offers")),
  role: counterpartyRoleValidator,
  allowedActions: v.array(
    v.union(
      v.literal("view_offer"),
      v.literal("submit_response"),
      v.literal("confirm_compensation"),
      v.literal("acknowledge_receipt"),
    ),
  ),
  expiresAt: v.string(),
});

const payloadValidator = v.object({
  message: v.optional(v.string()),
  counterOffer: v.optional(
    v.object({
      counterPrice: v.optional(v.number()),
      counterEarnestMoney: v.optional(v.number()),
      counterClosingDate: v.optional(v.string()),
      requestedConcessions: v.optional(v.string()),
      sellerCreditsRequested: v.optional(v.number()),
    }),
  ),
  compensation: v.optional(
    v.object({
      confirmedPct: v.optional(v.number()),
      confirmedFlat: v.optional(v.number()),
      disputeReason: v.optional(v.string()),
    }),
  ),
});

const reviewModelValidator = v.object({
  id: v.id("listingResponses"),
  createdAt: v.number(),
  dealRoomId: v.id("dealRooms"),
  offerId: v.optional(v.id("offers")),
  propertyId: v.id("properties"),
  responseType: responseTypeValidator,
  counterpartyRole: counterpartyRoleValidator,
  submittedAt: v.string(),
  accessContext: accessContextValidator,
  payload: payloadValidator,
  review: v.object({
    status: reviewStatusValidator,
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  }),
});

async function listReviewModelsByDealRoom(
  ctx: QueryCtx,
  args: {
    dealRoomId: Id<"dealRooms">;
    reviewStatus?: "unreviewed" | "acknowledged" | "actioned" | "dismissed";
  },
): Promise<Array<ListingResponseReviewModel>> {
  const all = await ctx.db
    .query("listingResponses")
    .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
    .collect();

  const filtered = args.reviewStatus
    ? all.filter((response) => response.reviewStatus === args.reviewStatus)
    : all;

  return filtered
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map(buildListingResponseReviewModel);
}

async function listReviewModelsByOffer(
  ctx: QueryCtx,
  args: { offerId: Id<"offers"> },
): Promise<Array<ListingResponseReviewModel>> {
  const all = await ctx.db
    .query("listingResponses")
    .withIndex("by_offerId", (q) => q.eq("offerId", args.offerId))
    .collect();

  return all
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map(buildListingResponseReviewModel);
}

async function listUnreviewedModels(
  ctx: QueryCtx,
  args: { limit?: number },
): Promise<Array<ListingResponseReviewModel>> {
  const unreviewed = await ctx.db
    .query("listingResponses")
    .withIndex("by_reviewStatus", (q) => q.eq("reviewStatus", "unreviewed"))
    .collect();

  return unreviewed
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .slice(0, args.limit ?? 50)
    .map(buildListingResponseReviewModel);
}

// ═══ Queries ═══

export const listByDealRoomInternal = internalQuery({
  args: {
    dealRoomId: v.id("dealRooms"),
    reviewStatus: v.optional(reviewStatusValidator),
  },
  returns: v.array(reviewModelValidator),
  handler: async (ctx, args) => {
    return await listReviewModelsByDealRoom(ctx, args);
  },
});

export const listByOfferInternal = internalQuery({
  args: { offerId: v.id("offers") },
  returns: v.array(reviewModelValidator),
  handler: async (ctx, args) => {
    return await listReviewModelsByOffer(ctx, args);
  },
});

export const listUnreviewedInternal = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(reviewModelValidator),
  handler: async (ctx, args) => {
    return await listUnreviewedModels(ctx, args);
  },
});

/**
 * List responses for a deal room (broker/admin only). Internal review
 * surface — buyers never hit this query.
 */
export const listByDealRoom = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    reviewStatus: v.optional(reviewStatusValidator),
  },
  returns: v.array(reviewModelValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];
    return await listReviewModelsByDealRoom(ctx, args);
  },
});

/**
 * List responses for a specific offer (broker/admin only).
 * Used by the offer cockpit to show listing-side acknowledgements
 * and counters alongside the buyer's offer history.
 */
export const listByOffer = query({
  args: { offerId: v.id("offers") },
  returns: v.array(reviewModelValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];
    return await listReviewModelsByOffer(ctx, args);
  },
});

/**
 * Unreviewed queue — responses that still need broker/admin triage.
 * Ordered oldest-first so the most time-sensitive items surface first.
 */
export const listUnreviewed = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(reviewModelValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];
    return await listUnreviewedModels(ctx, args);
  },
});

// ═══ Write path ═══

const submitResponseArgs = {
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
};

async function submitResponseHandler(
  ctx: MutationCtx,
  args: {
    hashedToken: string;
    dealRoomId: Id<"dealRooms">;
    offerId?: Id<"offers">;
    responseType:
      | "offer_acknowledged"
      | "offer_countered"
      | "offer_rejected"
      | "compensation_confirmed"
      | "compensation_disputed"
      | "generic_acknowledged";
    message?: string;
    counterPrice?: number;
    counterEarnestMoney?: number;
    counterClosingDate?: string;
    requestedConcessions?: string;
    sellerCreditsRequested?: number;
    confirmedPct?: number;
    confirmedFlat?: number;
    disputeReason?: string;
  },
): Promise<Id<"listingResponses">> {
  const now = new Date().toISOString();

  const token = await ctx.db
    .query("externalAccessTokens")
    .withIndex("by_hashedToken", (q) => q.eq("hashedToken", args.hashedToken))
    .unique();

  const recent = token
    ? await ctx.db
        .query("listingResponses")
        .withIndex("by_tokenId", (q) => q.eq("tokenId", token._id))
        .collect()
    : [];

  const authorized = authorizeListingResponseSubmission({
    token,
    hashedToken: args.hashedToken,
    dealRoomId: args.dealRoomId,
    offerId: args.offerId,
    responseType: args.responseType,
    now,
    existingResponses: recent.map((response) => ({
      responseType: response.responseType,
      submittedAt: response.submittedAt,
    })),
  });

  if (!authorized.ok) {
    if (authorized.kind === "denied") {
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

    await ctx.runMutation(externalAccessRecordEvent, {
      tokenId: authorized.token._id,
      eventType: "denied",
      dealRoomId: authorized.token.dealRoomId,
      attemptedAction: "submit_response",
      denialReason: "duplicate_submission",
      summary: `Rejected duplicate ${args.responseType} submission`,
    });
    throw new Error(
      "DUPLICATE_SUBMISSION: identical response submitted within the last 60 seconds",
    );
  }

  const { accessContext, session, token: validToken } = authorized;

  await ctx.runMutation(externalAccessRecordEvent, {
    tokenId: validToken._id,
    eventType: "accessed",
    dealRoomId: validToken.dealRoomId,
    attemptedAction: "submit_response",
    summary: `Authorized ${session.scope.resource} submission access`,
  });

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
  }

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
    accessKind: accessContext.kind,
    accessResource: accessContext.resource,
    accessAllowedActions: accessContext.allowedActions,
    accessExpiresAt: accessContext.expiresAt,
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

  await ctx.db.insert("auditLog", {
    action: "listing_response_submitted",
    entityType: "listingResponses",
    entityId: id,
    details: JSON.stringify({
      tokenId: validToken._id,
      responseType: args.responseType,
      dealRoomId: args.dealRoomId,
      accessKind: accessContext.kind,
      accessResource: accessContext.resource,
      accessExpiresAt: accessContext.expiresAt,
    }),
    timestamp: now,
  });

  return id;
}

/**
 * Internal transactional persistence for a limited-access listing-side
 * response submission. The public entrypoint is an action so the
 * external path stays separated from internal broker/admin mutations.
 */
export const submitResponseInternal = internalMutation({
  args: submitResponseArgs,
  returns: v.id("listingResponses"),
  handler: async (ctx, args) => {
    return await submitResponseHandler(ctx, args);
  },
});

export const submitResponse = action({
  args: submitResponseArgs,
  returns: v.id("listingResponses"),
  handler: async (ctx, args) => {
    const responseId: Id<"listingResponses"> = await ctx.runMutation(
      listingResponsesInternal.submitResponseInternal,
      args,
    );
    return responseId;
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
