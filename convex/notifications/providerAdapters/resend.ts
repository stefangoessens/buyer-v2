import { createHmac } from "node:crypto";
import type {
  DeliveryRequest,
  DeliveryResult,
  ProviderAdapter,
  WebhookEvent,
} from "@/lib/notifications/types";

type ResendWebhookEnvelope = {
  payload: string;
  headers: {
    id: string;
    timestamp: string;
    signature: string;
  };
};

type EmailWebhookTransition =
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed"
  | "received";

type EmailDeliveryRequest = {
  channel: "email";
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string | string[];
  headers?: Record<string, string>;
  tags?: Record<string, string>;
  idempotencyKey?: string;
  audience?: string;
  content:
    | {
        kind: "template";
        templateKey: string;
        templateVariables: Record<string, unknown>;
      }
    | {
        kind: "raw";
        subject: string;
        text: string;
        html?: string;
      };
};

type EmailDeliveryResult = {
  providerMessageId: string;
  renderedSubject: string;
  renderedHtml: string;
  renderedText: string;
};

type EmailWebhookSignatureHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

type EmailWebhookEvent = {
  provider: "resend";
  providerEventId: string;
  providerMessageId: string;
  type: EmailWebhookTransition;
  createdAt: string;
  from: string;
  to: string[];
  subject: string;
  tags: Record<string, string>;
  clickedLink?: string;
  failureReason?: string;
  suppressedType?: string;
  bounce?: {
    type: string;
    subType: string;
    message: string;
  };
  suppressed?: {
    type: string;
    message: string;
  };
};

type EmailProviderAdapter = {
  name: "resend";
  send(request: EmailDeliveryRequest): Promise<EmailDeliveryResult>;
  verifyWebhook(args: {
    payload: string;
    headers: EmailWebhookSignatureHeaders;
  }): unknown;
  ingestWebhookEvent(
    payload: unknown,
    options?: { providerEventId?: string },
  ): EmailWebhookEvent;
};

type ResendWebhookVerifier = {
  verify(args: {
    payload: string;
    headers: EmailWebhookSignatureHeaders;
    webhookSecret: string;
  }): unknown;
};

type ResendClient = {
  webhooks: ResendWebhookVerifier;
};

let resendClientFactory: ((apiKey: string) => ResendClient) | null = null;

export const resendAdapter: ProviderAdapter = {
  name: "resend",

  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    const providerMessageId = [
      "resend",
      request.eventId,
      request.channel,
      String(request.attemptNumber),
    ].join(":");

    return {
      provider: "resend",
      providerEventId: providerMessageId,
      providerMessageId,
      status: "delivered",
    };
  },

  verifyWebhook(payload: unknown, signature: string): boolean {
    const envelope = payload as ResendWebhookEnvelope | undefined;
    if (!envelope?.payload || !envelope.headers || !signature.trim()) {
      return false;
    }

    try {
      getResendClient().webhooks.verify({
        payload: envelope.payload,
        headers: {
          id: envelope.headers.id,
          timestamp: envelope.headers.timestamp,
          signature: envelope.headers.signature,
        },
        webhookSecret: signature,
      });
      return true;
    } catch {
      return false;
    }
  },

  ingestWebhookEvent(
    payload: unknown,
    options?: { providerEventId?: string },
  ): WebhookEvent {
    const record =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const data =
      record.data && typeof record.data === "object"
        ? (record.data as Record<string, unknown>)
        : {};
    const tags =
      data.tags && typeof data.tags === "object"
        ? (data.tags as Record<string, unknown>)
        : {};

    return {
      provider: "resend",
      providerEventId:
        options?.providerEventId ??
        getString(record.id) ??
        `resend:${crypto.randomUUID()}`,
      providerMessageId: getString(data.email_id) ?? getString(data.id) ?? undefined,
      transition: mapResendTransition(getString(record.type)),
      occurredAt:
        getString(record.created_at) ??
        getString(data.created_at) ??
        new Date().toISOString(),
      recipientKeys: asStringArray(data.to),
      eventId: getString(tags.eventId),
      failureReason:
        getString(data.reason) ??
        getString(data.message) ??
        getString(data.response),
      suppressedType:
        data.suppressed && typeof data.suppressed === "object"
          ? getString((data.suppressed as Record<string, unknown>).type)
          : undefined,
      raw: record,
    };
  },
};

