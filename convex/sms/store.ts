// @ts-nocheck
import { internalMutation, internalQuery } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import {
  notificationSuppressionReason,
  notificationSuppressionScope,
  notificationSuppressionSource,
  smsMessageDirection,
  smsMessageProcessingStatus,
  smsMessageProviderState,
} from "../lib/validators";
import { hashPhone, normalizePhone } from "../lib/smsIntakeCompute";

const parsedUrlValidator = v.object({
  rawUrl: v.string(),
  normalizedUrl: v.optional(v.string()),
  portal: v.optional(
    v.union(
      v.literal("zillow"),
      v.literal("redfin"),
      v.literal("realtor"),
      v.literal("homes"),
      v.literal("compass"),
      v.literal("trulia"),
    ),
  ),
  listingId: v.optional(v.string()),
  addressHint: v.optional(v.string()),
});

export const findMessageBySid = internalQuery({
  args: { twilioMessageSid: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("smsMessages"),
      _creationTime: v.number(),
      twilioMessageSid: v.string(),
      direction: smsMessageDirection,
      fromPhone: v.string(),
      toPhone: v.string(),
      body: v.string(),
      status: smsMessageProcessingStatus,
      providerState: smsMessageProviderState,
      parsedUrls: v.optional(v.array(parsedUrlValidator)),
      buyerId: v.optional(v.id("users")),
      dealRoomId: v.optional(v.id("dealRooms")),
      createdDealRoomId: v.optional(v.id("dealRooms")),
      propertyId: v.optional(v.id("properties")),
      errorReason: v.optional(v.string()),
      receivedAt: v.string(),
      processedAt: v.optional(v.string()),
      statusUpdatedAt: v.optional(v.string()),
      providerStateUpdatedAt: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("smsMessages")
      .withIndex("by_twilioMessageSid", (q) =>
        q.eq("twilioMessageSid", args.twilioMessageSid),
      )
      .unique();
  },
});

