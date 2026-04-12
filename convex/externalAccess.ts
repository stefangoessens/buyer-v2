/**
 * External counterparty access — Convex module (KIN-828).
 *
 * Issues, validates, and revokes limited-scope tokens for external parties.
 * Validation logic lives in `src/lib/externalAccess/token.ts` — this module
 * handles persistence, auth, and audit logging.
 *
 * Threat model:
 *   - External parties (listing agents, etc.) must be able to submit narrow
 *     responses without full accounts.
 *   - They must NOT be able to enumerate other deal rooms or escalate.
 *   - Token leakage must be recoverable via revocation without losing audit.
 *
 * Lifecycle:
 *   issued → accessed (repeatable) → submitted → expired | revoked
 *
 * Every transition writes an `externalAccessEvents` row. The row is the
 * auditable record of what happened — the token's own fields track state
 * but not history.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// ═══ Shared validators ═══

const allowedActionValidator = v.union(
  v.literal("view_offer"),
  v.literal("submit_response"),
  v.literal("confirm_compensation"),
  v.literal("acknowledge_receipt"),
);

const roleValidator = v.union(
  v.literal("listing_agent"),
  v.literal("listing_broker"),
  v.literal("cooperating_broker"),
  v.literal("other"),
);

// ═══ Queries ═══

/**
 * List all tokens issued for a deal room. Broker/admin only.
 * Includes revoked and expired tokens for audit visibility.
 */
export const listByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    return await ctx.db
      .query("externalAccessTokens")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
  },
});

/**
 * List recent events for a deal room. Broker/admin only. Used by the ops
 * queue to review denied-access attempts and submissions from external
 * parties.
 */
export const listEventsByDealRoom = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    const events = await ctx.db
      .query("externalAccessEvents")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    return events
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, args.limit ?? 50);
  },
});

// ═══ Mutations ═══

/**
 * Issue a new external-access token. Broker/admin only.
 *
 * NOTE: This mutation is the one place a plaintext token CAN exist in the
 * database write path. The caller (an action, NOT this mutation) is
 * responsible for:
 *   1. Generating the plaintext token via `generateToken()`
 *   2. Hashing it via `hashToken()`
 *   3. Delivering the plaintext to the external party (email, etc.)
 *   4. Calling this mutation with ONLY the hash
 *
 * This split keeps plaintext out of Convex storage entirely.
 */
export const issueToken = mutation({
  args: {
    hashedToken: v.string(),
    dealRoomId: v.id("dealRooms"),
    offerId: v.optional(v.id("offers")),
    role: roleValidator,
    allowedActions: v.array(allowedActionValidator),
    expiresAt: v.string(),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  },
  returns: v.id("externalAccessTokens"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can issue external access tokens");
    }

    if (args.allowedActions.length === 0) {
      throw new Error("Token must allow at least one action");
    }

    // Validate deal room exists
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    // If an offer is specified, verify it belongs to this deal room
    if (args.offerId) {
      const offer = await ctx.db.get(args.offerId);
      if (!offer) throw new Error("Offer not found");
      if (offer.dealRoomId !== args.dealRoomId) {
        throw new Error("Offer does not belong to the specified deal room");
      }
    }

    // Validate expiry is in the future
    const now = new Date().toISOString();
    if (args.expiresAt <= now) {
      throw new Error("expiresAt must be in the future");
    }

    // Reject duplicate hashed tokens (defense in depth — collisions are
    // effectively impossible with 256-bit entropy but we check anyway).
    const existing = await ctx.db
      .query("externalAccessTokens")
      .withIndex("by_hashedToken", (q) => q.eq("hashedToken", args.hashedToken))
      .unique();
    if (existing) {
      throw new Error("Duplicate token hash — regenerate and retry");
    }

    const tokenId = await ctx.db.insert("externalAccessTokens", {
      hashedToken: args.hashedToken,
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      role: args.role,
      allowedActions: args.allowedActions,
      expiresAt: args.expiresAt,
      issuedBy: user._id,
      contactName: args.contactName,
      contactEmail: args.contactEmail,
      createdAt: now,
    });

    await ctx.db.insert("externalAccessEvents", {
      tokenId,
      eventType: "issued",
      dealRoomId: args.dealRoomId,
      summary: args.contactName
        ? `Issued to ${args.role} (${args.contactName})`
        : `Issued to ${args.role}`,
      timestamp: now,
    });

    // Mirror to the general audit log for broker visibility
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "external_access_issued",
      entityType: "externalAccessTokens",
      entityId: tokenId,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        offerId: args.offerId,
        role: args.role,
        allowedActions: args.allowedActions,
        expiresAt: args.expiresAt,
      }),
      timestamp: now,
    });

    return tokenId;
  },
});

