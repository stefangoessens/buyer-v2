// @ts-nocheck
"use node";

import type { Id } from "../_generated/dataModel";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  type TwilioMessageCategory,
  mapTwilioMessageStatus,
  readTwilioRuntimeConfig,
  sendTwilioMessage,
} from "../notifications/providerAdapters/twilio";
import {
  classifyInboundSms,
  detectSmsPortalHost,
  hashPhone,
  normalizePhone,
} from "../lib/smsIntakeCompute";
import {
  smsMessageProcessingStatus,
  smsMessageProviderState,
} from "../lib/validators";
import {
  SMS_TEMPLATES,
  type SmsTemplateKey,
  renderSmsTemplate,
} from "./templates";

const CONSENT_POLICY_VERSION =
  process.env.SMS_CONSENT_POLICY_VERSION ?? "2026-04-dashboard-enrollment";

const templateKeyValidator = v.union(
  v.literal("offer-gate-callback-confirmation"),
  v.literal("tour-confirmed-same-day"),
  v.literal("tour-reminder-2h"),
  v.literal("offer-countered"),
  v.literal("wire-fraud-warning"),
  v.literal("closing-reminder-24h"),
);

const inboundResultValidator = v.object({
  messageId: v.id("smsMessages"),
  recipientHash: v.string(),
  status: smsMessageProcessingStatus,
  providerState: smsMessageProviderState,
  replyBody: v.string(),
  replySent: v.boolean(),
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
  dealRoomId: v.optional(v.id("dealRooms")),
  createdDealRoomId: v.optional(v.id("dealRooms")),
  propertyId: v.optional(v.id("properties")),
});

export type SupportedSmsPortal = "zillow" | "redfin" | "realtor";
export type RecognizedSmsPortal =
  | SupportedSmsPortal
  | "homes"
  | "compass"
  | "trulia";

export interface ParsedSmsListingUrl {
  rawUrl: string;
  normalizedUrl?: string;
  portal?: RecognizedSmsPortal;
  listingId?: string;
  addressHint?: string;
}

export function buildSmsHelpReply(
  brandName: string,
  supportEmail: string,
): string {
  return `${brandName} SMS support: ${supportEmail}. Reply STOP to opt out or send a Zillow, Redfin, or Realtor.com link.`;
}

export function buildSmsEnrollmentReply(enrollmentUrl: string): string {
  return `To text listing links, first enroll at ${enrollmentUrl}`;
}

export function buildSmsStartReply(brandName: string): string {
  return `You're back in for ${brandName} SMS. Send a Zillow, Redfin, or Realtor.com listing link to get started.`;
}

export function buildSmsStopReply(brandName: string): string {
  return `You've been unsubscribed from ${brandName} SMS. Reply START to opt back in.`;
}

export function buildSmsUnsupportedReply(): string {
  return "We only support Zillow, Redfin, and Realtor.com listing links right now.";
}

export function buildSmsRateLimitedReply(): string {
  return "Too many listing texts in a short window. Please wait a bit and try again.";
}

export function buildSmsReadyReply(dealRoomUrl: string): string {
  return `Got it! Your analysis is ready: ${dealRoomUrl}`;
}

export function mapSmsTemplateToTransportCategory(
  key: SmsTemplateKey,
): TwilioMessageCategory {
  const category = SMS_TEMPLATES[key].category;
  return category === "transactional" || category === "safety"
    ? "transactional"
    : "relationship";
}

