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

export type MailMessage = {
  to: string;
  toName?: string;
  from: string;
  fromName: string;
  subject: string;
  bodyText: string;
  replyTo?: string;
  metadata?: Record<string, string>;
};

export interface MailDriver {
  name: "noop" | "resend";
  send(msg: MailMessage): Promise<{ providerMessageId: string }>;
}

export const noopDriver: MailDriver = {
  name: "noop",
  async send(msg: MailMessage): Promise<{ providerMessageId: string }> {
    const providerMessageId = `noop-${crypto.randomUUID()}`;
    console.info("[mailRail:noop] simulated send", {
      providerMessageId,
      to: msg.to,
      from: msg.from,
      subject: msg.subject,
      bodyTextLength: msg.bodyText.length,
      replyTo: msg.replyTo,
      metadata: msg.metadata,
    });
    return { providerMessageId };
  },
};

/**
 * Pick the active mail driver based on `KIN_1079_MAIL_DRIVER`.
 *
 * Defaults to `"noop"` when unset. Any unknown value throws so a typo in a
 * deploy env does not silently fall back. The `"resend"` branch deliberately
 * throws with a loud marker until KIN-1092 wires the real client, so the
 * first time someone flips the env we get a clear signal instead of silent
 * black-hole sends.
 */
export function selectDriver(): MailDriver {
  const raw = process.env.KIN_1079_MAIL_DRIVER ?? "noop";
  if (raw === "noop") return noopDriver;
  if (raw === "resend") {
    throw new Error("Resend driver not wired — waiting on KIN-1092");
  }
  throw new Error(`Unknown KIN_1079_MAIL_DRIVER: ${raw}`);
}
