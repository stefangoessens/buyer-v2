/**
 * Shared communication template contract catalog (KIN-919).
 *
 * This module owns the typed contract for template registry rows and the
 * helper types used to render them. Convex stores the rows, web code can
 * render previews, and the shape stays shared without UI-only coupling.
 */

export const COMMUNICATION_TEMPLATE_CHANNELS = [
  "email",
  "sms",
  "in_app",
  "push",
] as const;

export type CommunicationTemplateChannel =
  (typeof COMMUNICATION_TEMPLATE_CHANNELS)[number];

export const EMAIL_STREAMS = [
  "transactional",
  "relationship",
] as const;

export type EmailStream = (typeof EMAIL_STREAMS)[number];

export const EMAIL_TEMPLATE_KEYS = [
  "account-welcome",
  "offer-gate-callback-confirmation",
  "disclosure-request-to-agent",
  "disclosure-ready",
  "tour-confirmed",
  "offer-countered",
  "closing-milestone",
  "waitlist-welcome",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export interface EmailTemplateMetadata {
  key: EmailTemplateKey;
  channel: "email";
  stream: EmailStream;
  description: string;
  defaultSubject: string;
  sourceFile: string;
  variables: readonly string[];
}

export const EMAIL_TEMPLATE_METADATA = [
  {
    key: "account-welcome",
    channel: "email",
    stream: "relationship",
    description: "Post-signup buyer welcome message.",
    defaultSubject: "Welcome to buyer-v2",
    sourceFile: "src/emails/account-welcome.tsx",
    variables: ["buyerFirstName", "dashboardUrl"],
  },
  {
    key: "offer-gate-callback-confirmation",
    channel: "email",
    stream: "transactional",
    description: "Confirms brokerage callback request after the phone gate.",
    defaultSubject: "We have your callback request",
    sourceFile: "src/emails/offer-gate-callback-confirmation.tsx",
    variables: ["buyerFirstName", "propertyAddress", "callbackWindow"],
  },
  {
    key: "disclosure-request-to-agent",
    channel: "email",
    stream: "transactional",
    description: "Broker-to-broker disclosure packet request.",
    defaultSubject: "Disclosure request",
    sourceFile: "src/emails/disclosure-request-to-agent.tsx",
    variables: [
      "listingAgentName",
      "buyerDisplayName",
      "propertyAddress",
      "personalNote",
      "replyToAddress",
    ],
  },
  {
    key: "disclosure-ready",
    channel: "email",
    stream: "transactional",
    description: "Disclosure packet is ready and red flags are surfaced.",
    defaultSubject: "Your disclosure packet is ready",
    sourceFile: "src/emails/disclosure-ready.tsx",
    variables: [
      "buyerFirstName",
      "propertyAddress",
      "redFlagSummary",
      "disclosuresUrl",
    ],
  },
  {
    key: "tour-confirmed",
    channel: "email",
    stream: "transactional",
    description: "Tour booking receipt and logistics.",
    defaultSubject: "Tour confirmed",
    sourceFile: "src/emails/tour-confirmed.tsx",
    variables: ["buyerFirstName", "propertyAddress", "scheduledAt", "itineraryUrl"],
  },
  {
    key: "offer-countered",
    channel: "email",
    stream: "transactional",
    description: "Seller counter-offer notification.",
    defaultSubject: "Seller counter received",
    sourceFile: "src/emails/offer-countered.tsx",
    variables: ["buyerFirstName", "propertyAddress", "counterPrice", "offerUrl"],
  },
  {
    key: "closing-milestone",
    channel: "email",
    stream: "transactional",
    description: "Generic closing milestone reminder.",
    defaultSubject: "Closing milestone update",
    sourceFile: "src/emails/closing-milestone.tsx",
    variables: [
      "buyerFirstName",
      "propertyAddress",
      "milestoneName",
      "dueDate",
      "actionUrl",
    ],
  },
  {
    key: "waitlist-welcome",
    channel: "email",
    stream: "relationship",
    description: "Non-Florida waitlist confirmation.",
    defaultSubject: "You're on the buyer-v2 waitlist",
    sourceFile: "src/emails/waitlist-welcome.tsx",
    variables: ["buyerFirstName", "stateName", "learnMoreUrl"],
  },
] as const satisfies readonly EmailTemplateMetadata[];

export type CommunicationTemplateInputValue = string | number | boolean;

export type CommunicationTemplateRenderInputs<
  TVariable extends string = string,
> = Record<TVariable, CommunicationTemplateInputValue>;

export interface CommunicationTemplateRecord<TVariable extends string = string> {
  key: string;
  channel: CommunicationTemplateChannel;
  version: string;
  subject?: string;
  body: string;
  variables: readonly TVariable[];
  isActive: boolean;
  description?: string;
  author: string;
  changeNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationTemplateDraft<TVariable extends string = string> {
  key: string;
  channel: CommunicationTemplateChannel;
  version: string;
  subject?: string;
  body: string;
  variables: readonly TVariable[];
  description?: string;
  author: string;
  changeNotes?: string;
}

export interface CommunicationTemplateRenderSpec<
  TVariable extends string = string,
> {
  subject?: string;
  body: string;
  variables: readonly TVariable[];
}

const COMMUNICATION_TEMPLATE_VERSION_RE = /^\d+\.\d+\.\d+$/;

export function isValidCommunicationTemplateVersion(version: string): boolean {
  return COMMUNICATION_TEMPLATE_VERSION_RE.test(version);
}

export function compareCommunicationTemplateVersions(
  a: string,
  b: string
): number {
  if (!isValidCommunicationTemplateVersion(a)) {
    throw new Error(`Invalid version: ${a}`);
  }
  if (!isValidCommunicationTemplateVersion(b)) {
    throw new Error(`Invalid version: ${b}`);
  }

  const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
  const [bMajor, bMinor, bPatch] = b.split(".").map(Number);

  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}
