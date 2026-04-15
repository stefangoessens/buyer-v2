export const NOTIFICATION_CHANNELS = [
  "email",
  "sms",
  "push",
  "in_app",
] as const;
export const EXTERNAL_NOTIFICATION_CHANNELS = ["email", "sms", "push"] as const;
export const NOTIFICATION_CATEGORIES = [
  "transactional",
  "tours",
  "offers",
  "closing",
  "disclosures",
  "market_updates",
  "marketing",
  "safety",
] as const;
export const NOTIFICATION_URGENCIES = [
  "transactional_must_deliver",
  "transactional",
  "relationship",
  "digest_only",
] as const;
export const NOTIFICATION_DELIVERY_STATES = [
  "pending",
  "dispatched",
  "delivered",
  "failed",
  "skipped_by_preference",
] as const;
export const NOTIFICATION_PROVIDER_NAMES = [
  "resend",
  "twilio",
  "apns",
] as const;
export const WEBHOOK_TRANSITIONS = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "failed",
  "suppressed",
  "inbound_received",
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type ExternalNotificationChannel =
  (typeof EXTERNAL_NOTIFICATION_CHANNELS)[number];
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationUrgency = (typeof NOTIFICATION_URGENCIES)[number];
export type NotificationDeliveryState =
  (typeof NOTIFICATION_DELIVERY_STATES)[number];
export type NotificationProviderName =
  (typeof NOTIFICATION_PROVIDER_NAMES)[number];
export type WebhookTransition = (typeof WEBHOOK_TRANSITIONS)[number];

export interface NotificationRoutingRule {
  eventType: string;
  label: string;
  category: NotificationCategory;
  urgency: NotificationUrgency;
  preferredChannels: readonly NotificationChannel[];
  templateKey: string;
  digestEligible?: boolean;
  quietHoursBypass?: boolean;
  suppressionBypass?: boolean;
  safetyBypass?: boolean;
  notes?: string;
}

export interface DeliveryRequest {
  eventId: string;
  eventType: string;
  dedupeKey: string;
  recipientKey: string;
  channel: ExternalNotificationChannel;
  provider: NotificationProviderName;
  category: NotificationCategory;
  urgency: NotificationUrgency;
  attemptNumber: number;
  idempotencyKey: string;
  templateKey: string;
  metadata?: Record<string, string>;
}

export interface DeliveryResult {
  provider: NotificationProviderName;
  providerEventId: string;
  providerMessageId: string;
  status: "accepted" | "dispatched" | "delivered" | "failed" | "skipped";
  failureKind?: "transient" | "permanent";
  reason?: string;
}

export interface WebhookEvent {
  provider: NotificationProviderName;
  providerEventId: string;
  providerMessageId?: string;
  transition: WebhookTransition;
  occurredAt: string;
  recipientKeys?: string[];
  eventId?: string;
  failureReason?: string;
  raw: Record<string, unknown>;
}

export interface ProviderAdapter {
  name: NotificationProviderName;
  send(request: DeliveryRequest): Promise<DeliveryResult>;
  verifyWebhook(payload: unknown, signature: string): boolean;
  ingestWebhookEvent(
    payload: unknown,
    options?: { providerEventId?: string },
  ): WebhookEvent;
}

export function buildDeliveryIdempotencyKey(args: {
  eventId: string;
  dedupeKey: string;
  channel: ExternalNotificationChannel;
  attemptNumber: number;
}): string {
  return [
    args.eventId,
    args.dedupeKey,
    args.channel,
    String(args.attemptNumber),
  ].join(":");
}

export function isExternalNotificationChannel(
  channel: NotificationChannel,
): channel is ExternalNotificationChannel {
  return channel === "email" || channel === "sms" || channel === "push";
}

export function getNotificationProviderEventId(
  provider: NotificationProviderName,
  payload: Record<string, unknown>,
  options: {
    fallbackId?: string | null;
    routeKind?: string;
  } = {},
): string | null {
  const routeKind = options.routeKind?.trim();
  const rawValue =
    provider === "resend"
      ? getStringValue(payload.svix_id) ??
        getStringValue(payload.id) ??
        getStringValue(payload.event_id) ??
        options.fallbackId
      : provider === "twilio"
        ? [
            getStringValue(payload.EventSid) ??
              getStringValue(payload.SmsSid) ??
              getStringValue(payload.MessageSid) ??
              getStringValue(payload.SmsMessageSid),
            getStringValue(payload.MessageStatus) ??
              getStringValue(payload.SmsStatus) ??
              getStringValue(payload.EventType) ??
              routeKind,
          ]
            .filter(Boolean)
            .join(":")
        : getStringValue(payload.id) ?? options.fallbackId;

  if (!rawValue) {
    return null;
  }

  return [provider, routeKind, rawValue].filter(Boolean).join(":");
}

export function hashRecipientKey(recipientKey: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(recipientKey.trim().toLowerCase())) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function getStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
