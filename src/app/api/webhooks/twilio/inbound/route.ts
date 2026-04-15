import { ConvexHttpClient } from "convex/browser";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

type ConvexMutationRef = Parameters<ConvexHttpClient["mutation"]>[0];

const recordWebhookReceipt = "notifications/webhooks:recordWebhookReceipt" as unknown as ConvexMutationRef;

function parseFormBody(rawBody: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(rawBody));
}

function stableTwilioEventId(routeKind: string, rawBody: string): string {
  const digest = createHash("sha256").update(rawBody).digest("hex").slice(0, 32);
  return `twilio:${routeKind}:${digest}`;
}

function verifyTwilioSignature(request: Request, rawBody: string): boolean {
  const secret = process.env.TWILIO_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get("x-twilio-signature")?.trim();
  if (!secret || !signature) {
    return false;
  }

  const url = new URL(request.url).toString();
  const form = parseFormBody(rawBody);
  const signedPayload = [url, ...Object.entries(form).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, value]) => [key, value])].join("");
  const expected = createHmac("sha1", secret).update(signedPayload).digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

async function recordTwilioWebhook(args: {
  providerEventId: string;
  payload: string;
  signatureVerified: boolean;
  receivedAt: string;
  status: "received" | "ignored";
}) {
  if (!env.NEXT_PUBLIC_CONVEX_URL) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  }

  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  return await (client as {
    mutation: (
      fn: ConvexMutationRef,
      args: Record<string, unknown>,
    ) => Promise<{
      status: "recorded" | "duplicate";
      receiptId: string;
      providerEventId: string;
    }>;
  }).mutation(recordWebhookReceipt, {
    provider: "twilio",
    providerEventId: args.providerEventId,
    payload: args.payload,
    signatureVerified: args.signatureVerified,
    receivedAt: args.receivedAt,
    status: args.status,
  });
}

export async function POST(request: Request) {
  if (!env.NEXT_PUBLIC_CONVEX_URL) {
    return NextResponse.json(
      { ok: false, error: "convex_not_configured" },
      { status: 503 },
    );
  }

  if (!process.env.TWILIO_WEBHOOK_SECRET?.trim()) {
    return NextResponse.json(
      { ok: false, error: "twilio_webhook_secret_not_configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const providerEventId = stableTwilioEventId("inbound", rawBody);
  const signatureVerified = verifyTwilioSignature(request, rawBody);

  const receipt = await recordTwilioWebhook({
    providerEventId,
    payload: rawBody,
    signatureVerified,
    receivedAt: new Date().toISOString(),
    status: signatureVerified ? "received" : "ignored",
  });

  if (receipt.status === "duplicate") {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      provider: "twilio",
      providerEventId: receipt.providerEventId,
      receiptId: receipt.receiptId,
      signatureVerified,
    });
  }

  if (!signatureVerified) {
    return NextResponse.json(
      {
        ok: false,
        provider: "twilio",
        providerEventId,
        receiptId: receipt.receiptId,
        signatureVerified,
        error: "invalid_signature",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    duplicate: false,
    provider: "twilio",
    providerEventId,
    receiptId: receipt.receiptId,
    signatureVerified,
  });
}