export function parseSupportedSmsListingUrl(
  input: string,
): ParsedSmsListingUrl | null {
  const rawUrl = input.trim();
  const portal = detectSmsPortalHost(rawUrl);
  if (!portal) {
    return null;
  }

  if (portal === "homes" || portal === "compass" || portal === "trulia") {
    return { rawUrl, portal };
  }

  let url: URL;
  try {
    const withProtocol = rawUrl.startsWith("http")
      ? rawUrl
      : `https://${rawUrl}`;
    url = new URL(withProtocol);
  } catch {
    return { rawUrl, portal };
  }

  switch (portal) {
    case "zillow": {
      const listingId = url.pathname.match(/(\d+)_zpid/)?.[1];
      const addressSlug = url.pathname.match(/\/homedetails\/([^/]+)\//)?.[1];
      return {
        rawUrl,
        portal,
        normalizedUrl: `${url.origin}${url.pathname}`,
        listingId,
        addressHint: addressSlug
          ? decodeURIComponent(addressSlug).replace(/-/g, " ")
          : undefined,
      };
    }
    case "redfin": {
      const listingId = url.pathname.match(/\/home\/(\d+)/)?.[1];
      const pathBeforeHome = url.pathname.split("/home/")[0] ?? "";
      const segments = pathBeforeHome.split("/").filter(Boolean);
      const addressHint =
        segments.length >= 3
          ? segments.slice(2).join(" ").replace(/-/g, " ")
          : undefined;
      return {
        rawUrl,
        portal,
        normalizedUrl: `${url.origin}${url.pathname}`,
        listingId,
        addressHint,
      };
    }
    case "realtor": {
      const listingId = url.pathname.match(
        /\/realestateandhomes-detail\/([^/]+)/,
      )?.[1];
      return {
        rawUrl,
        portal,
        normalizedUrl: `${url.origin}${url.pathname}`,
        listingId,
        addressHint:
          listingId && !listingId.startsWith("M")
            ? listingId.replace(/_/g, " ")
            : undefined,
      };
    }
    default:
      return { rawUrl, portal };
  }
}

export function buildReplyForStoredMessage(params: {
  brandName: string;
  supportEmail: string;
  enrollmentUrl: string;
  dealRoomBaseUrl: string;
  row: {
    status: string;
    errorReason?: string;
    dealRoomId?: string;
    createdDealRoomId?: string;
  };
}): string {
  const dealRoomId = params.row.createdDealRoomId ?? params.row.dealRoomId;
  if (dealRoomId) {
    return buildSmsReadyReply(`${params.dealRoomBaseUrl}/${dealRoomId}`);
  }

  switch (params.row.errorReason) {
    case "help_keyword":
      return buildSmsHelpReply(params.brandName, params.supportEmail);
    case "start_keyword":
      return buildSmsStartReply(params.brandName);
    case "stop_keyword":
      return buildSmsStopReply(params.brandName);
    case "no_url_found":
      return buildSmsUnsupportedReply();
    default:
      break;
  }

  switch (params.row.status) {
    case "needs_verification":
      return buildSmsEnrollmentReply(params.enrollmentUrl);
    case "unsupported_url":
      return buildSmsUnsupportedReply();
    case "rate_limited":
      return buildSmsRateLimitedReply();
    default:
      return "";
  }
}

function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function getDashboardUrl() {
  return `${getAppBaseUrl()}/dashboard`;
}

function getDealRoomBaseUrl() {
  return `${getAppBaseUrl()}/dealroom`;
}

function getTwilioStatusWebhookUrl() {
  return `${getAppBaseUrl()}/api/webhooks/twilio/status`;
}

function localMessageSid(prefix: "outbound" | "suppressed" | "failed") {
  return `local-${prefix}-${crypto.randomUUID()}`;
}

async function recordBuyerConsentTouch(
  ctx: ActionCtx,
  params: {
    userId: Id<"users">;
    phone: string;
    state: "verified" | "opted_out" | "suppressed";
    note?: string;
  },
) {
  await ctx.runMutation(internal.buyerProfiles.recordSmsConsent, {
    userId: params.userId,
    phone: params.phone,
    consentState: params.state,
    consentSource: "sms_to_deal_room",
    policyVersion: CONSENT_POLICY_VERSION,
    note: params.note,
    consentedAt: new Date().toISOString(),
  });
}

async function processInboundMessage(
  ctx: ActionCtx,
  params: {
    messageId: Id<"smsMessages">;
    messageSid: string;
    fromPhone: string;
    toPhone: string;
    body: string;
    forceReprocess?: boolean;
  },
) {
  const normalizedFrom = normalizePhone(params.fromPhone) ?? params.fromPhone.trim();
  const recipientHash = await hashPhone(normalizedFrom);
  const settings = await ctx.runQuery(internal.sms.store.getRuntimeSettings, {});
  const brandName = settings.brandName;
  const supportEmail = settings.supportEmail;
  const enrollmentUrl = getDashboardUrl();
  const dealRoomBaseUrl = getDealRoomBaseUrl();
  const now = new Date().toISOString();

  const existingRow = await ctx.runQuery(internal.sms.store.getMessageById, {
    messageId: params.messageId,
  });

  if (
    existingRow &&
    existingRow.processedAt &&
    !params.forceReprocess
  ) {
    const replyBody = buildReplyForStoredMessage({
      brandName,
      supportEmail,
      enrollmentUrl,
      dealRoomBaseUrl,
      row: existingRow,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: existingRow.status,
      providerState: existingRow.providerState,
      replyBody,
      replySent: replyBody.length > 0,
      portal: existingRow.parsedUrls?.[0]?.portal,
      dealRoomId: existingRow.dealRoomId,
      createdDealRoomId: existingRow.createdDealRoomId,
      propertyId: existingRow.propertyId,
    };
  }

  await ctx.runMutation(internal.sms.store.patchMessage, {
    messageId: params.messageId,
    status: "processing",
    providerState: "received",
    errorReason: null,
    processedAt: undefined,
    statusUpdatedAt: now,
    providerStateUpdatedAt: now,
  });

  if (!settings.inboundEnabled) {
    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: params.messageId,
      status: "failed",
      errorReason: "sms_inbound_disabled",
      processedAt: now,
      statusUpdatedAt: now,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: "failed" as const,
      providerState: "received" as const,
      replyBody: "",
      replySent: false,
      portal: undefined,
      dealRoomId: undefined,
      createdDealRoomId: undefined,
      propertyId: undefined,
    };
  }

  const intent = classifyInboundSms(params.body);
  const matchedBuyer = await ctx.runQuery(internal.sms.store.findVerifiedBuyerByPhone, {
    phone: normalizedFrom,
  });

  if (intent.kind === "stop") {
    await ctx.runMutation(internal.sms.store.suppressPhone, {
      phone: normalizedFrom,
      scope: "all",
      reason: "recipient_opt_out",
      source: "twilio_stop_keyword",
      note: "STOP keyword received via Twilio inbound webhook",
    });
    if (matchedBuyer) {
      await recordBuyerConsentTouch(ctx, {
        userId: matchedBuyer.userId,
        phone: normalizedFrom,
        state: "opted_out",
        note: "STOP keyword received via inbound SMS",
      });
    }
    const replyBody = buildSmsStopReply(brandName);
    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: params.messageId,
      status: "suppressed",
      errorReason: "stop_keyword",
      buyerId: matchedBuyer?.userId,
      processedAt: now,
      statusUpdatedAt: now,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: "suppressed" as const,
      providerState: "received" as const,
      replyBody,
      replySent: true,
      portal: undefined,
      dealRoomId: undefined,
      createdDealRoomId: undefined,
      propertyId: undefined,
    };
  }

  if (intent.kind === "help") {
    const replyBody = buildSmsHelpReply(brandName, supportEmail);
    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: params.messageId,
      status: "completed",
      errorReason: "help_keyword",
      buyerId: matchedBuyer?.userId,
      processedAt: now,
      statusUpdatedAt: now,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: "completed" as const,
      providerState: "received" as const,
      replyBody,
      replySent: true,
      portal: undefined,
      dealRoomId: undefined,
      createdDealRoomId: undefined,
      propertyId: undefined,
    };
  }

  if (intent.kind === "start") {
    await ctx.runMutation(internal.sms.store.clearPhoneSuppression, {
      phone: normalizedFrom,
      scope: "all",
    });
    if (matchedBuyer) {
      await recordBuyerConsentTouch(ctx, {
        userId: matchedBuyer.userId,
        phone: normalizedFrom,
        state: "verified",
        note: "START keyword received via inbound SMS",
      });
    }
    const replyBody = buildSmsStartReply(brandName);
    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: params.messageId,
      status: "completed",
      errorReason: "start_keyword",
      buyerId: matchedBuyer?.userId,
      processedAt: now,
      statusUpdatedAt: now,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: "completed" as const,
      providerState: "received" as const,
      replyBody,
      replySent: true,
      portal: undefined,
      dealRoomId: undefined,
      createdDealRoomId: undefined,
      propertyId: undefined,
    };
  }

  if (intent.kind !== "url") {
    const replyBody = buildSmsUnsupportedReply();
    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: params.messageId,
      status: "failed",
      errorReason: "no_url_found",
      buyerId: matchedBuyer?.userId,
      processedAt: now,
      statusUpdatedAt: now,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: "failed" as const,
      providerState: "received" as const,
      replyBody,
      replySent: true,
      portal: undefined,
      dealRoomId: undefined,
      createdDealRoomId: undefined,
      propertyId: undefined,
    };
  }

  if (!matchedBuyer) {
    const replyBody = buildSmsEnrollmentReply(enrollmentUrl);
    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: params.messageId,
      status: "needs_verification",
      errorReason: "unverified_sender",
      processedAt: now,
      statusUpdatedAt: now,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: "needs_verification" as const,
      providerState: "received" as const,
      replyBody,
      replySent: true,
      portal: undefined,
      dealRoomId: undefined,
      createdDealRoomId: undefined,
      propertyId: undefined,
    };
  }

  const detectedPortal = detectSmsPortalHost(intent.url);
  const parsedUrl = parseSupportedSmsListingUrl(intent.url);

  const recentInboundCount = await ctx.runQuery(
    internal.sms.store.countRecentInboundByPhone,
    {
      fromPhone: normalizedFrom,
      sinceIso: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  );
  if (recentInboundCount > settings.maxInboundPerBuyerPerHour) {
    const replyBody = buildSmsRateLimitedReply();
    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: params.messageId,
      status: "rate_limited",
      buyerId: matchedBuyer.userId,
      errorReason: "buyer_hourly_limit",
      processedAt: now,
      statusUpdatedAt: now,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: "rate_limited" as const,
      providerState: "received" as const,
      replyBody,
      replySent: true,
      portal: detectedPortal ?? parsedUrl?.portal,
      dealRoomId: undefined,
      createdDealRoomId: undefined,
      propertyId: undefined,
    };
  }

  if (
    !parsedUrl ||
    !parsedUrl.portal ||
    parsedUrl.portal === "homes" ||
    parsedUrl.portal === "compass" ||
    parsedUrl.portal === "trulia" ||
    !parsedUrl.listingId
  ) {
    const unsupportedPortal = detectedPortal ?? parsedUrl?.portal;
    const parsedUrls =
      unsupportedPortal || parsedUrl
        ? [
            {
              rawUrl: intent.url,
              ...(parsedUrl?.normalizedUrl
                ? { normalizedUrl: parsedUrl.normalizedUrl }
                : {}),
              ...(unsupportedPortal ? { portal: unsupportedPortal } : {}),
              ...(parsedUrl?.listingId ? { listingId: parsedUrl.listingId } : {}),
              ...(parsedUrl?.addressHint
                ? { addressHint: parsedUrl.addressHint }
                : {}),
            },
          ]
        : undefined;
    const replyBody = buildSmsUnsupportedReply();
    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: params.messageId,
      status: "unsupported_url",
      buyerId: matchedBuyer.userId,
      ...(parsedUrls ? { parsedUrls } : {}),
      errorReason: unsupportedPortal
        ? `unsupported_portal:${unsupportedPortal}`
        : "unsupported_url",
      processedAt: now,
      statusUpdatedAt: now,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: "unsupported_url" as const,
      providerState: "received" as const,
      replyBody,
      replySent: true,
      portal: unsupportedPortal,
      dealRoomId: undefined,
      createdDealRoomId: undefined,
      propertyId: undefined,
    };
  }

  const parsedUrls = [
    {
      rawUrl: parsedUrl.rawUrl,
      ...(parsedUrl.normalizedUrl ? { normalizedUrl: parsedUrl.normalizedUrl } : {}),
      portal: parsedUrl.portal,
      ...(parsedUrl.listingId ? { listingId: parsedUrl.listingId } : {}),
      ...(parsedUrl.addressHint ? { addressHint: parsedUrl.addressHint } : {}),
    },
  ];

  const { sourceListingId } = await ctx.runMutation(
    internal.sms.store.upsertSourceListingForSms,
    {
      url: parsedUrl.rawUrl,
      platform: parsedUrl.portal,
    },
  );
  let sourceListing = await ctx.runQuery(internal.sms.store.getSourceListing, {
    sourceListingId,
  });
  if (!sourceListing?.propertyId) {
    await ctx.runAction(internal.extractionRunner.runExtractionJob, {
      sourceListingId,
      url: parsedUrl.rawUrl,
    });
    sourceListing = await ctx.runQuery(internal.sms.store.getSourceListing, {
      sourceListingId,
    });
  }

  if (!sourceListing?.propertyId) {
    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: params.messageId,
      status: "failed",
      buyerId: matchedBuyer.userId,
      parsedUrls,
      errorReason: sourceListing?.errorMessage ?? "extraction_failed",
      processedAt: now,
      statusUpdatedAt: now,
    });
    return {
      messageId: params.messageId,
      recipientHash,
      status: "failed" as const,
      providerState: "received" as const,
      replyBody: "",
      replySent: false,
      portal: parsedUrl.portal,
      dealRoomId: undefined,
      createdDealRoomId: undefined,
      propertyId: undefined,
    };
  }

  const dealRoomResult = await ctx.runMutation(
    internal.sms.store.createOrReuseSmsDealRoom,
    {
      buyerId: matchedBuyer.userId,
      propertyId: sourceListing.propertyId,
      originMessageId: params.messageId,
    },
  );

  await recordBuyerConsentTouch(ctx, {
    userId: matchedBuyer.userId,
    phone: normalizedFrom,
    state: "verified",
    note: "Inbound listing link received via SMS",
  });

  const dealRoomUrl = `${dealRoomBaseUrl}/${dealRoomResult.dealRoomId}`;
  const replyBody = buildSmsReadyReply(dealRoomUrl);
  const nextStatus = dealRoomResult.created ? "completed" : "duplicate";

  await ctx.runMutation(internal.sms.store.patchMessage, {
    messageId: params.messageId,
    status: nextStatus,
    buyerId: matchedBuyer.userId,
    dealRoomId: dealRoomResult.dealRoomId,
    ...(dealRoomResult.created
      ? { createdDealRoomId: dealRoomResult.dealRoomId }
      : {}),
    propertyId: sourceListing.propertyId,
    parsedUrls,
    processedAt: now,
    statusUpdatedAt: now,
  });

  return {
    messageId: params.messageId,
    recipientHash,
    status: nextStatus,
    providerState: "received" as const,
    replyBody,
    replySent: true,
    portal: parsedUrl.portal,
    dealRoomId: dealRoomResult.dealRoomId,
    createdDealRoomId: dealRoomResult.created
      ? dealRoomResult.dealRoomId
      : undefined,
    propertyId: sourceListing.propertyId,
  };
}

