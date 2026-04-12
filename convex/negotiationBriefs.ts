/**
 * Negotiation brief export pipeline — Convex module (KIN-839).
 *
 * This module is the persistence + orchestration layer for negotiation briefs.
 * Assembly logic lives in `src/lib/negotiation/brief.ts` and stays framework-
 * agnostic; this module handles auth, audit logging, staleness detection, and
 * lifecycle transitions.
 *
 * Lifecycle:
 *   pending → ready    (generation succeeded)
 *   pending → failed   (generation errored; errorCount bumps)
 *   ready   → stale    (upstream engine version changed)
 *   stale   → pending  (regenerate requested — same row, new status)
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/** Get a single brief by ID. Auth-gated to the deal room owner or broker/admin. */
export const get = query({
  args: { briefId: v.id("negotiationBriefs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const brief = await ctx.db.get(args.briefId);
    if (!brief) return null;

    const dealRoom = await ctx.db.get(brief.dealRoomId);
    if (!dealRoom) return null;

    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return null;
    }

    return brief;
  },
});

/** List all briefs for a deal room, newest first. Auth-gated. */
export const listByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return [];

    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return [];
    }

    const briefs = await ctx.db
      .query("negotiationBriefs")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    return briefs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

/** Get the latest ready brief for a deal room, or null. Auth-gated. */
export const getLatestReady = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return null;
    }

    const briefs = await ctx.db
      .query("negotiationBriefs")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    // Sort by completedAt (when the brief became ready), NOT createdAt.
    // Regeneration reuses the same row so createdAt is stale — ordering by
    // completedAt ensures a regenerated brief wins over an older one that
    // happens to have an earlier createdAt.
    const ready = briefs
      .filter((b) => b.status === "ready")
      .sort((a, b) =>
        (b.completedAt ?? b.updatedAt).localeCompare(
          a.completedAt ?? a.updatedAt,
        ),
      );
    return ready.at(0) ?? null;
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────

const sourceVersionsValidator = v.object({
  pricingVersion: v.optional(v.string()),
  compsVersion: v.optional(v.string()),
  leverageVersion: v.optional(v.string()),
  offerVersion: v.optional(v.string()),
  builderVersion: v.string(),
});

/**
 * Create a new brief in `pending` state. The actual assembly happens in a
 * separate action (or on the caller); this mutation just reserves the row
 * and records who triggered it.
 *
 * Broker/admin only. The caller supplies the source versions it intends to
 * use so we can record provenance from the moment of creation.
 */
export const createBrief = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    offerId: v.optional(v.id("offers")),
    sourceVersions: sourceVersionsValidator,
  },
  returns: v.id("negotiationBriefs"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can create negotiation briefs");
    }

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    // Validate offer belongs to this deal room, if supplied
    if (args.offerId) {
      const offer = await ctx.db.get(args.offerId);
      if (!offer) throw new Error("Offer not found");
      if (offer.dealRoomId !== args.dealRoomId) {
        throw new Error("Offer does not belong to the specified deal room");
      }
    }

    const now = new Date().toISOString();
    const id = await ctx.db.insert("negotiationBriefs", {
      dealRoomId: args.dealRoomId,
      propertyId: dealRoom.propertyId,
      offerId: args.offerId,
      status: "pending",
      sourceVersions: args.sourceVersions,
      errorCount: 0,
      generatedBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "negotiation_brief_created",
      entityType: "negotiationBriefs",
      entityId: id,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        offerId: args.offerId,
      }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Record the result of a successful brief assembly — moves status to
 * `ready` and stores the payload JSON. Internal because it's called by the
 * assembly action, which runs under its own auth context.
 */
export const recordReady = internalMutation({
  args: {
    briefId: v.id("negotiationBriefs"),
    payload: v.string(),
    coverage: v.number(),
    sourceVersions: sourceVersionsValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new Error("Brief not found");

    const now = new Date().toISOString();
    await ctx.db.patch(args.briefId, {
      status: "ready",
      payload: args.payload,
      coverage: args.coverage,
      sourceVersions: args.sourceVersions,
      errorMessage: undefined,
      updatedAt: now,
      completedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "negotiation_brief_ready",
      entityType: "negotiationBriefs",
      entityId: args.briefId,
      details: JSON.stringify({ coverage: args.coverage }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Record a failed brief assembly. Bumps errorCount and stores the error
 * message. Keeps the row in the DB so UIs can show the failure and the
 * caller can retry via `regenerate`.
 */
export const recordFailure = internalMutation({
  args: {
    briefId: v.id("negotiationBriefs"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new Error("Brief not found");

    const now = new Date().toISOString();
    await ctx.db.patch(args.briefId, {
      status: "failed",
      errorMessage: args.errorMessage,
      errorCount: brief.errorCount + 1,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "negotiation_brief_failed",
      entityType: "negotiationBriefs",
      entityId: args.briefId,
      details: JSON.stringify({
        errorMessage: args.errorMessage,
        errorCount: brief.errorCount + 1,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Mark a brief as stale. Called when an upstream engine output changes and
 * the staleness detector decides the old brief no longer matches. The brief
 * stays in the DB with its payload intact so consumers can still read it,
 * but the status flag warns them it needs regeneration.
 *
 * Broker/admin only — stale marking is an authoritative act.
 */
export const markStale = mutation({
  args: {
    briefId: v.id("negotiationBriefs"),
    reasons: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can mark briefs stale");
    }

    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new Error("Brief not found");
    if (brief.status !== "ready") {
      // Only ready briefs can become stale — pending/failed don't qualify.
      return null;
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.briefId, {
      status: "stale",
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "negotiation_brief_stale",
      entityType: "negotiationBriefs",
      entityId: args.briefId,
      details: JSON.stringify({ reasons: args.reasons }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Reset a stale or failed brief back to pending so the assembly pipeline
 * picks it up again. The caller provides the fresh source versions. Broker/
 * admin only.
 */
export const regenerate = mutation({
  args: {
    briefId: v.id("negotiationBriefs"),
    sourceVersions: sourceVersionsValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can regenerate briefs");
    }

    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new Error("Brief not found");
    if (brief.status !== "stale" && brief.status !== "failed") {
      throw new Error(
        `Cannot regenerate brief in status "${brief.status}" — only stale or failed briefs are eligible`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.briefId, {
      status: "pending",
      sourceVersions: args.sourceVersions,
      errorMessage: undefined,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "negotiation_brief_regenerate_requested",
      entityType: "negotiationBriefs",
      entityId: args.briefId,
      timestamp: now,
    });

    return null;
  },
});