/**
 * Revoke a token. Broker/admin only. Does NOT delete the row — sets
 * revokedAt so the audit trail remains complete.
 */
export const revokeToken = mutation({
  args: {
    tokenId: v.id("externalAccessTokens"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can revoke external access tokens");
    }

    const token = await ctx.db.get(args.tokenId);
    if (!token) throw new Error("Token not found");
    if (token.revokedAt !== undefined) {
      // Idempotent: already revoked
      return null;
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.tokenId, {
      revokedAt: now,
      revokedBy: user._id,
      revokeReason: args.reason,
    });

    await ctx.db.insert("externalAccessEvents", {
      tokenId: args.tokenId,
      eventType: "revoked",
      dealRoomId: token.dealRoomId,
      summary: args.reason ?? "Revoked by broker",
      timestamp: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "external_access_revoked",
      entityType: "externalAccessTokens",
      entityId: args.tokenId,
      details: args.reason ? JSON.stringify({ reason: args.reason }) : undefined,
      timestamp: now,
    });

    return null;
  },
});

// ═══ Internal mutations (called by validate actions) ═══

/**
 * Record a token access or denied attempt. Called from external-facing
 * actions after they run the validator logic. The caller passes the
 * already-computed denial reason; this mutation does no auth and no
 * validation — it is pure write-path.
 *
 * Internal because external routes must go through actions (which hash
 * the incoming token, look up the record, then call the validator).
 * Exposing this directly to untrusted callers would let them forge audit
 * events.
 */
export const recordEvent = internalMutation({
  args: {
    tokenId: v.optional(v.id("externalAccessTokens")),
    eventType: v.union(
      v.literal("accessed"),
      v.literal("submitted"),
      v.literal("denied"),
    ),
    dealRoomId: v.optional(v.id("dealRooms")),
    attemptedAction: v.optional(v.string()),
    denialReason: v.optional(v.string()),
    summary: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    await ctx.db.insert("externalAccessEvents", {
      tokenId: args.tokenId,
      eventType: args.eventType,
      dealRoomId: args.dealRoomId,
      attemptedAction: args.attemptedAction,
      denialReason: args.denialReason,
      summary: args.summary,
      timestamp: now,
    });

    // If this was a successful access, bump lastUsedAt on the token row.
    if (args.eventType === "accessed" && args.tokenId) {
      const token = await ctx.db.get(args.tokenId);
      if (token) {
        await ctx.db.patch(args.tokenId, { lastUsedAt: now });
      }
    }

    return null;
  },
});

/**
 * Look up a token by its hashed form. Internal — callers are actions that
 * have already hashed the plaintext using the shared library.
 */
export const getByHash = internalMutation({
  args: { hashedToken: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("externalAccessTokens")
      .withIndex("by_hashedToken", (q) => q.eq("hashedToken", args.hashedToken))
      .unique();
  },
});

// ═══ Type helpers (exported for action use) ═══

export type ExternalTokenDoc = Doc<"externalAccessTokens">;
export type ExternalTokenId = Id<"externalAccessTokens">;
export type { MutationCtx, QueryCtx };