export const getMessageById = internalQuery({
  args: { messageId: v.id("smsMessages") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

export const upsertInboundMessage = internalMutation({
  args: {
    twilioMessageSid: v.string(),
    fromPhone: v.string(),
    toPhone: v.string(),
    body: v.string(),
    providerState: smsMessageProviderState,
    status: smsMessageProcessingStatus,
    receivedAt: v.string(),
  },
  returns: v.object({
    messageId: v.id("smsMessages"),
    existed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("smsMessages")
      .withIndex("by_twilioMessageSid", (q) =>
        q.eq("twilioMessageSid", args.twilioMessageSid),
      )
      .unique();

    if (existing) {
      return { messageId: existing._id, existed: true };
    }

    const messageId = await ctx.db.insert("smsMessages", {
      twilioMessageSid: args.twilioMessageSid,
      direction: "inbound",
      fromPhone: args.fromPhone,
      toPhone: args.toPhone,
      body: args.body,
      status: args.status,
      providerState: args.providerState,
      receivedAt: args.receivedAt,
      statusUpdatedAt: args.receivedAt,
      providerStateUpdatedAt: args.receivedAt,
    });

    return { messageId, existed: false };
  },
});

export const createOutboundMessage = internalMutation({
  args: {
    twilioMessageSid: v.string(),
    fromPhone: v.string(),
    toPhone: v.string(),
    body: v.string(),
    providerState: smsMessageProviderState,
    status: smsMessageProcessingStatus,
    receivedAt: v.string(),
    buyerId: v.optional(v.id("users")),
    dealRoomId: v.optional(v.id("dealRooms")),
    propertyId: v.optional(v.id("properties")),
  },
  returns: v.id("smsMessages"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("smsMessages", {
      twilioMessageSid: args.twilioMessageSid,
      direction: "outbound",
      fromPhone: args.fromPhone,
      toPhone: args.toPhone,
      body: args.body,
      status: args.status,
      providerState: args.providerState,
      buyerId: args.buyerId,
      dealRoomId: args.dealRoomId,
      propertyId: args.propertyId,
      receivedAt: args.receivedAt,
      statusUpdatedAt: args.receivedAt,
      providerStateUpdatedAt: args.receivedAt,
    });
  },
});

export const patchMessage = internalMutation({
  args: {
    messageId: v.id("smsMessages"),
    status: v.optional(smsMessageProcessingStatus),
    providerState: v.optional(smsMessageProviderState),
    parsedUrls: v.optional(v.array(parsedUrlValidator)),
    buyerId: v.optional(v.id("users")),
    dealRoomId: v.optional(v.id("dealRooms")),
    createdDealRoomId: v.optional(v.id("dealRooms")),
    propertyId: v.optional(v.id("properties")),
    errorReason: v.optional(v.union(v.string(), v.null())),
    processedAt: v.optional(v.string()),
    statusUpdatedAt: v.optional(v.string()),
    providerStateUpdatedAt: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.status !== undefined) patch.status = args.status;
    if (args.providerState !== undefined) patch.providerState = args.providerState;
    if (args.parsedUrls !== undefined) patch.parsedUrls = args.parsedUrls;
    if (args.buyerId !== undefined) patch.buyerId = args.buyerId;
    if (args.dealRoomId !== undefined) patch.dealRoomId = args.dealRoomId;
    if (args.createdDealRoomId !== undefined) {
      patch.createdDealRoomId = args.createdDealRoomId;
    }
    if (args.propertyId !== undefined) patch.propertyId = args.propertyId;
    if (args.errorReason !== undefined) {
      patch.errorReason = args.errorReason ?? undefined;
    }
    if (args.processedAt !== undefined) patch.processedAt = args.processedAt;
    if (args.statusUpdatedAt !== undefined) {
      patch.statusUpdatedAt = args.statusUpdatedAt;
    }
    if (args.providerStateUpdatedAt !== undefined) {
      patch.providerStateUpdatedAt = args.providerStateUpdatedAt;
    }
    await ctx.db.patch(args.messageId, patch);
    return null;
  },
});

export const findVerifiedBuyerByPhone = internalQuery({
  args: { phone: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      phone: v.string(),
      profileId: v.union(v.id("buyerProfiles"), v.null()),
      smsConsentState: v.union(
        v.literal("unknown"),
        v.literal("pending"),
        v.literal("verified"),
        v.literal("opted_out"),
        v.literal("suppressed"),
      ),
      phoneVerifiedAt: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.phone);
    if (!normalizedPhone) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("phone", (q) => q.eq("phone", normalizedPhone))
      .unique();
    if (!user || user.role !== "buyer") return null;

    const profile = await ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const smsConsentState = profile?.smsConsentState ?? "unknown";
    const phoneVerifiedAt = profile?.phoneVerifiedAt ?? null;
    if (smsConsentState !== "verified" || !phoneVerifiedAt) {
      return null;
    }

    return {
      userId: user._id,
      name: user.name,
      phone: normalizedPhone,
      profileId: profile?._id ?? null,
      smsConsentState,
      phoneVerifiedAt,
    };
  },
});

export const getSuppressionState = internalQuery({
  args: { phone: v.string() },
  returns: v.object({
    recipientHash: v.string(),
    isSuppressed: v.boolean(),
    scopes: v.array(notificationSuppressionScope),
  }),
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.phone);
    const recipientHash = normalizedPhone ? await hashPhone(normalizedPhone) : "";
    if (!normalizedPhone) {
      return { recipientHash, isSuppressed: false, scopes: [] };
    }

    const rows = await ctx.db
      .query("notificationSuppressions")
      .withIndex("by_recipientHash", (q) => q.eq("recipientHash", recipientHash))
      .collect();

    return {
      recipientHash,
      isSuppressed: rows.length > 0,
      scopes: rows.map((row) => row.scope),
    };
  },
});

export const suppressPhone = internalMutation({
  args: {
    phone: v.string(),
    scope: notificationSuppressionScope,
    reason: notificationSuppressionReason,
    source: notificationSuppressionSource,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.phone);
    if (!normalizedPhone) return null;

    const recipientHash = await hashPhone(normalizedPhone);
    const existing = await ctx.db
      .query("notificationSuppressions")
      .withIndex("by_recipientHash_and_scope", (q) =>
        q.eq("recipientHash", recipientHash).eq("scope", args.scope),
      )
      .unique();
    const now = new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        reason: args.reason,
        source: args.source,
        note: args.note,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.insert("notificationSuppressions", {
      recipientHash,
      scope: args.scope,
      reason: args.reason,
      source: args.source,
      note: args.note,
      createdAt: now,
      updatedAt: now,
    });

    return null;
  },
});

export const clearPhoneSuppression = internalMutation({
  args: {
    phone: v.string(),
    scope: v.optional(notificationSuppressionScope),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.phone);
    if (!normalizedPhone) return null;

    const recipientHash = await hashPhone(normalizedPhone);
    const rows = await ctx.db
      .query("notificationSuppressions")
      .withIndex("by_recipientHash", (q) => q.eq("recipientHash", recipientHash))
      .collect();

    for (const row of rows) {
      if (args.scope && row.scope !== args.scope) continue;
      await ctx.db.delete(row._id);
    }

    return null;
  },
});

