import type {
  DeliveryRequest,
  DeliveryResult,
  ProviderAdapter,
  WebhookEvent,
} from "@/lib/notifications/types";

export const apnsAdapter: ProviderAdapter = {
  name: "apns",

  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    const providerMessageId = [
      "apns",
      request.eventId,
      request.channel,
      String(request.attemptNumber),
    ].join(":");

    return {
      provider: "apns",
      providerEventId: providerMessageId,
      providerMessageId,
      status: "delivered",
    };
  },

  verifyWebhook(_payload: unknown, signature: string): boolean {
    return signature.trim().length > 0;
  },

  ingestWebhookEvent(
    payload: unknown,
    options?: { providerEventId?: string },
  ): WebhookEvent {
    const record =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};

    return {
      provider: "apns",
      providerEventId:
        options?.providerEventId ??
        getString(record["apns-id"]) ??
        getString(record.apnsId) ??
        `apns:${crypto.randomUUID()}`,
      providerMessageId:
        getString(record["apns-id"]) ?? getString(record.apnsId) ?? undefined,
      transition: "delivered",
      occurredAt: new Date().toISOString(),
      recipientKeys: compactStrings(getString(record.token)),
      failureReason: getString(record.reason),
      raw: record,
    };
  },
};

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function compactStrings(...values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}