// Compatibility seam for older mail-rail work that is still dirty in this
// workspace. It intentionally stays stubbed so KIN-1091 does not ship a real
// general Resend delivery rail.
export const resendEmailRailAdapter: EmailProviderAdapter = {
  name: "resend",

  async send(request: EmailDeliveryRequest): Promise<EmailDeliveryResult> {
    const providerMessageId = [
      "resend-email",
      request.content.kind === "template"
        ? request.content.templateKey
        : request.content.subject,
      crypto.randomUUID(),
    ].join(":");

    const renderedSubject =
      request.content.kind === "template"
        ? request.content.templateKey
        : request.content.subject;
    const renderedText =
      request.content.kind === "template"
        ? JSON.stringify(request.content.templateVariables)
        : request.content.text;
    const renderedHtml =
      request.content.kind === "template"
        ? `<pre>${escapeHtml(renderedText)}</pre>`
        : request.content.html ?? htmlFromPlainText(request.content.text);

    return {
      providerMessageId,
      renderedSubject,
      renderedHtml,
      renderedText,
    };
  },

  verifyWebhook(args: { payload: string; headers: EmailWebhookSignatureHeaders }) {
    return resendAdapter.verifyWebhook(
      {
        payload: args.payload,
        headers: {
          id: args.headers.id,
          timestamp: args.headers.timestamp,
          signature: args.headers.signature,
        },
      },
      process.env.RESEND_WEBHOOK_SECRET ?? "",
    );
  },

  ingestWebhookEvent(
    payload: unknown,
    options?: { providerEventId?: string },
  ): EmailWebhookEvent {
    const record =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const data =
      record.data && typeof record.data === "object"
        ? (record.data as Record<string, unknown>)
        : {};

    return {
      provider: "resend",
      providerEventId:
        options?.providerEventId ??
        getString(record.id) ??
        `resend:${crypto.randomUUID()}`,
      providerMessageId: getString(data.email_id) ?? getString(data.id) ?? "",
      type: mapResendEmailTransition(getString(record.type)),
      createdAt:
        getString(record.created_at) ??
        getString(data.created_at) ??
        new Date().toISOString(),
      from: getString(data.from) ?? "",
      to: asStringArray(data.to),
      subject: getString(data.subject) ?? "",
      tags: toStringRecord(data.tags),
      clickedLink:
        data.click && typeof data.click === "object"
          ? getString((data.click as Record<string, unknown>).link)
          : undefined,
      failureReason:
        getString(data.reason) ??
        getString(data.message) ??
        getString(data.response),
      suppressedType:
        data.suppressed && typeof data.suppressed === "object"
          ? getString((data.suppressed as Record<string, unknown>).type)
          : undefined,
      bounce:
        data.bounce && typeof data.bounce === "object"
          ? {
              type: getString((data.bounce as Record<string, unknown>).type) ?? "",
              subType:
                getString((data.bounce as Record<string, unknown>).subType) ?? "",
              message:
                getString((data.bounce as Record<string, unknown>).message) ?? "",
            }
          : undefined,
      suppressed:
        data.suppressed && typeof data.suppressed === "object"
          ? {
              type:
                getString((data.suppressed as Record<string, unknown>).type) ?? "",
              message:
                getString((data.suppressed as Record<string, unknown>).message) ??
                "",
            }
          : undefined,
    };
  },
};

export function __setResendClientFactoryForTests(
  factory: ((apiKey: string) => ResendClient) | null,
): void {
  resendClientFactory = factory;
}

function mapResendTransition(type: string | undefined): WebhookEvent["transition"] {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "opened";
    case "email.clicked":
      return "clicked";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.failed":
      return "failed";
    case "email.suppressed":
      return "suppressed";
    case "email.received":
      return "received";
    default:
      return "sent";
  }
}

function mapResendEmailTransition(
  type: string | undefined,
): EmailWebhookTransition {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "opened";
    case "email.clicked":
      return "clicked";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.failed":
      return "failed";
    case "email.suppressed":
      return "suppressed";
    case "email.received":
      return "received";
    default:
      return "sent";
  }
}

function getResendClient(): ResendClient {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "notification-fabric-stub";
  return (resendClientFactory ?? createDefaultResendClient)(apiKey);
}

function createDefaultResendClient(_apiKey: string): ResendClient {
  return {
    webhooks: {
      verify(args) {
        if (!verifyResendWebhookSignature(args)) {
          throw new Error("Invalid Resend webhook signature");
        }

        return true;
      },
    },
  };
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) {
      return [item.trim().toLowerCase()];
    }
    if (
      item &&
      typeof item === "object" &&
      "email" in item &&
      typeof item.email === "string" &&
      item.email.trim()
    ) {
      return [item.email.trim().toLowerCase()];
    }
    return [];
  });
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ? [[key, entry]] : [],
    ),
  );
}

function htmlFromPlainText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function verifyResendWebhookSignature(args: {
  payload: string;
  headers: EmailWebhookSignatureHeaders;
  webhookSecret: string;
}): boolean {
  const secret = decodeResendWebhookSecret(args.webhookSecret);
  if (
    !secret ||
    !args.headers.id.trim() ||
    !args.headers.timestamp.trim() ||
    !args.headers.signature.trim()
  ) {
    return false;
  }

  const signedPayload = [
    args.headers.id.trim(),
    args.headers.timestamp.trim(),
    args.payload,
  ].join(".");
  const expectedSignature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("base64");

  return extractResendSignatures(args.headers.signature).some((signature) =>
    timingSafeEqual(signature, expectedSignature),
  );
}

function decodeResendWebhookSecret(secret: string): Buffer | null {
  const normalized = secret.trim().replace(/^whsec_/, "");
  if (!normalized) {
    return null;
  }

  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length > 0 && looksLikeBase64(normalized, decoded)) {
    return decoded;
  }

  return Buffer.from(normalized, "utf8");
}

function looksLikeBase64(value: string, decoded: Buffer): boolean {
  const normalizedValue = value.replace(/=+$/u, "");
  const encodedValue = decoded.toString("base64").replace(/=+$/u, "");
  return encodedValue === normalizedValue;
}

function extractResendSignatures(signatureHeader: string): string[] {
  return Array.from(signatureHeader.matchAll(/v1,([^\s,]+)/gu), (match) =>
    match[1] ?? "",
  ).filter((signature) => signature.length > 0);
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
