import { mutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { applyBuyerEventDeliveryUpdate } from "../buyerUpdateEvents";
import { normalizeRecipientKey } from "./suppressionList";

const providerValidator = v.union(
  v.literal("resend"),
  v.literal("twilio"),
  v.literal("apns"),
);

const receiptInputStatusValidator = v.union(
  v.literal("received"),
  v.literal("processed"),
  v.literal("ignored"),
  v.literal("failed"),
);

const resendWebhookTypeValidator = v.union(
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("opened"),
  v.literal("clicked"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
  v.literal("suppressed"),
  v.literal("received"),
);

function suppressionReasonFor(args: {
  type: "bounced" | "complained" | "suppressed";
  suppressedType?: string;
}): Doc<"notificationSuppressionList">["reason"] {
  if (args.type === "complained") {
    return "spam_complaint";
  }
  if (
    args.type === "suppressed" &&
    args.suppressedType?.toLowerCase().includes("unsubscribe")
  ) {
    return "unsubscribed";
  }
  return "hard_bounce";
}

async function upsertSuppression(
  ctx: Pick<MutationCtx, "db">,
  args: {
    recipientKey: string;
    reason: Doc<"notificationSuppressionList">["reason"];
    notes?: string;
    occurredAt: string;
  },
): Promise<boolean> {
  const normalized = normalizeRecipientKey(args.recipientKey);
  const existing = await ctx.db
    .query("notificationSuppressionList")
    .withIndex("by_recipientKey_and_channel", (q) =>
      q.eq("recipientKey", normalized).eq("channel", "email"),
    )
    .collect();

  const active = existing.find((row: Doc<"notificationSuppressionList">) => row.active);
  const reusable = active ?? existing[0] ?? null;
  if (reusable) {
    await ctx.db.patch(reusable._id, {
      recipientKey: normalized,
      channel: "email",
      reason: args.reason,
      source: "webhook",
      liftedAt: undefined,
      notes: args.notes,
      suppressedAt: args.occurredAt,
      updatedAt: args.occurredAt,
      active: true,
    });
    return !reusable.active;
  }

  await ctx.db.insert("notificationSuppressionList", {
    recipientKey: normalized,
    channel: "email",
    reason: args.reason,
    source: "webhook",
    active: true,
    notes: args.notes,
    suppressedAt: args.occurredAt,
    createdAt: args.occurredAt,
    updatedAt: args.occurredAt,
  });
  return true;
}

function getSuppressionRecipientKeys(args: {
  attemptRecipientKey?: string;
  providerRecipientKeys: string[];
}): string[] {
  if (args.attemptRecipientKey?.trim()) {
    return [normalizeRecipientKey(args.attemptRecipientKey)];
  }

  return Array.from(
    new Set(
      args.providerRecipientKeys
        .map((recipientKey) => normalizeRecipientKey(recipientKey))
        .filter((recipientKey) => recipientKey.length > 0),
    ),
  );
}

const receiptValidator = v.object({
  provider: providerValidator,
  providerEventId: v.string(),
  eventId: v.optional(v.id("buyerUpdateEvents")),
  attemptId: v.optional(v.id("notificationDeliveryAttempts")),
  payload: v.string(),
  signatureVerified: v.boolean(),
  receivedAt: v.string(),
  status: v.optional(receiptInputStatusValidator),
  processedAt: v.optional(v.string()),
  errorReason: v.optional(v.string()),
});

const processResendWebhookEventArgs = {
  providerEventId: v.string(),
  providerMessageId: v.optional(v.string()),
  transition: resendWebhookTypeValidator,
  occurredAt: v.string(),
  recipientKeys: v.array(v.string()),
  eventId: v.optional(v.id("buyerUpdateEvents")),
  failureReason: v.optional(v.string()),
  suppressedType: v.optional(v.string()),
  rawPayload: v.string(),
  signatureVerified: v.boolean(),
};

type ReceiptRow = {
  receiptId: Id<"notificationWebhookReceipts">;
  duplicate: boolean;
};

async function upsertReceiptRow(
  ctx: MutationCtx,
  args: {
    provider: "resend" | "twilio" | "apns";
    providerEventId: string;
    eventId?: Id<"buyerUpdateEvents">;
    attemptId?: Id<"notificationDeliveryAttempts">;
    payload: string;
    signatureVerified: boolean;
    receivedAt: string;
    status?: "received" | "processed" | "ignored" | "failed";
    processedAt?: string;
    errorReason?: string;
  },
): Promise<ReceiptRow> {
  const existing = await ctx.db
    .query("notificationWebhookReceipts")
    .withIndex("by_provider_and_providerEventId", (q) =>
      q.eq("provider", args.provider).eq("providerEventId", args.providerEventId),
    )
    .unique();

  const now = new Date().toISOString();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "duplicate",
      updatedAt: now,
    });
    return { receiptId: existing._id, duplicate: true };
  }

  const receiptId = await ctx.db.insert("notificationWebhookReceipts", {
    provider: args.provider,
    providerEventId: args.providerEventId,
    eventId: args.eventId,
    attemptId: args.attemptId,
    payload: args.payload,
    signatureVerified: args.signatureVerified,
    status: args.status ?? "received",
    errorReason: args.errorReason,
    receivedAt: args.receivedAt,
    processedAt: args.processedAt,
    createdAt: now,
    updatedAt: now,
  });

  return { receiptId, duplicate: false };
}

