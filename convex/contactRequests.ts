import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { selectDriver } from "./mailRail";
import {
  CONTACT_BROKER_TEMPLATE_KEY,
  CONTACT_BUYER_TEMPLATE_KEY,
  type ContactSubmitResult,
  buildContactThrottleIdentifier,
  composeContactBrokerEmail,
  composeContactBuyerEmail,
  isContactHoneypotTripped,
  isValidContactEmail,
  isValidContactMessage,
  isValidContactName,
  normalizeContactEmail,
  normalizeContactListingLink,
  normalizeContactMessage,
  normalizeContactName,
  normalizeContactSourcePath,
} from "./lib/contactValidation";
import {
  checkAndPersistRateLimit,
  recordRateLimitOutcome,
} from "./lib/rateLimitBuckets";

const DEFAULT_SUPPORT_EMAIL = "support@buyerv2.com";
const CONTACT_FROM_NAME = "buyer-v2 Brokerage";

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

async function queueBrokerInboxEmail(args: {
  triageEmail: string;
  requestId: string;
  name: string;
  email: string;
  message: string;
  listingLink?: string;
  sourcePath: string;
  receivedAt: string;
  attributionSessionId?: string;
  userAgent?: string;
}): Promise<{
  provider: "noop" | "resend";
  providerMessageId?: string;
  queuedAt?: string;
}> {
  const driver = selectDriver();
  const message = composeContactBrokerEmail({
    requestId: args.requestId,
    name: args.name,
    email: args.email,
    message: args.message,
    listingLink: args.listingLink,
    sourcePath: args.sourcePath,
    receivedAt: args.receivedAt,
    attributionSessionId: args.attributionSessionId,
    userAgent: args.userAgent,
  });

  try {
    const { providerMessageId } = await driver.send({
      to: args.triageEmail,
      from: args.triageEmail,
      fromName: CONTACT_FROM_NAME,
      subject: message.subject,
      bodyText: message.bodyText,
      replyTo: args.email,
      metadata: {
        feature: "kin-1096-contact-request",
        templateKey: CONTACT_BROKER_TEMPLATE_KEY,
        contactRequestId: args.requestId,
        sourcePath: args.sourcePath,
      },
    });

    return {
      provider: driver.name,
      providerMessageId,
      queuedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[contactRequests] broker inbox email failed", {
      contactRequestId: args.requestId,
      provider: driver.name,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { provider: driver.name };
  }
}

async function queueBuyerAutoReply(args: {
  triageEmail: string;
  requestId: string;
  name: string;
  email: string;
  listingLink?: string;
  sourcePath: string;
}): Promise<{
  provider: "noop" | "resend";
  providerMessageId?: string;
  queuedAt?: string;
}> {
  const driver = selectDriver();
  const message = composeContactBuyerEmail({
    name: args.name,
    listingLink: args.listingLink,
  });

  try {
    const { providerMessageId } = await driver.send({
      to: args.email,
      from: args.triageEmail,
      fromName: CONTACT_FROM_NAME,
      subject: message.subject,
      bodyText: message.bodyText,
      replyTo: args.triageEmail,
      metadata: {
        feature: "kin-1096-contact-request",
        templateKey: CONTACT_BUYER_TEMPLATE_KEY,
        contactRequestId: args.requestId,
        sourcePath: args.sourcePath,
      },
    });

    return {
      provider: driver.name,
      providerMessageId,
      queuedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[contactRequests] buyer auto-reply failed", {
      contactRequestId: args.requestId,
      provider: driver.name,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { provider: driver.name };
  }
}

/**
 * Public marketing `/contact` submit path.
 *
 * Durable write comes first; outbound email is best-effort off the same
 * shared rail and patches provider metadata back onto the stored row for
 * later support/debugging.
 */
export const submitPublic = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    message: v.string(),
    listingLink: v.optional(v.string()),
    sourcePath: v.string(),
    attributionSessionId: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    honeypot: v.optional(v.string()),
    throttleId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(
      v.union(
        v.literal("honeypot"),
        v.literal("rate_limited"),
        v.literal("invalid_name"),
        v.literal("invalid_email"),
        v.literal("invalid_message"),
        v.literal("invalid_listing_link"),
      ),
    ),
  }),
  handler: async (ctx, args): Promise<ContactSubmitResult> => {
    if (isContactHoneypotTripped(args.honeypot)) {
      return { ok: false, reason: "honeypot" };
    }

    const normalizedName = normalizeContactName(args.name);
    const normalizedEmail = normalizeContactEmail(args.email);
    const normalizedMessage = normalizeContactMessage(args.message);
    const normalizedSourcePath = normalizeContactSourcePath(args.sourcePath);
    const rawListingLink = args.listingLink?.trim();
    const normalizedListingLink = normalizeContactListingLink(args.listingLink);

    if (!isValidContactName(normalizedName)) {
      return { ok: false, reason: "invalid_name" };
    }
    if (!isValidContactEmail(normalizedEmail)) {
      return { ok: false, reason: "invalid_email" };
    }
    if (!isValidContactMessage(normalizedMessage)) {
      return { ok: false, reason: "invalid_message" };
    }
    if (rawListingLink && !normalizedListingLink) {
      return { ok: false, reason: "invalid_listing_link" };
    }

    const identifier = await buildContactThrottleIdentifier({
      sourcePath: normalizedSourcePath,
      email: normalizedEmail,
      throttleId: args.throttleId,
    });
    const rateLimit = await checkAndPersistRateLimit(ctx, {
      channel: "contact_public",
      identifier,
    });

    if (!rateLimit.state.allowed) {
      return { ok: false, reason: "rate_limited" };
    }

    try {
      const now = new Date().toISOString();
      const triageEmail = await resolveSupportEmail(ctx);

      const requestId = await ctx.db.insert("contactRequests", {
        name: normalizedName,
        email: normalizedEmail,
        message: normalizedMessage,
        listingLink: normalizedListingLink,
        sourcePath: normalizedSourcePath,
        attributionSessionId: args.attributionSessionId,
        userAgent: args.userAgent,
        triageEmail,
        createdAt: now,
        updatedAt: now,
      });

      const brokerDelivery = await queueBrokerInboxEmail({
        triageEmail,
        requestId,
        name: normalizedName,
        email: normalizedEmail,
        message: normalizedMessage,
        listingLink: normalizedListingLink,
        sourcePath: normalizedSourcePath,
        receivedAt: now,
        attributionSessionId: args.attributionSessionId,
        userAgent: args.userAgent,
      });
      const buyerDelivery = await queueBuyerAutoReply({
        triageEmail,
        requestId,
        name: normalizedName,
        email: normalizedEmail,
        listingLink: normalizedListingLink,
        sourcePath: normalizedSourcePath,
      });

      await ctx.db.patch(requestId, {
        brokerInboxProvider: brokerDelivery.provider,
        ...(brokerDelivery.providerMessageId
          ? {
              brokerInboxProviderMessageId: brokerDelivery.providerMessageId,
              brokerInboxQueuedAt: brokerDelivery.queuedAt,
              brokerInboxTemplateKey: CONTACT_BROKER_TEMPLATE_KEY,
            }
          : {}),
        buyerAutoReplyProvider: buyerDelivery.provider,
        ...(buyerDelivery.providerMessageId
          ? {
              buyerAutoReplyProviderMessageId:
                buyerDelivery.providerMessageId,
              buyerAutoReplyQueuedAt: buyerDelivery.queuedAt,
              buyerAutoReplyTemplateKey: CONTACT_BUYER_TEMPLATE_KEY,
            }
          : {}),
        updatedAt: new Date().toISOString(),
      });

      await recordRateLimitOutcome(ctx, {
        channel: "contact_public",
        identifier,
        outcome: "success",
      });

      return { ok: true };
    } catch (error) {
      await recordRateLimitOutcome(ctx, {
        channel: "contact_public",
        identifier,
        outcome: "failure",
      });
      throw error;
    }
  },
});
