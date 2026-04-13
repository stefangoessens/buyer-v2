// ═══════════════════════════════════════════════════════════════════════════
// Lead Attribution (KIN-819) — Convex functions
//
// Queries and mutations that capture, persist, and hand off a visitor's
// marketing attribution. See the `leadAttribution` block in
// `convex/schema.ts` for the data model and legal lifecycle.
//
// Access rules:
//   - `captureTouch`, `handoffToUser`, `markConverted` are public (no
//     auth). They run on the pre-auth path and on the registration
//     callback path where identity is not yet established; we key on
//     `sessionId` / `userId` directly and trust the caller to pass the
//     correct values. Rate limiting and CSRF are enforced at the edge.
//   - `getBySessionId` is public — any caller holding the session id
//     can read that row (it is the same trust model as a cookie).
//   - `getByUserId` is self-or-broker/admin.
//   - `getByStatus` is broker/admin only.
//
// Every mutation writes an `auditLog` entry so analytics + ops can
// reconstruct the handoff history even after the row is cleaned up.
// ═══════════════════════════════════════════════════════════════════════════

import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { leadAttributionStatus } from "./lib/validators";
import type { Id } from "./_generated/dataModel";
import type { Touch } from "./lib/attribution";
import {
  appendLeadAttributionTouch,
  buildLeadAttributionReadModel,
  createAnonymousLeadAttribution,
  createSyntheticRegisteredLeadAttribution,
  handoffLeadAttribution,
  type LeadAttributionRecord,
  convertLeadAttribution,
} from "./lib/leadAttribution";
import { requireAuth } from "./lib/session";

// ───────────────────────────────────────────────────────────────────────────
// Shared validators
// ───────────────────────────────────────────────────────────────────────────

/**
 * Validator for a `Touch` — mirrors the `Touch` interface in
 * `convex/lib/attribution.ts` and `src/lib/marketing/attribution.ts`.
 * Kept local to this file so the schema shape stays grouped with the
 * functions that persist it.
 */
const touchValidator = v.object({
  source: v.string(),
  medium: v.string(),
  campaign: v.optional(v.string()),
  content: v.optional(v.string()),
  term: v.optional(v.string()),
  landingPage: v.string(),
  referrer: v.optional(v.string()),
  timestamp: v.string(),
});

