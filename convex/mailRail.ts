/**
 * Mail rail abstraction (KIN-1079).
 *
 * Thin driver interface over outbound email so the Request Disclosures flow
 * can ship against a no-op logger today and swap in a real Resend driver
 * without touching any caller. The real Resend wiring lives in KIN-1092.
 *
 * Runtime: Convex V8. Uses Web Crypto (`crypto.randomUUID()`); no Node
 * built-ins may be imported here.
 */

import type { EmailStream, EmailTemplateKey } from "@buyer-v2/shared";
import { renderTemplate } from "@/lib/email/renderTemplate";
import type {
  EmailDeliveryRequest,
  EmailDeliveryResult,
} from "@/lib/email/providerTypes";
import { resendEmailRailAdapter } from "./notifications/providerAdapters/resend";

export type MailMessage = {
  audience?: EmailStream;
  to: string | string[];
  toName?: string;
  from: string;
  fromName: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string | string[];
  headers?: Record<string, string>;
  tags?: Record<string, string>;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
} & (
  | {
      kind?: "raw";
      subject: string;
      bodyText: string;
      bodyHtml?: string;
    }
  | {
      kind: "template";
      templateKey: EmailTemplateKey;
      templateVariables: Record<string, unknown>;
    }
);

export type MailSendResult = EmailDeliveryResult;

function toDeliveryRequest(msg: MailMessage): EmailDeliveryRequest {
  return {
    channel: "email",
    audience: msg.audience ?? "relationship",
    from: msg.from,
    fromName: msg.fromName,
    to: Array.isArray(msg.to) ? msg.to : [msg.to],
    cc: msg.cc,
    bcc: msg.bcc,
    replyTo: msg.replyTo,
    headers: msg.headers,
    tags: {
      ...(msg.metadata ?? {}),
      ...(msg.tags ?? {}),
    },
    idempotencyKey: msg.idempotencyKey,
    content:
      msg.kind === "template"
        ? {
            kind: "template",
            templateKey: msg.templateKey,
            templateVariables: msg.templateVariables,
          }
        : {
            kind: "raw",
            subject: msg.subject,
            text: msg.bodyText,
            html: msg.bodyHtml,
          },
  };
};

export interface MailDriver {
  name: "noop" | "resend";
  send(msg: MailMessage): Promise<MailSendResult>;
}

export const noopDriver: MailDriver = {
  name: "noop",
  async send(msg: MailMessage): Promise<MailSendResult> {
    const providerMessageId = `noop-${crypto.randomUUID()}`;
    const rendered =
      msg.kind === "template"
        ? await renderTemplate(
            msg.templateKey as EmailTemplateKey,
            msg.templateVariables as unknown as Parameters<
              typeof renderTemplate
            >[1],
          ).then((result) => ({
            renderedSubject: result.subject,
            renderedHtml: result.html,
            renderedText: result.text,
          }))
        : {
            renderedSubject: msg.subject,
            renderedHtml: msg.bodyHtml ?? msg.bodyText,
            renderedText: msg.bodyText,
          };

    console.info("[mailRail:noop] simulated send", {
      providerMessageId,
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
      from: msg.from,
      subject: rendered.renderedSubject,
      bodyTextLength: rendered.renderedText.length,
      replyTo: msg.replyTo,
      tags: msg.tags,
    });

    return {
      providerMessageId,
      ...rendered,
    };
  },
};

const resendDriver: MailDriver = {
  name: "resend",
  async send(msg: MailMessage): Promise<MailSendResult> {
    return await resendEmailRailAdapter.send(toDeliveryRequest(msg));
  },
};

/**
 * Pick the active mail driver based on `KIN_1079_MAIL_DRIVER`.
 *
 * Defaults to `"noop"` when unset. Any unknown value throws so a typo in a
 * deploy env does not silently fall back. KIN-1092 wires the `"resend"`
 * branch to the provider-backed adapter while preserving the existing
 * disclosure-friendly seam.
 */
export function selectDriver(): MailDriver {
  const raw = process.env.KIN_1079_MAIL_DRIVER ?? "noop";
  if (raw === "noop") return noopDriver;
  if (raw === "resend") {
    return resendDriver;
  }
  throw new Error(`Unknown KIN_1079_MAIL_DRIVER: ${raw}`);
}
