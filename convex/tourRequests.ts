/**
 * Tour request flow — Convex module (KIN-802).
 *
 * Implements the request envelope side of the tour flow: drafts, submission,
 * blocking, assignment, confirmation, and cancellation. The executed tour
 * (the showing itself) lives in `convex/tours.ts`.
 *
 * Lifecycle:
 *   draft → submitted → { blocked | assigned } → confirmed → completed
 *   any state → canceled
 *   any non-terminal state → failed
 *
 * Validation logic is in `src/lib/tours/requestValidation.ts` — this module
 * only handles persistence, auth, and audit logging.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Look up the buyer's current signed agreement state directly from the
 * `agreements` table. Returns the newest signed tour_pass OR
 * full_representation for this buyer, or null if none exists.
 *
 * This is the source of truth for tour eligibility — never trust a
 * client-supplied agreement snapshot (security regression: a malicious
 * buyer could forge `{type: "tour_pass", status: "signed"}` in createDraft
 * and bypass the tour-pass gate).
 */
async function loadCurrentAgreementSnapshot(
  ctx: MutationCtx,
  buyerId: Id<"users">,
): Promise<{
  type: "none" | "tour_pass" | "full_representation";
  status: "none" | "draft" | "sent" | "signed" | "replaced" | "canceled";
  signedAt?: string;
}> {
  const agreements = await ctx.db
    .query("agreements")
    .withIndex("by_buyerId", (q) => q.eq("buyerId", buyerId))
    .collect();

  // Prefer full_representation over tour_pass (it grants broader access).
  // Within each type, pick the most recently signed.
  const signedFullRep = agreements
    .filter((a) => a.type === "full_representation" && a.status === "signed")
    .sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""))
    .at(0);
  if (signedFullRep) {
    return {
      type: "full_representation",
      status: "signed",
      signedAt: signedFullRep.signedAt,
    };
  }

  const signedTourPass = agreements
    .filter((a) => a.type === "tour_pass" && a.status === "signed")
    .sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""))
    .at(0);
  if (signedTourPass) {
    return {
      type: "tour_pass",
      status: "signed",
      signedAt: signedTourPass.signedAt,
    };
  }

  return { type: "none", status: "none" };
}

// ═══ Inline input validation ═══
//
// These validation rules mirror the pure helper in
// src/lib/tours/requestValidation.ts. The src/ version is used by the
// buyer UI for client-side pre-validation; the Convex version is the
// authoritative check that runs on every mutation. Any rule change must
// be made in BOTH places — test coverage for both sides enforces parity.

interface ValidatedDraftInput {
  preferredWindows: Array<{ start: string; end: string }>;
  attendeeCount: number;
  buyerNotes?: string;
}

function validateInputOrThrow(
  input: {
    dealRoomId: string;
    propertyId: string;
    preferredWindows: Array<{ start: string; end: string }>;
    attendeeCount: number;
    buyerNotes?: string;
    agreementStateSnapshot: {
      type: "none" | "tour_pass" | "full_representation";
      status: "none" | "draft" | "sent" | "signed" | "replaced" | "canceled";
      signedAt?: string;
    };
  },
  now: string,
): ValidatedDraftInput {
  // Agreement check — tour pass or full representation required, signed
  const agType = input.agreementStateSnapshot.type;
  const agStatus = input.agreementStateSnapshot.status;
  if (
    (agType !== "tour_pass" && agType !== "full_representation") ||
    agStatus !== "signed"
  ) {
    throw new Error(
      "MISSING_TOUR_PASS: A signed tour pass or full representation agreement is required to request a tour",
    );
  }

  // Attendee count
  if (
    !Number.isInteger(input.attendeeCount) ||
    input.attendeeCount < 1 ||
    input.attendeeCount > 10
  ) {
    throw new Error(
      "INVALID_ATTENDEE_COUNT: Attendee count must be an integer between 1 and 10",
    );
  }

  // Date windows — 1 to 5
  if (input.preferredWindows.length === 0 || input.preferredWindows.length > 5) {
    throw new Error(
      "INVALID_DATE_WINDOW: Must provide between 1 and 5 preferred time windows",
    );
  }

  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) {
    throw new Error(
      "INVALID_DATE_WINDOW: Server clock is invalid — cannot validate windows",
    );
  }

  for (const window of input.preferredWindows) {
    const startMs = Date.parse(window.start);
    const endMs = Date.parse(window.end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new Error(
        "INVALID_DATE_WINDOW: Preferred window has unparseable start or end date",
      );
    }
    if (endMs <= startMs) {
      throw new Error(
        "INVALID_DATE_WINDOW: Preferred window end must be after start",
      );
    }
    if (startMs <= nowMs) {
      throw new Error(
        "INVALID_DATE_WINDOW: Preferred window start must be in the future",
      );
    }
  }

  return {
    preferredWindows: input.preferredWindows,
    attendeeCount: input.attendeeCount,
    buyerNotes: input.buyerNotes?.trim().slice(0, 2000),
  };
}