export const recordWebhookReceipt = mutation({
  args: receiptValidator,
  returns: v.object({
    status: v.union(v.literal("recorded"), v.literal("duplicate")),
    receiptId: v.id("notificationWebhookReceipts"),
    providerEventId: v.string(),
  }),
  handler: async (ctx, args) => {
    const result = await upsertReceiptRow(ctx, args);
    return {
      status: result.duplicate ? ("duplicate" as const) : ("recorded" as const),
      receiptId: result.receiptId,
      providerEventId: args.providerEventId,
    };
  },
});

export const processResendWebhookEvent = mutation({
  args: processResendWebhookEventArgs,
  returns: v.object({
    status: v.union(v.literal("processed"), v.literal("duplicate"), v.literal("ignored")),
    receiptId: v.id("notificationWebhookReceipts"),
    eventId: v.optional(v.id("buyerUpdateEvents")),
    disclosureRequestId: v.optional(v.id("disclosureRequests")),
    suppressionApplied: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const deliveryAttempt = args.providerMessageId
      ? await ctx.db
          .query("notificationDeliveryAttempts")
          .withIndex("by_providerMessageId", (q) =>
            q.eq("providerMessageId", args.providerMessageId!),
          )
          .unique()
      : null;
    const eventId = args.eventId ?? deliveryAttempt?.eventId;
    const receipt = await upsertReceiptRow(ctx, {
      provider: "resend",
      providerEventId: args.providerEventId,
      eventId,
      attemptId: deliveryAttempt?._id,
      payload: args.rawPayload,
      signatureVerified: args.signatureVerified,
      receivedAt: args.occurredAt,
      status: args.signatureVerified ? "received" : "ignored",
    });

    if (receipt.duplicate) {
      return {
        status: "duplicate" as const,
        receiptId: receipt.receiptId,
        eventId: undefined,
        disclosureRequestId: undefined,
        suppressionApplied: false,
      };
    }

    if (!args.signatureVerified) {
      await ctx.db.patch(receipt.receiptId, {
        status: "ignored",
        errorReason: "signature_verification_failed",
        updatedAt: args.occurredAt,
      });
      return {
        status: "ignored" as const,
        receiptId: receipt.receiptId,
        eventId: undefined,
        disclosureRequestId: undefined,
        suppressionApplied: false,
      };
    }

    const disclosureRequest = args.providerMessageId
      ? await ctx.db
          .query("disclosureRequests")
          .withIndex("by_providerMessageId", (q) =>
            q.eq("providerMessageId", args.providerMessageId!),
          )
          .unique()
      : null;

    let suppressionApplied = false;

    try {
      if (eventId) {
        await applyBuyerEventDeliveryUpdate(ctx, {
          eventId,
          transition: args.transition === "received" ? "delivered" : args.transition,
          occurredAt: args.occurredAt,
          failedReason: args.failureReason,
        });
      }

      if (
        disclosureRequest &&
        args.transition === "opened" &&
        disclosureRequest.status === "sent" &&
        disclosureRequest.openedAt === undefined
      ) {
        await ctx.db.patch(disclosureRequest._id, {
          status: "opened",
          openedAt: args.occurredAt,
          updatedAt: args.occurredAt,
        });
      }

      if (
        args.transition === "bounced" ||
        args.transition === "complained" ||
        args.transition === "suppressed"
      ) {
        const suppressionRecipientKeys = getSuppressionRecipientKeys({
          attemptRecipientKey: deliveryAttempt?.recipientKey,
          providerRecipientKeys: args.recipientKeys,
        });

        for (const recipient of suppressionRecipientKeys) {
          suppressionApplied =
            (await upsertSuppression(ctx, {
              recipientKey: recipient,
              reason: suppressionReasonFor({
                type: args.transition,
                suppressedType: args.suppressedType,
              }),
              notes: args.failureReason,
              occurredAt: args.occurredAt,
            })) || suppressionApplied;
        }
      }

      await ctx.db.patch(receipt.receiptId, {
        status: "processed",
        processedAt: args.occurredAt,
        updatedAt: args.occurredAt,
      });

      return {
        status: "processed" as const,
        receiptId: receipt.receiptId,
        eventId,
        disclosureRequestId: disclosureRequest?._id,
        suppressionApplied,
      };
    } catch (error) {
      await ctx.db.patch(receipt.receiptId, {
        status: "failed",
        errorReason: error instanceof Error ? error.message : "Unknown error",
        updatedAt: args.occurredAt,
      });
      throw error;
    }
  },
});
