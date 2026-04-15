import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { env } from "@/lib/env";
import {
  normalizeStatusPayload,
  parseTwilioWebhookParams,
  readTwilioRuntimeConfig,
  validateTwilioWebhook,
} from "../../../../../../convex/notifications/providerAdapters/twilio";

export async function POST(request: Request) {
  const config = readTwilioRuntimeConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "twilio_not_configured" }, { status: 503 });
  }
  if (!env.NEXT_PUBLIC_CONVEX_URL) {
    return NextResponse.json({ ok: false, error: "convex_not_configured" }, { status: 503 });
  }

  const formData = await request.formData();
  const params = parseTwilioWebhookParams(formData);
  const signature = request.headers.get("x-twilio-signature");
  const valid = validateTwilioWebhook({
    authToken: config.authToken,
    signature,
    url: request.url,
    params,
  });
  if (!valid) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 403 });
  }

  const payload = normalizeStatusPayload(params);
  if (!payload.messageSid || !payload.messageStatus) {
    return NextResponse.json({ ok: false, error: "missing_status_payload" }, { status: 400 });
  }

  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  const result = await client.action(api.sms.inboundHandler.handleStatusWebhook, {
    messageSid: payload.messageSid,
    messageStatus: payload.messageStatus,
    ...(payload.errorCode ? { errorCode: payload.errorCode } : {}),
    ...(payload.errorMessage ? { errorMessage: payload.errorMessage } : {}),
  });

  return NextResponse.json({ ok: true, handled: result.handled });
}
