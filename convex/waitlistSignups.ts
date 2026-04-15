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
import { mutation, type MutationCtx } from "./_generated/server";
import { selectDriver } from "./mailRail";
import {
  WAITLIST_CONFIRMATION_TEMPLATE_KEY,
  buildWaitlistThrottleIdentifier,
  composeWaitlistConfirmationEmail,
} from "./lib/contactValidation";
import {
  checkAndPersistRateLimit,
  recordRateLimitOutcome,
} from "./lib/rateLimitBuckets";
import {
  isValidWaitlistEmail,
  isValidWaitlistStateCode,
  isValidWaitlistZip,
  isWaitlistHoneypotTripped,
  normalizeWaitlistEmail,
  normalizeWaitlistStateCode,
} from "./lib/waitlistValidation";

const DEFAULT_SUPPORT_EMAIL = "support@buyerv2.com";
const WAITLIST_FROM_NAME = "buyer-v2 Brokerage";

async function resolveSupportEmail(ctx: MutationCtx): Promise<string> {
  const row = await ctx.db
    .query("settingsEntries")
    .withIndex("by_key", (q) => q.eq("key", "ops.support_email"))
    .unique();

  if (
    row &&
    row.kind === "string" &&
    typeof row.stringValue === "string" &&
    row.stringValue.trim().length > 0
  ) {
    return row.stringValue.trim();
  }

  return DEFAULT_SUPPORT_EMAIL;
}

async function queueWaitlistConfirmation(args: {
  email: string;
  stateCode: string;
  zip?: string;
  sourcePath: string;
  signupId: string;
  supportEmail: string;
}): Promise<{
  provider: "noop" | "resend";
  providerMessageId?: string;
  queuedAt?: string;
}> {
  const driver = selectDriver();
  const message = composeWaitlistConfirmationEmail({
    stateCode: args.stateCode,
    zip: args.zip,
  });

  try {
    const { providerMessageId } = await driver.send({
      to: args.email,
      from: args.supportEmail,
      fromName: WAITLIST_FROM_NAME,
      subject: message.subject,
      bodyText: message.bodyText,
      replyTo: args.supportEmail,
      metadata: {
        feature: "kin-1096-waitlist",
        templateKey: WAITLIST_CONFIRMATION_TEMPLATE_KEY,
        waitlistSignupId: args.signupId,
        sourcePath: args.sourcePath,
      },
    });

    return {
      provider: driver.name,
      providerMessageId,
      queuedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[waitlistSignups] confirmation email failed", {
      waitlistSignupId: args.signupId,
      provider: driver.name,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { provider: driver.name };
  }
}

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

    const identifier = await buildWaitlistThrottleIdentifier({
      email: normalizedEmail,
      stateCode: upperState,
    });
    const rateLimit = await checkAndPersistRateLimit(ctx, {
      channel: "waitlist_public",
      identifier,
    });

    if (!rateLimit.state.allowed) {
      return { ok: false, reason: "rate_limited" as const };
    }

    try {
      const existing = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_email_and_stateCode", (q) =>
          q.eq("email", normalizedEmail).eq("stateCode", upperState),
        )
        .unique();

      const now = new Date().toISOString();
      const normalizedSourcePath = args.sourcePath.trim() || "/";
      const supportEmail = await resolveSupportEmail(ctx);

      if (existing) {
        await ctx.db.patch(existing._id, {
          zip: args.zip ?? existing.zip,
          sourcePath: normalizedSourcePath,
          attributionSessionId:
            args.attributionSessionId ?? existing.attributionSessionId,
          userAgent: args.userAgent ?? existing.userAgent,
          updatedAt: now,
        });

        const alreadyConfirmed =
          (typeof existing.confirmationEmailQueuedAt === "string" &&
            existing.confirmationEmailQueuedAt.length > 0) ||
          (typeof existing.confirmationEmailProviderMessageId === "string" &&
            existing.confirmationEmailProviderMessageId.length > 0) ||
          (typeof existing.confirmationEmailTemplateKey === "string" &&
            existing.confirmationEmailTemplateKey.length > 0);

        if (!alreadyConfirmed) {
          const delivery = await queueWaitlistConfirmation({
            email: normalizedEmail,
            stateCode: upperState,
            zip: args.zip ?? existing.zip,
            sourcePath: normalizedSourcePath,
            signupId: existing._id,
            supportEmail,
          });
          if (delivery.providerMessageId && delivery.queuedAt) {
            await ctx.db.patch(existing._id, {
              confirmationEmailProvider: delivery.provider,
              confirmationEmailProviderMessageId:
                delivery.providerMessageId,
              confirmationEmailQueuedAt: delivery.queuedAt,
              confirmationEmailTemplateKey:
                WAITLIST_CONFIRMATION_TEMPLATE_KEY,
              updatedAt: new Date().toISOString(),
            });
          }
        }

        await recordRateLimitOutcome(ctx, {
          channel: "waitlist_public",
          identifier,
          outcome: "success",
        });
        return { ok: true };
      }

      const signupId = await ctx.db.insert("waitlistSignups", {
        email: normalizedEmail,
        stateCode: upperState,
        zip: args.zip ?? undefined,
        sourcePath: normalizedSourcePath,
        attributionSessionId: args.attributionSessionId,
        userAgent: args.userAgent,
        createdAt: now,
        updatedAt: now,
      });

      const delivery = await queueWaitlistConfirmation({
        email: normalizedEmail,
        stateCode: upperState,
        zip: args.zip ?? undefined,
        sourcePath: normalizedSourcePath,
        signupId,
        supportEmail,
      });
      if (delivery.providerMessageId && delivery.queuedAt) {
        await ctx.db.patch(signupId, {
          confirmationEmailProvider: delivery.provider,
          confirmationEmailProviderMessageId: delivery.providerMessageId,
          confirmationEmailQueuedAt: delivery.queuedAt,
          confirmationEmailTemplateKey: WAITLIST_CONFIRMATION_TEMPLATE_KEY,
          updatedAt: new Date().toISOString(),
        });
      }

      await recordRateLimitOutcome(ctx, {
        channel: "waitlist_public",
        identifier,
        outcome: "success",
      });
      return { ok: true };
    } catch (error) {
      await recordRateLimitOutcome(ctx, {
        channel: "waitlist_public",
        identifier,
        outcome: "failure",
      });
      throw error;
    }
  },
});