export const handleInboundWebhook = action({
  args: {
    messageSid: v.string(),
    fromPhone: v.string(),
    toPhone: v.string(),
    body: v.string(),
  },
  returns: inboundResultValidator,
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const inbound = await ctx.runMutation(internal.sms.store.upsertInboundMessage, {
      twilioMessageSid: args.messageSid,
      fromPhone: normalizePhone(args.fromPhone) ?? args.fromPhone.trim(),
      toPhone: normalizePhone(args.toPhone) ?? args.toPhone.trim(),
      body: args.body,
      providerState: "received",
      status: "pending",
      receivedAt: now,
    });

    return await processInboundMessage(ctx, {
      messageId: inbound.messageId,
      messageSid: args.messageSid,
      fromPhone: args.fromPhone,
      toPhone: args.toPhone,
      body: args.body,
    });
  },
});

export const reprocessStoredInbound = internalAction({
  args: {
    messageId: v.id("smsMessages"),
  },
  returns: inboundResultValidator,
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.sms.store.getMessageById, {
      messageId: args.messageId,
    });
    if (!row || row.direction !== "inbound") {
      throw new Error("Inbound SMS message not found");
    }

    return await processInboundMessage(ctx, {
      messageId: row._id,
      messageSid: row.twilioMessageSid,
      fromPhone: row.fromPhone,
      toPhone: row.toPhone,
      body: row.body,
      forceReprocess: true,
    });
  },
});

