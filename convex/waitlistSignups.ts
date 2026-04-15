// ═══════════════════════════════════════════════════════════════════════════
// Waitlist signups (KIN-1088) — Convex functions
//
// Captures non-Florida demand from the public marketing site so we can
// reach back out the moment buyer-v2 launches in a new state.
//
// Access rules:
//   - `upsert` is a public mutation (no auth). It runs on the
//     unauthenticated marketing surface; abuse mitigation is enforced
//     in-mutation via a honeypot field and a 60-second per-(email,state)
//     rate limit. The trust model mirrors `convex/leadAttribution.ts`.
//
// See `convex/lib/waitlistValidation.ts` for the pure validators that
// this mutation composes — they are unit-tested independently in
// `src/__tests__/convex/waitlistSignups.test.ts`.
// ═══════════════════════════════════════════════════════════════════════════

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import {
  isValidWaitlistEmail,
  isValidWaitlistStateCode,
  isValidWaitlistZip,
  isWaitlistHoneypotTripped,
  isWithinWaitlistRateLimitWindow,
  normalizeWaitlistEmail,
  normalizeWaitlistStateCode,
} from "./lib/waitlistValidation";

/**
 * Public upsert. Returns a structured result instead of throwing so the
 * marketing dialog can render typed inline errors without coupling to
 * the Convex error string format.
 */
export const upsert = mutation({
  args: {
    email: v.string(),
    stateCode: v.string(),
    zip: v.optional(v.string()),
    sourcePath: v.string(),
    attributionSessionId: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    // Honeypot bot trap — must be empty when the request comes from a
    // real browser. The visible form leaves this hidden; bots that
    // auto-fill every field will populate it and be rejected.
    honeypot: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(
      v.union(
        v.literal("honeypot"),
        v.literal("rate_limited"),
        v.literal("invalid_email"),
        v.literal("invalid_state"),
        v.literal("invalid_zip"),
      ),
    ),
  }),
  handler: async (ctx, args) => {
    if (isWaitlistHoneypotTripped(args.honeypot)) {
      return { ok: false, reason: "honeypot" as const };
    }

    const normalizedEmail = normalizeWaitlistEmail(args.email);
    if (!isValidWaitlistEmail(normalizedEmail)) {
      return { ok: false, reason: "invalid_email" as const };
    }

    const upperState = normalizeWaitlistStateCode(args.stateCode);
    if (!isValidWaitlistStateCode(upperState)) {
      return { ok: false, reason: "invalid_state" as const };
    }

    if (!isValidWaitlistZip(args.zip)) {
      return { ok: false, reason: "invalid_zip" as const };
    }

    const existing = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_email_and_stateCode", (q) =>
        q.eq("email", normalizedEmail).eq("stateCode", upperState),
      )
      .unique();

    const now = new Date().toISOString();

    if (existing) {
      if (isWithinWaitlistRateLimitWindow(existing.updatedAt, Date.now())) {
        return { ok: false, reason: "rate_limited" as const };
      }
      await ctx.db.patch(existing._id, {
        zip: args.zip ?? existing.zip,
        sourcePath: args.sourcePath,
        attributionSessionId:
          args.attributionSessionId ?? existing.attributionSessionId,
        userAgent: args.userAgent ?? existing.userAgent,
        updatedAt: now,
      });
      return { ok: true };
    }

    await ctx.db.insert("waitlistSignups", {
      email: normalizedEmail,
      stateCode: upperState,
      zip: args.zip ?? undefined,
      sourcePath: args.sourcePath,
      attributionSessionId: args.attributionSessionId,
      userAgent: args.userAgent,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true };
  },
});