// ═══ Shared validators ═══

const windowValidator = v.object({
  start: v.string(),
  end: v.string(),
});

const agreementSnapshotValidator = v.object({
  type: v.union(
    v.literal("none"),
    v.literal("tour_pass"),
    v.literal("full_representation"),
  ),
  status: v.union(
    v.literal("none"),
    v.literal("draft"),
    v.literal("sent"),
    v.literal("signed"),
    v.literal("replaced"),
    v.literal("canceled"),
  ),
  signedAt: v.optional(v.string()),
});

// ═══ Queries ═══

/** Get a single tour request. Auth-gated to buyer owner or broker/admin. */
export const get = query({
  args: { requestId: v.id("tourRequests") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    if (
      request.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return null;
    }
    return request;
  },
});

/** List all tour requests for the authenticated buyer. */
export const listMine = query({
  args: { status: v.optional(v.string()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const all = await ctx.db
      .query("tourRequests")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .collect();
    const filtered = args.status
      ? all.filter((r) => r.status === args.status)
      : all;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

/** List requests for a deal room. Auth-gated. */
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
    return await ctx.db
      .query("tourRequests")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
  },
});

/** Ops queue — list all requests in "submitted" or "blocked" state. */
export const listForOps = query({
  args: { status: v.optional(v.string()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];
    const targetStatus = args.status ?? "submitted";
    return await ctx.db
      .query("tourRequests")
      .withIndex("by_status", (q) => q.eq("status", targetStatus as never))
      .collect();
  },
});

// ═══ Mutations ═══

/**
 * Create a draft tour request. The buyer owns the draft until submission;
 * brokers can also create drafts on behalf of buyers.
 *
 * IMPORTANT: `agreementStateSnapshot` is NOT a client input. It is derived
 * from the live `agreements` table at creation time. A malicious client
 * cannot forge a signed snapshot.
 *
 * Input validation enforces attendee count bounds (1-10), preferred window
 * count (1-5), window date parseability, ordering (end > start), and
 * future-only start times. Invalid drafts NEVER hit storage.
 */
export const createDraft = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    propertyId: v.id("properties"),
    preferredWindows: v.array(windowValidator),
    attendeeCount: v.number(),
    buyerNotes: v.optional(v.string()),
  },
  returns: v.id("tourRequests"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Verify deal room belongs to the buyer (or user is broker/admin)
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");
    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      throw new Error("Not authorized to create tour requests for this deal room");
    }

    // Verify property matches the deal room
    if (dealRoom.propertyId !== args.propertyId) {
      throw new Error("Property does not belong to the specified deal room");
    }

    // Derive agreement snapshot from the live agreements table. NEVER trust
    // a client-supplied snapshot — see loadCurrentAgreementSnapshot docs.
    const agreementStateSnapshot = await loadCurrentAgreementSnapshot(
      ctx,
      dealRoom.buyerId,
    );

    // Validate input BEFORE persisting. Invalid drafts never hit storage.
    // Import the validator dynamically to avoid circular deps with tests.
    const now = new Date().toISOString();
    const validation = validateInputOrThrow({
      dealRoomId: args.dealRoomId,
      propertyId: args.propertyId,
      preferredWindows: args.preferredWindows,
      attendeeCount: args.attendeeCount,
      buyerNotes: args.buyerNotes,
      agreementStateSnapshot,
    }, now);

    // Check for existing active request on this property for this buyer
    // (prevents accidental duplicates)
    const existing = await ctx.db
      .query("tourRequests")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", dealRoom.buyerId))
      .collect();
    const activeStatuses = new Set([
      "draft",
      "submitted",
      "blocked",
      "assigned",
      "confirmed",
    ]);
    const duplicate = existing.find(
      (r) =>
        r.propertyId === args.propertyId &&
        activeStatuses.has(r.status),
    );
    if (duplicate) {
      throw new Error(
        `DUPLICATE_REQUEST: An active tour request already exists for this property (status: ${duplicate.status})`,
      );
    }

    const id = await ctx.db.insert("tourRequests", {
      dealRoomId: args.dealRoomId,
      propertyId: args.propertyId,
      buyerId: dealRoom.buyerId,
      status: "draft",
      preferredWindows: validation.preferredWindows,
      attendeeCount: validation.attendeeCount,
      buyerNotes: validation.buyerNotes,
      agreementStateSnapshot,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_request_draft_created",
      entityType: "tourRequests",
      entityId: id,
      details: JSON.stringify({
        propertyId: args.propertyId,
        attendeeCount: args.attendeeCount,
        windowCount: args.preferredWindows.length,
      }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Submit a draft tour request for broker triage. Enforces preconditions:
 * agreement must be signed, windows must be valid, attendee count sane.
 */
export const submit = mutation({
  args: { requestId: v.id("tourRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Tour request not found");

    if (request.buyerId !== user._id && user.role !== "broker" && user.role !== "admin") {
      throw new Error("Not authorized");
    }

    if (request.status !== "draft") {
      throw new Error(`Cannot submit request in status "${request.status}"`);
    }

    // Re-derive agreement snapshot from the LIVE agreements table at
    // submission time. Never trust the stored snapshot — an agreement can
    // be canceled or replaced between draft creation and submission, and
    // we must catch that at this gate.
    const freshSnapshot = await loadCurrentAgreementSnapshot(
      ctx,
      request.buyerId,
    );
    if (
      (freshSnapshot.type !== "tour_pass" &&
        freshSnapshot.type !== "full_representation") ||
      freshSnapshot.status !== "signed"
    ) {
      throw new Error(
        "MISSING_TOUR_PASS: A signed tour pass or full representation agreement is required to submit this request",
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.requestId, {
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
      // Refresh the snapshot to reflect the live state at submission time
      agreementStateSnapshot: freshSnapshot,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_request_submitted",
      entityType: "tourRequests",
      entityId: args.requestId,
      timestamp: now,
    });

    return null;
  },
});

/** Broker/admin marks a request blocked with a structured reason. */
export const markBlocked = mutation({
  args: {
    requestId: v.id("tourRequests"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can block tour requests");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Tour request not found");
    if (request.status !== "submitted") {
      throw new Error(`Cannot block request in status "${request.status}"`);
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.requestId, {
      status: "blocked",
      blockingReason: args.reason,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_request_blocked",
      entityType: "tourRequests",
      entityId: args.requestId,
      details: JSON.stringify({ reason: args.reason }),
      timestamp: now,
    });
    return null;
  },
});

/** Broker/admin assigns a request to an agent. */
export const assignAgent = mutation({
  args: {
    requestId: v.id("tourRequests"),
    agentId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can assign tour requests");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Tour request not found");
    if (request.status !== "submitted" && request.status !== "blocked") {
      throw new Error(`Cannot assign request in status "${request.status}"`);
    }

    // Verify the agent exists and has the right role
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");
    if (agent.role !== "broker" && agent.role !== "admin") {
      throw new Error("Assigned user must be a broker or admin");
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.requestId, {
      status: "assigned",
      agentId: args.agentId,
      assignedAt: now,
      updatedAt: now,
      blockingReason: undefined,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_request_assigned",
      entityType: "tourRequests",
      entityId: args.requestId,
      details: JSON.stringify({ agentId: args.agentId }),
      timestamp: now,
    });
    return null;
  },
});

/** Assigned agent confirms the request and optionally links an executed tour. */
export const confirm = mutation({
  args: {
    requestId: v.id("tourRequests"),
    linkedTourId: v.optional(v.id("tours")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can confirm tour requests");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Tour request not found");
    if (request.status !== "assigned") {
      throw new Error(`Cannot confirm request in status "${request.status}"`);
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.requestId, {
      status: "confirmed",
      confirmedAt: now,
      updatedAt: now,
      linkedTourId: args.linkedTourId,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_request_confirmed",
      entityType: "tourRequests",
      entityId: args.requestId,
      timestamp: now,
    });
    return null;
  },
});

/** Mark a request completed (after the tour actually happened). */
export const markCompleted = mutation({
  args: { requestId: v.id("tourRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can mark requests completed");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Tour request not found");
    if (request.status !== "confirmed") {
      throw new Error(`Cannot complete request in status "${request.status}"`);
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.requestId, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_request_completed",
      entityType: "tourRequests",
      entityId: args.requestId,
      timestamp: now,
    });
    return null;
  },
});

/**
 * Cancel a request. The buyer can cancel their own request in any non-
 * terminal state. Brokers/admins can cancel any non-terminal request.
 */
export const cancel = mutation({
  args: {
    requestId: v.id("tourRequests"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Tour request not found");

    if (request.buyerId !== user._id && user.role !== "broker" && user.role !== "admin") {
      throw new Error("Not authorized");
    }

    const terminal = new Set(["completed", "canceled", "failed"]);
    if (terminal.has(request.status)) {
      throw new Error(`Cannot cancel request in terminal status "${request.status}"`);
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.requestId, {
      status: "canceled",
      canceledAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_request_canceled",
      entityType: "tourRequests",
      entityId: args.requestId,
      details: args.reason ? JSON.stringify({ reason: args.reason }) : undefined,
      timestamp: now,
    });
    return null;
  },
});

/**
 * Broker/admin marks a request failed with a structured reason. Drafts
 * cannot fail — the state machine says draft can only transition to
 * submitted or canceled. A buyer can cancel a draft they no longer want.
 * Failed is reserved for in-flight requests that hit an unrecoverable
 * problem after submission.
 */
export const markFailed = mutation({
  args: {
    requestId: v.id("tourRequests"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can mark requests failed");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Tour request not found");

    // Aligned with the client-side state machine in
    // src/lib/tours/requestValidation.ts: only in-flight post-submission
    // states can transition to failed.
    const failable = new Set([
      "submitted",
      "blocked",
      "assigned",
      "confirmed",
    ]);
    if (!failable.has(request.status)) {
      throw new Error(
        `ILLEGAL_TRANSITION: Cannot mark request failed from status "${request.status}" (only submitted, blocked, assigned, or confirmed can fail)`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.requestId, {
      status: "failed",
      failureReason: args.reason,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_request_failed",
      entityType: "tourRequests",
      entityId: args.requestId,
      details: JSON.stringify({ reason: args.reason }),
      timestamp: now,
    });
    return null;
  },
});

// ═══ Type helpers ═══

export type TourRequestDoc = Doc<"tourRequests">;
export type TourRequestId = Id<"tourRequests">;
