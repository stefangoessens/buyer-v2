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
