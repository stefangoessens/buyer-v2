import type { EmailStream, EmailTemplateKey } from "@buyer-v2/shared";

export interface EmailRawContent {
  kind: "raw";
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTemplateContent {
  kind: "template";
  templateKey: EmailTemplateKey;
  templateVariables: Record<string, unknown>;
}

export interface EmailDeliveryRequest {
  channel: "email";
  audience: EmailStream;
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string | string[];
  headers?: Record<string, string>;
  tags?: Record<string, string>;
  idempotencyKey?: string;
  content: EmailRawContent | EmailTemplateContent;
}

export interface EmailDeliveryResult {
  providerMessageId: string;
  renderedSubject: string;
  renderedHtml: string;
  renderedText: string;
}

export interface EmailWebhookSignatureHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

export type EmailWebhookTransition =
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed"
  | "received";

export interface EmailWebhookEvent {
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
  bounce?: {
    type: string;
    subType: string;
    message: string;
  };
  suppressed?: {
    type: string;
    message: string;
  };
}

export interface EmailProviderAdapter {
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
}
