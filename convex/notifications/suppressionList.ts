import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { notificationDeliveryChannelValidator } from "./preferencesResolver";

export const notificationSuppressionReasonValidator = v.union(
  v.literal("hard_bounce"),
  v.literal("recipient_opt_out"),
  v.literal("spam_complaint"),
  v.literal("unsubscribed"),
  v.literal("manual_block"),
);

export const notificationSuppressionSourceValidator = v.union(
  v.literal("webhook"),
  v.literal("manual"),
  v.literal("preference_center"),
  v.literal("system"),
);

export const notificationSuppressionRowValidator = v.object({
  recipientKey: v.string(),
  channel: notificationDeliveryChannelValidator,
  reason: notificationSuppressionReasonValidator,
  source: notificationSuppressionSourceValidator,
  active: v.boolean(),
  notes: v.optional(v.string()),
  suppressedAt: v.string(),
  liftedAt: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

export type NotificationSuppressionRow = {
  recipientKey: string;
  channel: "email" | "sms" | "push" | "in_app";
  reason:
    | "hard_bounce"
    | "recipient_opt_out"
    | "spam_complaint"
    | "unsubscribed"
    | "manual_block";
  source: "webhook" | "manual" | "preference_center" | "system";
  active: boolean;
  notes?: string;
  suppressedAt: string;
  liftedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function normalizeRecipientKey(recipientKey: string): string {
  return recipientKey.trim().toLowerCase();
}

export function suppressionMatchesChannel(
  suppression: NotificationSuppressionRow,
  channel: NotificationSuppressionRow["channel"],
): boolean {
  return suppression.active && suppression.channel === channel;
}

export function suppressionBlocksDelivery(
  suppression: NotificationSuppressionRow,
  channel: NotificationSuppressionRow["channel"],
): boolean {
  return suppressionMatchesChannel(suppression, channel);
}

type NotificationSuppressionDoc = Doc<"notificationSuppressionList">;

function toSuppressionRow(
  row: NotificationSuppressionDoc,
): NotificationSuppressionRow {
  return {
    recipientKey: row.recipientKey,
    channel: row.channel,
    reason: row.reason,
    source: row.source,
    active: row.active,
    notes: row.notes,
    suppressedAt: row.suppressedAt,
    liftedAt: row.liftedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const activeSuppressionArgs = {
  recipientKey: v.string(),
  channel: notificationDeliveryChannelValidator,
};

const upsertSuppressionArgs = {
  recipientKey: v.string(),
  channel: notificationDeliveryChannelValidator,
  reason: notificationSuppressionReasonValidator,
  source: notificationSuppressionSourceValidator,
  notes: v.optional(v.string()),
  active: v.optional(v.boolean()),
};

async function readActiveSuppressionRow(
  ctx: QueryCtx,
  recipientKey: string,
  channel: NotificationSuppressionRow["channel"],
): Promise<NotificationSuppressionRow | null> {
  const normalizedRecipientKey = normalizeRecipientKey(recipientKey);
  const row = await ctx.db
    .query("notificationSuppressionList")
    .withIndex("by_recipientKey_and_channel_and_active", (q) =>
      q
        .eq("recipientKey", normalizedRecipientKey)
        .eq("channel", channel)
        .eq("active", true),
    )
    .unique();

  return row ? toSuppressionRow(row) : null;
}

async function upsertSuppressionRow(
  ctx: MutationCtx,
  args: {
    recipientKey: string;
    channel: NotificationSuppressionRow["channel"];
    reason: NotificationSuppressionRow["reason"];
    source: NotificationSuppressionRow["source"];
    notes?: string;
    active?: boolean;
  },
): Promise<Id<"notificationSuppressionList">> {
  const normalizedRecipientKey = normalizeRecipientKey(args.recipientKey);
  const now = new Date().toISOString();
  const active = args.active ?? true;
  const existing = await ctx.db
    .query("notificationSuppressionList")
    .withIndex("by_recipientKey_and_channel", (q) =>
      q.eq("recipientKey", normalizedRecipientKey).eq("channel", args.channel),
    )
    .unique();

  const nextRow: Omit<NotificationSuppressionDoc, "_id" | "_creationTime"> = {
    recipientKey: normalizedRecipientKey,
    channel: args.channel,
    reason: args.reason,
    source: args.source,
    active,
    notes: args.notes,
    suppressedAt: active ? now : existing?.suppressedAt ?? now,
    liftedAt: active ? undefined : now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, nextRow);
    return existing._id;
  }

  return await ctx.db.insert("notificationSuppressionList", nextRow);
}

export const getActiveSuppression = query({
  args: activeSuppressionArgs,
  returns: v.union(notificationSuppressionRowValidator, v.null()),
  handler: async (ctx, args) => {
    return await readActiveSuppressionRow(ctx, args.recipientKey, args.channel);
  },
});

export const getActiveSuppressionInternal = internalQuery({
  args: activeSuppressionArgs,
  returns: v.union(notificationSuppressionRowValidator, v.null()),
  handler: async (ctx, args) => {
    return await readActiveSuppressionRow(ctx, args.recipientKey, args.channel);
  },
});

export const upsertSuppression = mutation({
  args: upsertSuppressionArgs,
  returns: v.id("notificationSuppressionList"),
  handler: async (ctx, args) => {
    return await upsertSuppressionRow(ctx, args);
  },
});

export const upsertSuppressionInternal = internalMutation({
  args: upsertSuppressionArgs,
  returns: v.id("notificationSuppressionList"),
  handler: async (ctx, args) => {
    return await upsertSuppressionRow(ctx, args);
  },
});
