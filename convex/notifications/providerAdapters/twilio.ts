import { createHmac } from "node:crypto";
import type {
  DeliveryRequest,
  DeliveryResult,
  ProviderAdapter,
  WebhookEvent,
} from "@/lib/notifications/types";

type TwilioWebhookEnvelope = {
  url: string;
  params: Record<string, string>;
  signature: string;
};

export const twilioAdapter: ProviderAdapter = {
  name: "twilio",

  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    const providerMessageId = [
      "twilio",
      request.eventId,
      request.channel,
      String(request.attemptNumber),
    ].join(":");

    return {
      provider: "twilio",
      providerEventId: providerMessageId,
      providerMessageId,
      status: "delivered",
    };
  },

  verifyWebhook(payload: unknown, signature: string): boolean {
    const envelope = payload as TwilioWebhookEnvelope | undefined;
    const authToken = signature.trim();
    if (
      !envelope?.url ||
      !envelope.signature?.trim() ||
      !authToken ||
      !envelope.params
    ) {
      return false;
    }

    const signedPayload = [
      envelope.url,
      ...Object.keys(envelope.params)
        .sort()
        .map((key) => `${key}${envelope.params[key] ?? ""}`),
    ].join("");

    const expected = createTwilioSignature(signedPayload, authToken);
    return timingSafeEqual(expected, envelope.signature.trim());
  },

  ingestWebhookEvent(
    payload: unknown,
    options?: { providerEventId?: string },
  ): WebhookEvent {
    const record =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const direction =
      getString(record.Direction) ??
      getString(record.direction) ??
      "outbound-api";
    const transition =
      direction === "inbound"
        ? "inbound_received"
        : mapTwilioStatusToTransition(
            getString(record.MessageStatus) ?? getString(record.SmsStatus),
          );

    return {
      provider: "twilio",
      providerEventId:
        options?.providerEventId ??
        getString(record.EventSid) ??
        getString(record.SmsSid) ??
        getString(record.MessageSid) ??
        `twilio:${crypto.randomUUID()}`,
      providerMessageId:
        getString(record.MessageSid) ?? getString(record.SmsSid) ?? undefined,
      transition,
      occurredAt: new Date().toISOString(),
      recipientKeys: compactStrings(
        getString(record.To),
        getString(record.From),
      ),
      eventId: getString(record.EventId),
      failureReason:
        getString(record.ErrorMessage) ??
        getString(record.ErrorCode) ??
        getString(record.SmsStatus),
      raw: record,
    };
  },
};

function mapTwilioStatusToTransition(
  status?: string,
): WebhookEvent["transition"] {
  switch ((status ?? "").toLowerCase()) {
    case "accepted":
    case "queued":
    case "sending":
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "undelivered":
    case "failed":
      return "failed";
    default:
      return "sent";
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function compactStrings(...values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value)).map((value) =>
    value.toLowerCase(),
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function createTwilioSignature(payload: string, authToken: string): string {
  const key = Buffer.from(authToken, "utf8");
  const data = Buffer.from(payload, "utf8");
  return createHmac("sha1", key).update(data).digest("base64");
}