export const handleStatusWebhook = action({
  args: {
    messageSid: v.string(),
    messageStatus: v.string(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.object({
    handled: v.boolean(),
    messageId: v.optional(v.id("smsMessages")),
    status: v.optional(smsMessageProcessingStatus),
    providerState: v.optional(smsMessageProviderState),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.sms.store.findMessageBySid, {
      twilioMessageSid: args.messageSid,
    });
    if (!row) {
      return { handled: false };
    }

    const providerState = mapTwilioMessageStatus(args.messageStatus);
    const nextStatus =
      providerState === "failed" || providerState === "undelivered"
        ? "failed"
        : row.status;

    await ctx.runMutation(internal.sms.store.patchMessage, {
      messageId: row._id,
      providerState,
      status: nextStatus,
      ...(args.errorMessage || args.errorCode
        ? {
            errorReason: [args.errorCode, args.errorMessage]
              .filter(Boolean)
              .join(": "),
          }
        : {}),
      providerStateUpdatedAt: new Date().toISOString(),
      statusUpdatedAt:
        nextStatus !== row.status ? new Date().toISOString() : undefined,
      processedAt:
        providerState === "delivered" ||
        providerState === "failed" ||
        providerState === "undelivered"
          ? new Date().toISOString()
          : undefined,
    });

    return {
      handled: true,
      messageId: row._id,
      status: nextStatus,
      providerState,
    };
  },
});

export const sendTemplateMessage = internalAction({
  args: {
    to: v.string(),
    templateKey: templateKeyValidator,
    variables: v.record(v.string(), v.string()),
    buyerId: v.optional(v.id("users")),
    dealRoomId: v.optional(v.id("dealRooms")),
    propertyId: v.optional(v.id("properties")),
    bypassSuppression: v.optional(v.boolean()),
  },
  returns: v.object({
    sent: v.boolean(),
    messageId: v.optional(v.id("smsMessages")),
    providerState: v.optional(smsMessageProviderState),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const settings = await ctx.runQuery(internal.sms.store.getRuntimeSettings, {});
    const normalizedTo = normalizePhone(args.to);
    if (!normalizedTo) {
      return {
        sent: false,
        reason: "invalid_phone",
      };
    }

    const body = renderSmsTemplate(args.templateKey, args.variables);
    const shouldBypassSuppression =
      args.bypassSuppression ?? SMS_TEMPLATES[args.templateKey].bypassSuppression === true;
    const now = new Date().toISOString();

    if (!settings.outboundEnabled) {
      const messageId = await ctx.runMutation(internal.sms.store.createOutboundMessage, {
        twilioMessageSid: localMessageSid("failed"),
        fromPhone: readTwilioRuntimeConfig()?.fromNumber ?? "",
        toPhone: normalizedTo,
        body,
        providerState: "failed",
        status: "failed",
        receivedAt: now,
        buyerId: args.buyerId,
        dealRoomId: args.dealRoomId,
        propertyId: args.propertyId,
      });
      await ctx.runMutation(internal.sms.store.patchMessage, {
        messageId,
        errorReason: "sms_outbound_disabled",
        processedAt: now,
        statusUpdatedAt: now,
        providerStateUpdatedAt: now,
      });
      return {
        sent: false,
        messageId,
        providerState: "failed",
        reason: "sms_outbound_disabled",
      };
    }

    const suppression = await ctx.runQuery(internal.sms.store.getSuppressionState, {
      phone: normalizedTo,
    });
    if (suppression.isSuppressed && !shouldBypassSuppression) {
      const messageId = await ctx.runMutation(internal.sms.store.createOutboundMessage, {
        twilioMessageSid: localMessageSid("suppressed"),
        fromPhone: readTwilioRuntimeConfig()?.fromNumber ?? "",
        toPhone: normalizedTo,
        body,
        providerState: "failed",
        status: "suppressed",
        receivedAt: now,
        buyerId: args.buyerId,
        dealRoomId: args.dealRoomId,
        propertyId: args.propertyId,
      });
      await ctx.runMutation(internal.sms.store.patchMessage, {
        messageId,
        errorReason: `suppressed:${suppression.scopes.join(",")}`,
        processedAt: now,
        statusUpdatedAt: now,
        providerStateUpdatedAt: now,
      });
      return {
        sent: false,
        messageId,
        providerState: "failed",
        reason: "suppressed",
      };
    }

    const config = readTwilioRuntimeConfig();
    if (!config) {
      const messageId = await ctx.runMutation(internal.sms.store.createOutboundMessage, {
        twilioMessageSid: localMessageSid("failed"),
        fromPhone: "",
        toPhone: normalizedTo,
        body,
        providerState: "failed",
        status: "failed",
        receivedAt: now,
        buyerId: args.buyerId,
        dealRoomId: args.dealRoomId,
        propertyId: args.propertyId,
      });
      await ctx.runMutation(internal.sms.store.patchMessage, {
        messageId,
        errorReason: "twilio_not_configured",
        processedAt: now,
        statusUpdatedAt: now,
        providerStateUpdatedAt: now,
      });
      return {
        sent: false,
        messageId,
        providerState: "failed",
        reason: "twilio_not_configured",
      };
    }

    try {
      const sendResult = await sendTwilioMessage(config, {
        to: normalizedTo,
        body,
        category: mapSmsTemplateToTransportCategory(args.templateKey),
        statusCallbackUrl: getTwilioStatusWebhookUrl(),
        forceBypassOptOut: shouldBypassSuppression,
      });

      const messageId = await ctx.runMutation(internal.sms.store.createOutboundMessage, {
        twilioMessageSid: sendResult.sid,
        fromPhone: sendResult.from ?? config.fromNumber,
        toPhone: sendResult.to,
        body: sendResult.body,
        providerState: sendResult.status,
        status: "completed",
        receivedAt: now,
        buyerId: args.buyerId,
        dealRoomId: args.dealRoomId,
        propertyId: args.propertyId,
      });

      if (body.length > 160) {
        console.warn("[sms] template exceeds single-segment target", {
          templateKey: args.templateKey,
          length: body.length,
        });
      }

      return {
        sent: true,
        messageId,
        providerState: sendResult.status,
      };
    } catch (error) {
      const messageId = await ctx.runMutation(internal.sms.store.createOutboundMessage, {
        twilioMessageSid: localMessageSid("failed"),
        fromPhone: config.fromNumber,
        toPhone: normalizedTo,
        body,
        providerState: "failed",
        status: "failed",
        receivedAt: now,
        buyerId: args.buyerId,
        dealRoomId: args.dealRoomId,
        propertyId: args.propertyId,
      });
      await ctx.runMutation(internal.sms.store.patchMessage, {
        messageId,
        errorReason:
          error instanceof Error ? error.message : "twilio_send_failed",
        processedAt: now,
        statusUpdatedAt: now,
        providerStateUpdatedAt: now,
      });
      return {
        sent: false,
        messageId,
        providerState: "failed",
        reason: error instanceof Error ? error.message : "twilio_send_failed",
      };
    }
  },
});
