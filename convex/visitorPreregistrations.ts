import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Visitor pre-registration mutations (KIN-824).
 *
 * Lightweight open-house RSVP flow. Explicitly distinct from the
 * private-tour request flow (KIN-802) — no buyer representation
 * agreement is created, no showing agent is dispatched, no tour
 * state machine is entered. This is a top-of-funnel capture that
 * CAN optionally transition into a deeper representation state via
 * `recordConversion`.
 *
 * Pure decision logic lives in `src/lib/preregistration/logic.ts`
 * for unit testing. Convex files cannot import from `src/`, so this
 * file duplicates the minimum inline logic needed (dedupe check,
 * transition guard). Keep the two implementations aligned.
 */

// MARK: - Validators

const statusValidator = v.union(
  v.literal("created"),
  v.literal("reminded"),
  v.literal("attended"),
  v.literal("noShow"),
  v.literal("converted"),
  v.literal("canceled")
);

const conversionKindValidator = v.union(
  v.literal("buyer_agreement_signed"),
  v.literal("private_tour_requested"),
  v.literal("deal_room_created")
);

// MARK: - Registration (public — no auth)

/**
 * Submit a visitor pre-registration. Public endpoint — anyone can
 * RSVP to an open house without an account. Caller must validate +
 * normalize the input via `validateAndNormalize` from
 * `src/lib/preregistration/logic.ts` before calling this.
 *
 * Dedupe:
 *   - If an existing "converted" record matches, return its id with
 *     `wasBlockedByConversion: true` so the UI can redirect.
 *   - If an existing "created" or "reminded" record matches, patch
 *     it with the new party size / note / phone instead of inserting
 *     a duplicate.
 *   - Otherwise insert a fresh row.
 */
export const register = mutation({
  args: {
    propertyId: v.id("properties"),
    eventStartAt: v.string(),
    eventEndAt: v.string(),
    visitorName: v.string(),
    visitorEmail: v.string(),
    visitorPhone: v.optional(v.string()),
    partySize: v.number(),
    visitorNote: v.optional(v.string()),
  },
  returns: v.object({
    id: v.id("visitorPreregistrations"),
    wasUpdate: v.boolean(),
    wasBlockedByConversion: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    // Normalized email — callers are expected to pass lowercase, but
    // we defensively lowercase here too.
    const normalizedEmail = args.visitorEmail.trim().toLowerCase();

    // Lookup existing records for this property + visitor email.
    const candidates = await ctx.db
      .query("visitorPreregistrations")
      .withIndex("by_propertyId_and_visitorEmail", (q) =>
        q.eq("propertyId", args.propertyId).eq("visitorEmail", normalizedEmail)
      )
      .collect();

    // Filter to matching event window
    const matching = candidates.filter(
      (r) =>
        r.eventStartAt === args.eventStartAt &&
        r.eventEndAt === args.eventEndAt
    );

    // Rule 1: blocked by a prior conversion
    const converted = matching.find((r) => r.status === "converted");
    if (converted) {
      return {
        id: converted._id,
        wasUpdate: false,
        wasBlockedByConversion: true,
      };
    }

    // Rule 2: update existing created/reminded
    const reusable = matching.find(
      (r) => r.status === "created" || r.status === "reminded"
    );
    if (reusable) {
      await ctx.db.patch(reusable._id, {
        visitorName: args.visitorName,
        visitorPhone: args.visitorPhone ?? reusable.visitorPhone,
        partySize: args.partySize,
        visitorNote: args.visitorNote ?? reusable.visitorNote,
        updatedAt: now,
      });
      return {
        id: reusable._id,
        wasUpdate: true,
        wasBlockedByConversion: false,
      };
    }

    // Rule 3: insert fresh
    const insertedId = await ctx.db.insert("visitorPreregistrations", {
      propertyId: args.propertyId,
      eventStartAt: args.eventStartAt,
      eventEndAt: args.eventEndAt,
      visitorName: args.visitorName,
      visitorEmail: normalizedEmail,
      visitorPhone: args.visitorPhone,
      partySize: args.partySize,
      visitorNote: args.visitorNote,
      status: "created",
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: insertedId,
      wasUpdate: false,
      wasBlockedByConversion: false,
    };
  },
});

// MARK: - Status transitions (ops only — TODO: auth once ops surface ships)

/**
 * Mark a pre-registration as reminded. Called by the reminder job
 * after a notification is sent to the visitor.
 */
export const markReminded = mutation({
  args: { id: v.id("visitorPreregistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) return null;
    if (record.status !== "created") return null;
    await ctx.db.patch(args.id, {
      status: "reminded",
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

/**
 * Mark a pre-registration as attended. Called by ops at the event.
 */
export const markAttended = mutation({
  args: { id: v.id("visitorPreregistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) return null;
    if (record.status !== "created" && record.status !== "reminded") {
      return null;
    }
    await ctx.db.patch(args.id, {
      status: "attended",
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

/**
 * Mark as no-show after the event.
 */
export const markNoShow = mutation({
  args: { id: v.id("visitorPreregistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) return null;
    if (record.status !== "created" && record.status !== "reminded") {
      return null;
    }
    await ctx.db.patch(args.id, {
      status: "noShow",
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

/**
 * Cancel a pre-registration. Called by the visitor (from a
 * confirmation email link) or by ops.
 */
export const cancel = mutation({
  args: { id: v.id("visitorPreregistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) return null;
    // Only non-terminal states can be canceled
    if (record.status === "converted" || record.status === "canceled") {
      return null;
    }
    await ctx.db.patch(args.id, {
      status: "canceled",
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

/**
 * Record an explicit conversion from pre-registration into a
 * deeper representation state (buyer agreement signed, private
 * tour requested, or deal room created). This is the ONLY way the
 * pre-registration flow reaches a terminal `converted` state.
 *
 * Allowed source states: created, reminded, attended, noShow.
 * Already-terminal states (canceled, converted) reject the write.
 */
export const recordConversion = mutation({
  args: {
    id: v.id("visitorPreregistrations"),
    conversionKind: conversionKindValidator,
    targetRefId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) return null;

    // Terminal states are non-transitionable
    if (record.status === "canceled" || record.status === "converted") {
      return null;
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      status: "converted",
      conversion: {
        kind: args.conversionKind,
        targetRefId: args.targetRefId,
        convertedAt: now,
      },
      updatedAt: now,
    });
    return null;
  },
});

// MARK: - Queries

/**
 * List pre-registrations for a property (ops view).
 */
export const listForProperty = query({
  args: {
    propertyId: v.id("properties"),
    status: v.optional(statusValidator),
  },
  returns: v.array(
    v.object({
      _id: v.id("visitorPreregistrations"),
      _creationTime: v.number(),
      propertyId: v.id("properties"),
      eventStartAt: v.string(),
      eventEndAt: v.string(),
      visitorName: v.string(),
      visitorEmail: v.string(),
      visitorPhone: v.optional(v.string()),
      partySize: v.number(),
      visitorNote: v.optional(v.string()),
      status: statusValidator,
      conversion: v.optional(
        v.object({
          kind: conversionKindValidator,
          targetRefId: v.string(),
          convertedAt: v.string(),
        })
      ),
      createdAt: v.string(),
      updatedAt: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("visitorPreregistrations")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    if (args.status) {
      return rows.filter((r) => r.status === args.status);
    }
    return rows;
  },
});
