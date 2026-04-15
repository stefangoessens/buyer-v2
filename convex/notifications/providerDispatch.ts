"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { getProviderAdapter } from "./providerAdapters";

const deliveryChannelValidator = v.union(
  v.literal("email"),
  v.literal("sms"),
  v.literal("push"),
);

const deliveryCategoryValidator = v.union(
  v.literal("transactional"),
  v.literal("tours"),
  v.literal("offers"),
  v.literal("closing"),
  v.literal("disclosures"),
  v.literal("market_updates"),
  v.literal("marketing"),
  v.literal("safety"),
);

const deliveryUrgencyValidator = v.union(
  v.literal("transactional_must_deliver"),
  v.literal("transactional"),
  v.literal("relationship"),
  v.literal("digest_only"),
);

export const dispatchDelivery = internalAction({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    dedupeKey: v.string(),
    recipientKey: v.string(),
    channel: deliveryChannelValidator,
    provider: v.union(v.literal("resend"), v.literal("twilio"), v.literal("apns")),
    category: deliveryCategoryValidator,
    urgency: deliveryUrgencyValidator,
    attemptNumber: v.number(),
    idempotencyKey: v.string(),
    templateKey: v.string(),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  returns: v.object({
    provider: v.union(v.literal("resend"), v.literal("twilio"), v.literal("apns")),
    providerEventId: v.string(),
    providerMessageId: v.string(),
    status: v.union(
      v.literal("accepted"),
      v.literal("dispatched"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    failureKind: v.optional(v.union(v.literal("transient"), v.literal("permanent"))),
    reason: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    const adapter = getProviderAdapter(args.channel);
    return await adapter.send(args);
  },
});