const leadAttributionRowValidator = v.object({
  _id: v.id("leadAttribution"),
  _creationTime: v.number(),
  sessionId: v.string(),
  userId: v.optional(v.id("users")),
  firstTouch: touchValidator,
  lastTouch: touchValidator,
  touchCount: v.number(),
  status: leadAttributionStatus,
  registeredAt: v.optional(v.string()),
  convertedAt: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

const touchContextValidator = v.object({
  source: v.string(),
  medium: v.string(),
  campaign: v.optional(v.string()),
  content: v.optional(v.string()),
  term: v.optional(v.string()),
  landingPage: v.string(),
  referrer: v.optional(v.string()),
  occurredAt: v.string(),
});

const leadAttributionReadModelValidator = v.object({
  sessionId: v.string(),
  userId: v.optional(v.string()),
  status: leadAttributionStatus,
  touchCount: v.number(),
  source: v.string(),
  medium: v.string(),
  campaign: v.optional(v.string()),
  landingPage: v.string(),
  firstTouchOccurredAt: v.string(),
  firstTouchContext: touchContextValidator,
  lastTouchContext: touchContextValidator,
  registeredAt: v.optional(v.string()),
  convertedAt: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

function toLeadAttributionRecord(row: {
  sessionId: string;
  userId?: Id<"users">;
  firstTouch: Touch;
  lastTouch: Touch;
  touchCount: number;
  status: "anonymous" | "registered" | "converted";
  registeredAt?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
}): LeadAttributionRecord {
  return {
    sessionId: row.sessionId,
    userId: row.userId,
    firstTouch: row.firstTouch,
    lastTouch: row.lastTouch,
    touchCount: row.touchCount,
    status: row.status,
    registeredAt: row.registeredAt,
    convertedAt: row.convertedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * Fetch an attribution row by its anonymous session id. Public — the
 * session id is the trust boundary, mirroring the cookie-based model.
 */
export const getBySessionId = query({
  args: { sessionId: v.string() },
  returns: v.union(leadAttributionReadModelValidator, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("leadAttribution")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    return row ? buildLeadAttributionReadModel(toLeadAttributionRecord(row)) : null;
  },
});

/**
 * Fetch an attribution row by its registered user id. Self-or-broker/admin.
 */
export const getByUserId = query({
  args: { userId: v.id("users") },
  returns: v.union(leadAttributionReadModelValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (
      user._id !== args.userId &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return null;
    }
    const row = await ctx.db
      .query("leadAttribution")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    return row ? buildLeadAttributionReadModel(toLeadAttributionRecord(row)) : null;
  },
});

/**
 * List attribution rows by status. Broker/admin only — it's a
 * whole-funnel view used by ops dashboards.
 */
export const getByStatus = query({
  args: { status: leadAttributionStatus },
  returns: v.array(leadAttributionReadModelValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can list attribution by status");
    }
    const rows = await ctx.db
      .query("leadAttribution")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
    return rows.map((row) =>
      buildLeadAttributionReadModel(toLeadAttributionRecord(row))
    );
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Internal queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * Internal lookup by userId — for use from other Convex functions (e.g.
 * deal room creation) that need to tag a conversion without going
 * through the authenticated public query.
 */
export const getByUserIdInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(leadAttributionRowValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leadAttribution")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Internal lookup by sessionId — used by handoff flows that also need to
 * read the current state before patching.
 */
export const getBySessionIdInternal = internalQuery({
  args: { sessionId: v.string() },
  returns: v.union(leadAttributionRowValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leadAttribution")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────

/**
 * Capture a touch for an anonymous session. Public mutation — called
 * from the public request path before authentication exists.
 *
 *   - First touch for a session creates the row with firstTouch =
 *     lastTouch = touch, touchCount = 1, status = "anonymous".
 *   - Subsequent touches update `lastTouch` and bump `touchCount` ONLY
 *     if `isDistinctTouch` reports the new touch differs from the
 *     current lastTouch. This keeps repeat page views from thrashing
 *     the row.
 *
 * Returns the attribution row id.
 */
export const captureTouch = mutation({
  args: {
    sessionId: v.string(),
    touch: touchValidator,
  },
  returns: v.id("leadAttribution"),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("leadAttribution")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!existing) {
      const id = await ctx.db.insert(
        "leadAttribution",
        createAnonymousLeadAttribution(args.sessionId, args.touch, now)
      );

      await ctx.db.insert("auditLog", {
        action: "lead_attribution_captured",
        entityType: "leadAttribution",
        entityId: id,
        details: JSON.stringify({
          sessionId: args.sessionId,
          source: args.touch.source,
          medium: args.touch.medium,
          campaign: args.touch.campaign,
          touchCount: 1,
          isFirstTouch: true,
        }),
        timestamp: now,
      });

      return id;
    }

    // Row already exists — decide whether the incoming touch is distinct
    // enough to update `lastTouch`. Same source/medium/campaign? No-op
    // (still write `updatedAt` so we can tell when the row was last
    // seen, but don't bump touchCount).
    const previous = existing.lastTouch as Touch;
    const next = args.touch as Touch;
    const updated = appendLeadAttributionTouch(
      toLeadAttributionRecord(existing),
      args.touch,
      now
    );

    if (updated.touchCount !== existing.touchCount) {
      await ctx.db.patch(existing._id, {
        lastTouch: updated.lastTouch,
        touchCount: updated.touchCount,
        updatedAt: updated.updatedAt,
      });

      await ctx.db.insert("auditLog", {
        userId: existing.userId ?? undefined,
        action: "lead_attribution_touch_updated",
        entityType: "leadAttribution",
        entityId: existing._id,
        details: JSON.stringify({
          sessionId: args.sessionId,
          previousSource: previous.source,
          nextSource: next.source,
          previousMedium: previous.medium,
          nextMedium: next.medium,
          touchCount: updated.touchCount,
        }),
        timestamp: now,
      });
    } else {
      await ctx.db.patch(existing._id, { updatedAt: updated.updatedAt });
    }

    return existing._id;
  },
});

/**
 * Hand off an anonymous session to a registered user. Public mutation —
 * called right after authentication completes during registration.
 *
 *   - If a leadAttribution row exists for the session, patch it with
 *     userId + status="registered" + registeredAt.
 *   - If no row exists (e.g. the visitor never hit a capture endpoint
 *     because JS was disabled or they came in through a server-side
 *     redirect), create a minimal row anchored to a synthetic "direct"
 *     touch so the user always has attribution downstream.
 *
 * Idempotent: handing off a session that is already registered to the
 * same userId is a no-op. Handing off to a DIFFERENT userId throws —
 * that would corrupt attribution.
 *
 * Returns the attribution row id.
 */
export const handoffToUser = mutation({
  args: {
    sessionId: v.string(),
    userId: v.id("users"),
  },
  returns: v.id("leadAttribution"),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("leadAttribution")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (existing) {
      // Prevent cross-user corruption — once a row is handed off it can
      // only ever belong to the same user.
      if (existing.userId && existing.userId !== args.userId) {
        throw new Error(
          "Attribution row already handed off to a different user"
        );
      }

      // No-op idempotency: already registered to the same user.
      if (existing.userId === args.userId && existing.status !== "anonymous") {
        return existing._id;
      }

      const existingRecord = toLeadAttributionRecord(existing);
      const updated = handoffLeadAttribution(existingRecord, args.userId, now);
      await ctx.db.patch(existing._id, {
        userId: updated.userId as Id<"users">,
        status: updated.status,
        registeredAt: updated.registeredAt,
        updatedAt: updated.updatedAt,
      });

      await ctx.db.insert("auditLog", {
        userId: args.userId,
        action: "lead_attribution_handoff",
        entityType: "leadAttribution",
        entityId: existing._id,
        details: JSON.stringify({
          sessionId: args.sessionId,
          firstTouchSource: (existing.firstTouch as Touch).source,
          firstTouchMedium: (existing.firstTouch as Touch).medium,
          touchCount: existing.touchCount,
        }),
        timestamp: now,
      });

      return existing._id;
    }

    // No pre-registration row for this session — but before inserting a
    // synthetic one, check if the user already has an attribution row
    // from a previous handoff (e.g., callback replay, second device,
    // repeated login flow). Without this guard, duplicate inserts would
    // break the `.unique()` reads in getByUserId / markConverted.
    const existingForUser = await ctx.db
      .query("leadAttribution")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (existingForUser) {
      // Idempotent handoff — the user already has an attribution row,
      // just ensure its status reflects registered. We intentionally do
      // NOT overwrite the existing sessionId since the original session
      // is the canonical first-touch anchor.
      if (existingForUser.status === "anonymous") {
        const updated = handoffLeadAttribution(
          toLeadAttributionRecord(existingForUser),
          args.userId,
          now
        );
        await ctx.db.patch(existingForUser._id, {
          userId: updated.userId as Id<"users">,
          status: updated.status,
          registeredAt: updated.registeredAt,
          updatedAt: updated.updatedAt,
        });
      }

      await ctx.db.insert("auditLog", {
        userId: args.userId,
        action: "lead_attribution_handoff_duplicate_session",
        entityType: "leadAttribution",
        entityId: existingForUser._id,
        details: JSON.stringify({
          requestedSessionId: args.sessionId,
          canonicalSessionId: existingForUser.sessionId,
          reason: "user already has attribution row from prior handoff",
        }),
        timestamp: now,
      });

      return existingForUser._id;
    }

    // Truly first handoff for this user — create a minimal "direct"
    // attribution so the user still has a row in the read model.
    const id = await ctx.db.insert(
      "leadAttribution",
      createSyntheticRegisteredLeadAttribution(args.sessionId, args.userId, now)
    );

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "lead_attribution_handoff_synthetic",
      entityType: "leadAttribution",
      entityId: id,
      details: JSON.stringify({
        sessionId: args.sessionId,
        reason: "no pre-registration capture, synthetic direct touch",
      }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Mark a registered user's attribution row as converted. Public —
 * called from downstream flows (first deal room creation, first tour
 * request) that don't carry the user's auth context in-line.
 *
 * Idempotent: calling this on an already-converted row is a no-op.
 * Calling it on an anonymous row that was never handed off is a no-op
 * and returns null rather than throwing, since the caller has no way
 * to surface the error to the user.
 */
export const markConverted = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const row = await ctx.db
      .query("leadAttribution")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!row) return null;

    const updated = convertLeadAttribution(toLeadAttributionRecord(row), now);
    if (!updated) {
      return null;
    }

    await ctx.db.patch(row._id, {
      status: updated.status,
      convertedAt: updated.convertedAt,
      updatedAt: updated.updatedAt,
    });

    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "lead_attribution_converted",
      entityType: "leadAttribution",
      entityId: row._id,
      details: JSON.stringify({
        firstTouchSource: (row.firstTouch as Touch).source,
        firstTouchMedium: (row.firstTouch as Touch).medium,
        lastTouchSource: (row.lastTouch as Touch).source,
        lastTouchMedium: (row.lastTouch as Touch).medium,
        touchCount: row.touchCount,
      }),
      timestamp: now,
    });

    return null;
  },
});
