// ═══════════════════════════════════════════════════════════════════════════
// Deal-Room Share Links (KIN-853)
//
// Typed query + mutation surface for buyer-owned share links. Buyers
// create a scoped share link for one of their deal rooms and send it
// to a collaborator (spouse, parent, etc). The collaborator resolves
// the link and gets a narrow, read-mostly view of that one deal room
// — they cannot enumerate other deal rooms.
//
// Lifecycle (stored):  active → revoked
// Lifecycle (derived): active → (active | expired | revoked)
//
// Pure rules (computeStatus, canRevoke, etc.) live in
// `convex/lib/shareLink.ts`.
// ═══════════════════════════════════════════════════════════════════════════

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  canRevoke,
  computeStatus,
  generateShareLinkSlug,
  projectListRow,
  resolveShareLink,
  sortForManagement,
  type RawShareLink,
  type ShareLinkScope,
} from "./lib/shareLink";

// ───────────────────────────────────────────────────────────────────────────
// Validators
// ───────────────────────────────────────────────────────────────────────────

const scopeValidator = v.union(
  v.literal("summary_only"),
  v.literal("summary_and_documents"),
  v.literal("full_read"),
);

const derivedStatusValidator = v.union(
  v.literal("active"),
  v.literal("expired"),
  v.literal("revoked"),
);

