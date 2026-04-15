import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { trackServerEvent } from "@/lib/analytics.server";
import { resendAdapter } from "../../../../../convex/notifications/providerAdapters/resend";

type ConvexMutationRef = Parameters<ConvexHttpClient["mutation"]>[0];

const recordWebhookReceipt = "notifications/webhooks:recordWebhookReceipt" as unknown as ConvexMutationRef;
const processResendWebhookEvent = "notifications/webhooks:processResendWebhookEvent" as unknown as ConvexMutationRef;

function readWebhookHeaders(request: Request) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    return null;
  }

  return { id, timestamp, signature };
}

function anonymizeLink(rawLink: string): string {
  try {
    const url = new URL(rawLink);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

async function trackWebhookAnalytics(event: {
  transition: string;
  providerMessageId?: string;
  raw: Record<string, unknown>;
  clickedLink?: string;
}) {
  if (event.transition === "sent") {
    await trackServerEvent("message_sent", {
      channel: "email",
      templateKey: extractTemplateKey(event.raw),
    });
    return;
  }

  if (event.transition === "delivered") {
    await trackServerEvent("message_delivered", {
      messageId: event.providerMessageId ?? "unknown",
      channel: "email",
    });
    return;
  }

  if (event.transition === "opened") {
    await trackServerEvent("message_opened", {
      messageId: event.providerMessageId ?? "unknown",
      channel: "email",
    });
    return;
  }

  if (event.transition === "clicked" && event.clickedLink) {
    await trackServerEvent("message_clicked", {
      messageId: event.providerMessageId ?? "unknown",
      channel: "email",
      link: anonymizeLink(event.clickedLink),
    });
  }
}

function extractTemplateKey(raw: Record<string, unknown>): string {
  const data = raw.data;
  if (!data || typeof data !== "object") {
    return "unknown";
  }

  const tags = (data as Record<string, unknown>).tags;
  if (!tags || typeof tags !== "object") {
    return "unknown";
  }

  const templateKey = (tags as Record<string, unknown>).templateKey;
  return typeof templateKey === "string" && templateKey.trim().length > 0
    ? templateKey
    : "unknown";
}

function extractClickedLink(raw: Record<string, unknown>): string | undefined {
  const data = raw.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const click = (data as Record<string, unknown>).click;
  if (!click || typeof click !== "object") {
    return undefined;
  }

  const link = (click as Record<string, unknown>).link;
  return typeof link === "string" && link.trim().length > 0 ? link : undefined;
}

async function callResendWebhookMutation(args: {
  providerEventId: string;
  providerMessageId?: string;
  transition: "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "failed" | "suppressed" | "inbound_received";
  occurredAt: string;
  recipientKeys: string[];
  eventId?: string;
  failureReason?: string;
  rawPayload: string;
  signatureVerified: boolean;
}) {
  if (!env.NEXT_PUBLIC_CONVEX_URL) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  }

  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  return await (convex as {
    mutation: (
      fn: ConvexMutationRef,
      args: Record<string, unknown>,
    ) => Promise<{
      status: "processed" | "duplicate" | "ignored";
      receiptId: string;
    }>;
  }).mutation(processResendWebhookEvent, args);
}

async function recordResendWebhookReceipt(args: {
  providerEventId: string;
  payload: string;
  signatureVerified: boolean;
  receivedAt: string;
  status: "received" | "ignored";
}) {
  if (!env.NEXT_PUBLIC_CONVEX_URL) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  }

  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  return await (convex as {
    mutation: (
      fn: ConvexMutationRef,
      args: Record<string, unknown>,
    ) => Promise<{
      status: "recorded" | "duplicate";
      receiptId: string;
      providerEventId: string;
    }>;
  }).mutation(recordWebhookReceipt, {
    provider: "resend",
    providerEventId: args.providerEventId,
    payload: args.payload,
    signatureVerified: args.signatureVerified,
    receivedAt: args.receivedAt,
    status: args.status,
  });
}

export async function POST(request: Request) {
  if (!env.NEXT_PUBLIC_CONVEX_URL) {
    return new NextResponse("NEXT_PUBLIC_CONVEX_URL is not configured", {
      status: 500,
    });
  }

  const headers = readWebhookHeaders(request);
  if (!headers) {
    return new NextResponse("Missing Resend webhook signature headers", {
      status: 400,
    });
  }

  if (!process.env.RESEND_WEBHOOK_SECRET) {
    return new NextResponse("RESEND_WEBHOOK_SECRET is not configured", {
      status: 500,
    });
  }

  const payload = await request.text();

  let verifiedPayload: unknown;
  let signatureVerified = false;
  try {
    signatureVerified = Boolean(
      resendAdapter.verifyWebhook({ payload, headers }, process.env.RESEND_WEBHOOK_SECRET ?? ""),
    );
    verifiedPayload = resendAdapter.ingestWebhookEvent(JSON.parse(payload), {
      providerEventId: headers.id,
    });
  } catch (error) {
    await recordResendWebhookReceipt({
      providerEventId: headers.id,
      payload,
      signatureVerified,
      receivedAt: new Date().toISOString(),
      status: "ignored",
    });
    return new NextResponse(
      error instanceof Error ? error.message : "Invalid Resend webhook payload",
      { status: 400 },
    );
  }

  const event = verifiedPayload as {
    providerEventId: string;
    providerMessageId?: string;
    transition:
      | "sent"
      | "delivered"
      | "opened"
      | "clicked"
      | "bounced"
      | "complained"
      | "failed"
      | "suppressed"
      | "received";
    occurredAt: string;
    recipientKeys?: string[];
    eventId?: string;
    failureReason?: string;
    suppressedType?: string;
    raw: Record<string, unknown>;
  };

  const clickedLink = extractClickedLink(event.raw);

  const result = await callResendWebhookMutation({
    providerEventId: event.providerEventId,
    providerMessageId: event.providerMessageId,
    transition: event.transition,
    occurredAt: event.occurredAt,
    recipientKeys: event.recipientKeys ?? [],
    eventId: event.eventId,
    failureReason: event.failureReason,
    suppressedType: event.suppressedType,
    rawPayload: payload,
    signatureVerified,
  });

  if (result.status === "processed") {
    await trackWebhookAnalytics({
      ...event,
      clickedLink,
    });
  }

  if (result.status === "ignored") {
    return new NextResponse("Invalid Resend webhook signature", { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    providerEventId: event.providerEventId,
    receiptId: result.receiptId,
  });
}
