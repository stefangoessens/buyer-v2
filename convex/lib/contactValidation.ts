// ═══════════════════════════════════════════════════════════════════════════
// Public lead-intake validation and copy helpers (KIN-1096).
//
// Shared pure helpers for the public `/contact` form and the public
// non-Florida waitlist flow. Convex can't import from `src/`, so the
// backend copies the minimum validation and email-copy logic it needs
// for durable writes and tests.
// ═══════════════════════════════════════════════════════════════════════════

const CONTACT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_NAME_MIN_LENGTH = 1;
const CONTACT_NAME_MAX_LENGTH = 120;
const CONTACT_MESSAGE_MIN_LENGTH = 10;
const CONTACT_MESSAGE_MAX_LENGTH = 5_000;
const CONTACT_LISTING_LINK_MAX_LENGTH = 2_048;

export const CONTACT_BROKER_TEMPLATE_KEY = "contact_broker_inbox";
export const CONTACT_BUYER_TEMPLATE_KEY = "contact_autoreply";
export const WAITLIST_CONFIRMATION_TEMPLATE_KEY = "waitlist_confirmation";

export type ContactRejectReason =
  | "honeypot"
  | "rate_limited"
  | "invalid_name"
  | "invalid_email"
  | "invalid_message"
  | "invalid_listing_link";

export type ContactSubmitResult =
  | { ok: true }
  | { ok: false; reason: ContactRejectReason };

export type PublicIntakeScope = "contact" | "waitlist";

export function normalizeContactName(name: string): string {
  return name.trim();
}

export function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeContactMessage(message: string): string {
  return message.trim();
}

export function normalizeContactSourcePath(sourcePath: string): string {
  const trimmed = sourcePath.trim();
  return trimmed.length > 0 ? trimmed : "/";
}

export function isContactHoneypotTripped(
  honeypot: string | undefined,
): boolean {
  return typeof honeypot === "string" && honeypot.trim().length > 0;
}

export function isValidContactName(normalizedName: string): boolean {
  return (
    normalizedName.length >= CONTACT_NAME_MIN_LENGTH &&
    normalizedName.length <= CONTACT_NAME_MAX_LENGTH
  );
}

export function isValidContactEmail(normalizedEmail: string): boolean {
  return CONTACT_EMAIL_REGEX.test(normalizedEmail);
}

export function isValidContactMessage(normalizedMessage: string): boolean {
  return (
    normalizedMessage.length >= CONTACT_MESSAGE_MIN_LENGTH &&
    normalizedMessage.length <= CONTACT_MESSAGE_MAX_LENGTH
  );
}

export function normalizeContactListingLink(
  listingLink: string | undefined,
): string | undefined {
  if (listingLink === undefined) return undefined;
  const trimmed = listingLink.trim();
  if (trimmed.length === 0) return undefined;

  let url: URL;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    url = new URL(withProtocol);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  const normalized = url.toString();
  if (normalized.length > CONTACT_LISTING_LINK_MAX_LENGTH) {
    return undefined;
  }

  return normalized;
}

export function isValidContactListingLink(
  normalizedListingLink: string | undefined,
): boolean {
  return (
    normalizedListingLink === undefined ||
    normalizedListingLink.length <= CONTACT_LISTING_LINK_MAX_LENGTH
  );
}

export async function hashPublicIntakeIdentifier(
  scope: PublicIntakeScope,
  parts: Array<string | undefined>,
): Promise<string> {
  const normalized = parts
    .map((part) => (part ?? "").trim())
    .join("\u001f");
  const payload = `${scope}\u001f${normalized}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildContactThrottleIdentifier(args: {
  sourcePath: string;
  email: string;
  throttleId?: string;
}): Promise<string> {
  void args.sourcePath;
  return await hashPublicIntakeIdentifier("contact", [
    args.throttleId?.trim().length
      ? args.throttleId.trim()
      : normalizeContactEmail(args.email),
  ]);
}

export async function buildWaitlistThrottleIdentifier(args: {
  email: string;
  stateCode: string;
}): Promise<string> {
  return await hashPublicIntakeIdentifier("waitlist", [
    normalizeContactEmail(args.email),
    args.stateCode.trim().toUpperCase(),
  ]);
}

export function composeContactBrokerEmail(args: {
  requestId: string;
  name: string;
  email: string;
  message: string;
  listingLink?: string;
  sourcePath: string;
  receivedAt: string;
  attributionSessionId?: string;
  userAgent?: string;
}): { subject: string; bodyText: string } {
  const listingLine = args.listingLink ?? "not provided";
  const attributionLine = args.attributionSessionId ?? "not provided";
  const userAgentLine = args.userAgent ?? "not provided";

  return {
    subject: `New contact request from ${args.name}`,
    bodyText: [
      "A new buyer-v2 contact request was submitted.",
      "",
      `Request ID: ${args.requestId}`,
      `Name: ${args.name}`,
      `Email: ${args.email}`,
      `Listing link: ${listingLine}`,
      `Source path: ${args.sourcePath}`,
      `Received at: ${args.receivedAt}`,
      `Attribution session: ${attributionLine}`,
      `User agent: ${userAgentLine}`,
      "",
      "Message:",
      args.message,
    ].join("\n"),
  };
}

export function composeContactBuyerEmail(args: {
  name: string;
  listingLink?: string;
}): { subject: string; bodyText: string } {
  const listingLine = args.listingLink
    ? `If you shared a listing link, we'll start there: ${args.listingLink}`
    : "If you send a listing link next, we'll use that as the starting point.";

  return {
    subject: "We received your message",
    bodyText: [
      `Thanks${args.name ? `, ${args.name}` : ""} - we received your message.`,
      "",
      "We'll review it and get back with the next useful step.",
      listingLine,
      "",
      "If you need to add more context, just reply to this email.",
    ].join("\n"),
  };
}

export function composeWaitlistConfirmationEmail(args: {
  stateCode: string;
  zip?: string;
}): { subject: string; bodyText: string } {
  const zipLine = args.zip ? ` ZIP ${args.zip}` : "";
  return {
    subject: "You're on the buyer-v2 waitlist",
    bodyText: [
      "Thanks - you're on the buyer-v2 waitlist.",
      "",
      `We received your request for ${args.stateCode}${zipLine}.`,
      "We'll let you know when buyer-v2 launches there.",
      "",
      "If you want to update your area later, just reply to this email.",
    ].join("\n"),
  };
}
