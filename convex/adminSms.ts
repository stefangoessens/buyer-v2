import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireRole } from "./lib/session";
import {
  smsMessageProcessingStatus,
  smsMessageDirection,
} from "./lib/validators";

const statusFilterValidator = v.union(
  v.literal("all"),
  smsMessageProcessingStatus,
);

const directionFilterValidator = v.union(
  v.literal("all"),
  smsMessageDirection,
);

const dashboardValidator = v.object({
  stats: v.object({
    inboundToday: v.number(),
    successfulCreates24h: v.number(),
    needsAttention: v.number(),
    unknownNumbers: v.number(),
  }),
  items: v.array(
    v.object({
      _id: v.id("smsMessages"),
      twilioMessageSid: v.string(),
      direction: smsMessageDirection,
      fromPhone: v.string(),
      toPhone: v.string(),
      body: v.string(),
      status: smsMessageProcessingStatus,
      providerState: v.union(
        v.literal("queued"),
        v.literal("sending"),
        v.literal("sent"),
        v.literal("delivered"),
        v.literal("undelivered"),
        v.literal("failed"),
        v.literal("received"),
      ),
      parsedUrls: v.optional(v.array(v.any())),
      matchedBuyer: v.union(
        v.object({
          userId: v.id("users"),
          name: v.string(),
        }),
        v.null(),
      ),
      dealRoomId: v.optional(v.id("dealRooms")),
      createdDealRoomId: v.optional(v.id("dealRooms")),
      dealRoomHref: v.optional(v.string()),
      propertyId: v.optional(v.id("properties")),
      errorReason: v.optional(v.string()),
      receivedAt: v.string(),
      processedAt: v.optional(v.string()),
      statusUpdatedAt: v.optional(v.string()),
    }),
  ),
});

function isNeedsAttention(status: string) {
  return (
    status === "failed" ||
    status === "unsupported_url" ||
    status === "needs_verification" ||
    status === "rate_limited"
  );
}

export const getDashboard = query({
  args: {
    status: v.optional(statusFilterValidator),
    direction: v.optional(directionFilterValidator),
    hasError: v.optional(v.boolean()),
    unknownSender: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: dashboardValidator,
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");

    const rows = await ctx.db
      .query("smsMessages")
      .order("desc")
      .take(Math.min(args.limit ?? 100, 250));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const stats = {
      inboundToday: rows.filter(
        (row) =>
          row.direction === "inbound" &&
          Date.parse(row.receivedAt) >= todayStart.getTime(),
      ).length,
      successfulCreates24h: rows.filter(
        (row) =>
          row.direction === "inbound" &&
          !!row.createdDealRoomId &&
          Date.parse(row.receivedAt) >= dayAgo,
      ).length,
      needsAttention: rows.filter((row) => isNeedsAttention(row.status)).length,
      unknownNumbers: rows.filter(
        (row) => row.direction === "inbound" && !row.buyerId,
      ).length,
    };

    const filtered = rows.filter((row) => {
      if ((args.status ?? "all") !== "all" && row.status !== args.status) {
        return false;
      }
      if (
        (args.direction ?? "all") !== "all" &&
        row.direction !== args.direction
      ) {
        return false;
      }
      if (args.hasError === true && !row.errorReason) {
        return false;
      }
      if (args.unknownSender === true && row.buyerId) {
        return false;
      }
      return true;
    });

    const items = await Promise.all(
      filtered.map(async (row) => {
        const matchedBuyer = row.buyerId ? await ctx.db.get(row.buyerId) : null;
        const dealRoomId = row.createdDealRoomId ?? row.dealRoomId;
        return {
          _id: row._id,
          twilioMessageSid: row.twilioMessageSid,
          direction: row.direction,
          fromPhone: row.fromPhone,
          toPhone: row.toPhone,
          body: row.body,
          status: row.status,
          providerState: row.providerState,
          parsedUrls: row.parsedUrls,
          matchedBuyer: matchedBuyer
            ? {
                userId: matchedBuyer._id,
                name: matchedBuyer.name,
              }
            : null,
          dealRoomId: row.dealRoomId,
          createdDealRoomId: row.createdDealRoomId,
          dealRoomHref: dealRoomId ? `/dealroom/${dealRoomId}` : undefined,
          propertyId: row.propertyId,
          errorReason: row.errorReason,
          receivedAt: row.receivedAt,
          processedAt: row.processedAt,
          statusUpdatedAt: row.statusUpdatedAt,
        };
      }),
    );

    return { stats, items };
  },
});

export const blockPhone = mutation({
  args: {
    phone: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    await ctx.runMutation(internal.sms.store.suppressPhone, {
      phone: args.phone,
      scope: "all",
      reason: "manual_block",
      source: "admin_console",
      note: args.note,
    });

    const matchedBuyer = await ctx.runQuery(internal.sms.store.findVerifiedBuyerByPhone, {
      phone: args.phone,
    });
    if (matchedBuyer) {
      await ctx.runMutation(internal.buyerProfiles.recordSmsConsent, {
        userId: matchedBuyer.userId,
        phone: args.phone,
        consentState: "suppressed",
        consentSource: "admin",
        policyVersion:
          process.env.SMS_CONSENT_POLICY_VERSION ?? "2026-04-dashboard-enrollment",
        note:
          args.note ??
          `Blocked from the admin SMS console by ${user.email}`,
      });
    }

    return null;
  },
});

export const reparseMessage = mutation({
  args: {
    messageId: v.id("smsMessages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    const row = await ctx.db.get(args.messageId);
    if (!row || row.direction !== "inbound") {
      throw new Error("Inbound SMS message not found");
    }

    await ctx.scheduler.runAfter(
      0,
      internal.sms.inboundHandler.reprocessStoredInbound,
      {
        messageId: args.messageId,
      },
    );

    return null;
  },
});
