import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { trackServerEvent } from "@/lib/analytics.server";
import { env } from "@/lib/env";
import {
  buildTwimlMessage,
  normalizeInboundPayload,
  parseTwilioWebhookParams,
  readTwilioRuntimeConfig,
  validateTwilioWebhook,
} from "../../../../../../convex/notifications/providerAdapters/twilio";

function xmlResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const config = readTwilioRuntimeConfig();
  if (!config) {
    return xmlResponse(buildTwimlMessage(""), 503);
  }
  if (!env.NEXT_PUBLIC_CONVEX_URL) {
    return xmlResponse(buildTwimlMessage(""), 503);
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
    return xmlResponse(buildTwimlMessage(""), 403);
  }

  const payload = normalizeInboundPayload(params);
  if (!payload.messageSid || !payload.from || !payload.to) {
    return xmlResponse(buildTwimlMessage(""), 400);
  }

  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  const result = await client.action(api.sms.inboundHandler.handleInboundWebhook, {
    messageSid: payload.messageSid,
    fromPhone: payload.from,
    toPhone: payload.to,
    body: payload.body,
    sharedSecret: config.authToken,
  });

  await trackServerEvent("sms_inbound_received", {
    messageId: result.messageId,
    recipientHash: result.recipientHash,
  });

  if (
    result.portal &&
    (result.status === "completed" || result.status === "duplicate") &&
    (result.portal === "zillow" ||
      result.portal === "redfin" ||
      result.portal === "realtor")
  ) {
    await trackServerEvent("sms_inbound_parsed", {
      messageId: result.messageId,
      recipientHash: result.recipientHash,
      portal: result.portal,
    });
  }

  if (result.createdDealRoomId) {
    await trackServerEvent("sms_inbound_dealroom_created", {
      messageId: result.messageId,
      recipientHash: result.recipientHash,
      dealRoomId: result.createdDealRoomId,
    });
  } else if (result.status === "duplicate" && result.dealRoomId) {
    await trackServerEvent("sms_inbound_duplicate", {
      messageId: result.messageId,
      recipientHash: result.recipientHash,
      dealRoomId: result.dealRoomId,
    });
  } else if (result.status === "unsupported_url") {
    await trackServerEvent("sms_inbound_unsupported_url", {
      messageId: result.messageId,
      recipientHash: result.recipientHash,
      portal: result.portal,
    });
  } else if (result.status === "needs_verification") {
    await trackServerEvent("sms_inbound_unverified_sender", {
      messageId: result.messageId,
      recipientHash: result.recipientHash,
    });
  }

  return xmlResponse(buildTwimlMessage(result.replySent ? result.replyBody : ""));
}