const shareLinkRowValidator = v.object({
  linkId: v.string(),
  slug: v.string(),
  scope: scopeValidator,
  derivedStatus: derivedStatusValidator,
  createdAt: v.string(),
  expiresAt: v.union(v.string(), v.null()),
  accessCount: v.number(),
  lastAccessedAt: v.union(v.string(), v.null()),
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function toRaw(doc: Doc<"dealRoomShareLinks">): RawShareLink {
  return {
    _id: doc._id,
    dealRoomId: doc.dealRoomId,
    createdByUserId: doc.createdByUserId,
    slug: doc.slug,
    scope: doc.scope,
    status: doc.status,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt ?? null,
    revokedAt: doc.revokedAt ?? null,
    revokedByUserId: doc.revokedByUserId ?? null,
    accessCount: doc.accessCount,
    lastAccessedAt: doc.lastAccessedAt ?? null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * List share links for a deal room. Only the buyer who owns the deal
 * room (or a broker/admin) can see their own links. Derived status is
 * computed at query time — stored "active" links with a past expiry
 * render as "expired" without mutating the row.
 */
export const listByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(shareLinkRowValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return [];

    const isOwner = dealRoom.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isStaff) return [];

    const now = new Date().toISOString();
    const rows = await ctx.db
      .query("dealRoomShareLinks")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const projected = rows.map((r) => projectListRow(toRaw(r), now));
    return sortForManagement(projected);
  },
});

/**
 * Resolve a share link by slug. No auth required — the whole point of a
 * share link is that the collaborator does not have an account. The
 * resolver writes an audit event (resolved or denied) on every call.
 *
 * Returns a narrow envelope: `{ ok: true, scope, dealRoomId }` on
 * success, `{ ok: false, reason }` on failure. Callers map the reason
 * to a UI message (expired, revoked, not_found).
 */
export const resolveBySlug = mutation({
  args: { slug: v.string() },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      linkId: v.id("dealRoomShareLinks"),
      dealRoomId: v.id("dealRooms"),
      scope: scopeValidator,
    }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal("not_found"),
        v.literal("revoked"),
        v.literal("expired"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("dealRoomShareLinks")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    const now = new Date().toISOString();
    const result = resolveShareLink(row ? toRaw(row) : null, now);

    if (!result.ok) {
      if (row) {
        // Known link, but denied — log to the typed events table.
        await ctx.db.insert("dealRoomShareLinkEvents", {
          linkId: row._id,
          dealRoomId: row.dealRoomId,
          event:
            result.reason === "expired"
              ? "denied_expired"
              : "denied_revoked",
          timestamp: now,
        });
      } else {
        // Unknown slug — we have no linkId to reference, so log to the
        // general auditLog table instead. Keeps probes observable for
        // monitoring without loosening the events table schema. We
        // never log the raw slug — it is the link secret — only a
        // short prefix hash for correlation. (Codex P2)
        await ctx.db.insert("auditLog", {
          action: "deal_room_share_link_denied_not_found",
          entityType: "dealRoomShareLinks",
          entityId: "unknown",
          details: JSON.stringify({
            slugPrefix: args.slug.slice(0, 4),
            slugLength: args.slug.length,
          }),
          timestamp: now,
        });
      }
      return { ok: false as const, reason: result.reason };
    }

    // Success — record the resolved event and bump counters on the row.
    await ctx.db.patch(row!._id, {
      accessCount: row!.accessCount + 1,
      lastAccessedAt: now,
    });
    await ctx.db.insert("dealRoomShareLinkEvents", {
      linkId: row!._id,
      dealRoomId: row!.dealRoomId,
      event: "resolved",
      timestamp: now,
    });

    return {
      ok: true as const,
      linkId: row!._id,
      dealRoomId: row!.dealRoomId,
      scope: result.resolved.scope,
    };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create a new share link for a deal room. Only the buyer who owns
 * the deal room can create one; brokers/admins can also create on
 * behalf of the buyer (e.g. during an onboarding call). The slug is
 * generated server-side from the Convex runtime's crypto source.
 */
export const create = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    scope: scopeValidator,
    expiresAt: v.optional(v.string()),
  },
  returns: v.object({
    linkId: v.id("dealRoomShareLinks"),
    slug: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const isOwner = dealRoom.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isStaff) {
      throw new Error("You are not authorized to share this deal room.");
    }

    if (args.expiresAt) {
      const now = new Date().toISOString();
      if (args.expiresAt <= now) {
        throw new Error("expiresAt must be in the future");
      }
    }

    const slug = generateShareLinkSlug((n) => {
      const out = new Uint8Array(n);
      crypto.getRandomValues(out);
      return out;
    });

    // Guard against (astronomically unlikely) slug collision. If the
    // slug already exists, regenerate once and fail loudly on a second
    // collision — this should never happen in practice with 144 bits
    // of entropy, but a tight upper bound beats a subtle uniqueness
    // bug in production.
    const existing = await ctx.db
      .query("dealRoomShareLinks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    const finalSlug = existing
      ? generateShareLinkSlug((n) => {
          const out = new Uint8Array(n);
          crypto.getRandomValues(out);
          return out;
        })
      : slug;
    if (existing) {
      const retry = await ctx.db
        .query("dealRoomShareLinks")
        .withIndex("by_slug", (q) => q.eq("slug", finalSlug))
        .unique();
      if (retry) throw new Error("Unable to generate a unique share-link slug");
    }

    const now = new Date().toISOString();
    // Attribute the link to the deal-room buyer, not the acting user.
    // When staff creates "on behalf of" a buyer, the buyer must still
    // own the lifecycle so they can revoke. The actual actor is
    // captured in the event's `actorUserId`. (Codex P1)
    const createdByUserId = dealRoom.buyerId;
    const linkId = await ctx.db.insert("dealRoomShareLinks", {
      dealRoomId: args.dealRoomId,
      createdByUserId,
      slug: finalSlug,
      scope: args.scope,
      status: "active",
      createdAt: now,
      expiresAt: args.expiresAt,
      accessCount: 0,
    });

    await ctx.db.insert("dealRoomShareLinkEvents", {
      linkId,
      dealRoomId: args.dealRoomId,
      event: "created",
      actorUserId: user._id,
      timestamp: now,
      details: JSON.stringify({
        scope: args.scope,
        expiresAt: args.expiresAt ?? null,
      }),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "deal_room_share_link_created",
      entityType: "dealRoomShareLinks",
      entityId: linkId,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        scope: args.scope,
      }),
      timestamp: now,
    });

    return { linkId, slug: finalSlug };
  },
});

/**
 * Revoke a share link. Only the creator or a broker/admin may revoke.
 * Returns nothing on success; throws with the canRevoke rejection
 * reason otherwise. Writes an audit event.
 */
export const revoke = mutation({
  args: { linkId: v.id("dealRoomShareLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const row = await ctx.db.get(args.linkId);
    if (!row) throw new Error("Share link not found");

    const raw = toRaw(row);
    const role =
      user.role === "broker" || user.role === "admin" ? user.role : "buyer";
    const check = canRevoke(raw, user._id, role);
    if (!check.ok) throw new Error(check.reason);

    const now = new Date().toISOString();
    await ctx.db.patch(args.linkId, {
      status: "revoked",
      revokedAt: now,
      revokedByUserId: user._id,
    });

    await ctx.db.insert("dealRoomShareLinkEvents", {
      linkId: args.linkId,
      dealRoomId: row.dealRoomId,
      event: "revoked",
      actorUserId: user._id,
      timestamp: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "deal_room_share_link_revoked",
      entityType: "dealRoomShareLinks",
      entityId: args.linkId,
      timestamp: now,
    });

    return null;
  },
});

// Re-export scope so clients have a single canonical type.
export type { ShareLinkScope };