export const upsertSourceListingForSms = internalMutation({
  args: {
    url: v.string(),
    platform: v.union(
      v.literal("zillow"),
      v.literal("redfin"),
      v.literal("realtor"),
    ),
  },
  returns: v.object({
    sourceListingId: v.id("sourceListings"),
    existed: v.boolean(),
    propertyId: v.optional(v.id("properties")),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sourceListings")
      .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", args.url))
      .unique();
    if (existing) {
      return {
        sourceListingId: existing._id,
        existed: true,
        propertyId: existing.propertyId,
      };
    }

    const sourceListingId = await ctx.db.insert("sourceListings", {
      sourcePlatform: args.platform,
      sourceUrl: args.url,
      rawData: JSON.stringify({ source: "sms_inbound" }),
      extractedAt: new Date().toISOString(),
      status: "pending",
    });

    return {
      sourceListingId,
      existed: false,
    };
  },
});

export const getSourceListing = internalQuery({
  args: { sourceListingId: v.id("sourceListings") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sourceListingId);
  },
});

export const createOrReuseSmsDealRoom = internalMutation({
  args: {
    buyerId: v.id("users"),
    propertyId: v.id("properties"),
    originMessageId: v.id("smsMessages"),
  },
  returns: v.object({
    dealRoomId: v.id("dealRooms"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", args.buyerId))
      .collect();
    const match = existing.find((row) => row.propertyId === args.propertyId);
    if (match) {
      await ctx.db.patch(match._id, {
        origin: match.origin ?? "sms_inbound",
        originMessageId: match.originMessageId ?? args.originMessageId,
        updatedAt: new Date().toISOString(),
      });
      return { dealRoomId: match._id, created: false };
    }

    const now = new Date().toISOString();
    const dealRoomId = await ctx.db.insert("dealRooms", {
      buyerId: args.buyerId,
      propertyId: args.propertyId,
      status: "analysis",
      accessLevel: "registered",
      origin: "sms_inbound",
      originMessageId: args.originMessageId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(api.leadAttribution.markConverted, {
      userId: args.buyerId,
    });

    return { dealRoomId, created: true };
  },
});

export const getSupportEmail = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settingsEntries")
      .withIndex("by_key", (q) => q.eq("key", "ops.support_email"))
      .unique();
    return row?.stringValue ?? "support@buyerv2.com";
  },
});

export const getRuntimeSettings = internalQuery({
  args: {},
  returns: v.object({
    supportEmail: v.string(),
    brandName: v.string(),
    maxInboundPerBuyerPerHour: v.number(),
    inboundEnabled: v.boolean(),
    outboundEnabled: v.boolean(),
  }),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("settingsEntries")
      .collect();
    const byKey = new Map(rows.map((row) => [row.key, row]));

    return {
      supportEmail:
        byKey.get("ops.support_email")?.stringValue ?? "support@buyerv2.com",
      brandName: byKey.get("branding.site_name")?.stringValue ?? "buyer-v2",
      maxInboundPerBuyerPerHour:
        byKey.get("sms.max_inbound_per_buyer_per_hour")?.numberValue ?? 10,
      inboundEnabled:
        byKey.get("rollout.sms_inbound_enabled")?.booleanValue ?? false,
      outboundEnabled:
        byKey.get("rollout.sms_outbound_enabled")?.booleanValue ?? false,
    };
  },
});

export const markUserPhoneVerified = internalMutation({
  args: {
    userId: v.id("users"),
    phone: v.string(),
    verifiedAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      phone: args.phone,
      phoneVerificationTime: Date.parse(args.verifiedAt),
    });
    return null;
  },
});

export const countRecentInboundByPhone = internalQuery({
  args: {
    fromPhone: v.string(),
    sinceIso: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("smsMessages")
      .withIndex("by_fromPhone", (q) => q.eq("fromPhone", args.fromPhone))
      .collect();
    return rows.filter(
      (row) =>
        row.direction === "inbound" &&
        Date.parse(row.receivedAt) >= Date.parse(args.sinceIso),
    ).length;
  },
});

export const getMaxInboundPerBuyerPerHour = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settingsEntries")
      .withIndex("by_key", (q) =>
        q.eq("key", "sms.max_inbound_per_buyer_per_hour"),
      )
      .unique();
    return row?.numberValue ?? 10;
  },
});
