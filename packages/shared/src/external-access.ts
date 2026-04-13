/**
 * Canonical limited external-access contract.
 *
 * This package owns the typed token, validation, and session model used for
 * narrow counterparty access. The session shape intentionally cannot express
 * broker/admin capabilities, which keeps the external path isolated from
 * internal tooling by construction.
 */

/** The fixed set of actions an external-access token may authorize. */
export const EXTERNAL_ACCESS_ACTIONS = [
  "view_offer",
  "submit_response",
  "confirm_compensation",
  "acknowledge_receipt",
] as const;

export type ExternalAccessAction = (typeof EXTERNAL_ACCESS_ACTIONS)[number];

/**
 * The minimal resource surface exposed to external counterparties today.
 * Future resources must be added deliberately rather than piggybacking on
 * broker/admin read models.
 */
export const EXTERNAL_ACCESS_RESOURCES = ["offer"] as const;

export type ExternalAccessResource = (typeof EXTERNAL_ACCESS_RESOURCES)[number];

/** Role label for the external party. Used for audit display; NOT a permission. */
export const EXTERNAL_ROLES = [
  "listing_agent",
  "listing_broker",
  "cooperating_broker",
  "other",
] as const;

export type ExternalRole = (typeof EXTERNAL_ROLES)[number];

/** Reasons a token check can deny access. Stable for client handling. */
export const TOKEN_DENIAL_REASONS = [
  "not_found",
  "expired",
  "revoked",
  "action_not_allowed",
  "scope_mismatch",
] as const;

export type TokenDenialReason = (typeof TOKEN_DENIAL_REASONS)[number];

/**
 * Result of a token validation check. The result is either a granted scope
 * OR a denial with a structured reason — never both.
 */
export type TokenValidationResult =
  | {
      granted: true;
      allowedActions: ExternalAccessAction[];
      dealRoomId: string;
      offerId?: string;
      expiresAt: string;
      role: ExternalRole;
    }
  | {
      granted: false;
      reason: TokenDenialReason;
    };

/** Persisted token record shape the validator works against. */
export interface TokenRecord {
  hashedToken: string;
  dealRoomId: string;
  offerId?: string;
  role: ExternalRole;
  allowedActions: ExternalAccessAction[];
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** Inputs to the validator. `now` is injected for deterministic testing. */
export interface ValidateTokenArgs {
  record: TokenRecord | null;
  presentedHash: string;
  intendedAction: ExternalAccessAction;
  now: string;
}

export interface ExternalAccessScope {
  resource: ExternalAccessResource;
  dealRoomId: string;
  offerId?: string;
  allowedActions: ExternalAccessAction[];
  expiresAt: string;
}

/**
 * External sessions are deliberately incapable of expressing internal
 * permissions. All broker/admin capabilities are hard-coded false.
 */
export interface ExternalAccessSessionPermissions {
  canViewOffer: boolean;
  canSubmitResponse: boolean;
  canConfirmCompensation: boolean;
  canAcknowledgeReceipt: boolean;
  canAccessInternalConsole: false;
  canReadBuyerData: false;
  canReadBrokerTools: false;
  canMutateAdminOnlyState: false;
}

export interface ExternalAccessSession {
  kind: "external_access";
  subject: {
    kind: "token";
    tokenId?: string;
    hashedToken: string;
    role: ExternalRole;
  };
  scope: ExternalAccessScope;
  permissions: ExternalAccessSessionPermissions;
}

export interface CreateExternalAccessSessionArgs {
  hashedToken: string;
  dealRoomId: string;
  expiresAt: string;
  role: ExternalRole;
  allowedActions: ExternalAccessAction[];
  offerId?: string;
  resource?: ExternalAccessResource;
  tokenId?: string;
}

/** Entropy in bytes. 32 bytes = 256 bits. */
const TOKEN_BYTE_LENGTH = 32;

function getCrypto(): Crypto | undefined {
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  return undefined;
}

export function buildExternalAccessSessionPermissions(
  allowedActions: readonly ExternalAccessAction[],
): ExternalAccessSessionPermissions {
  const allow = new Set(allowedActions);
  return {
    canViewOffer: allow.has("view_offer"),
    canSubmitResponse: allow.has("submit_response"),
    canConfirmCompensation: allow.has("confirm_compensation"),
    canAcknowledgeReceipt: allow.has("acknowledge_receipt"),
    canAccessInternalConsole: false,
    canReadBuyerData: false,
    canReadBrokerTools: false,
    canMutateAdminOnlyState: false,
  };
}

export function createExternalAccessSession(
  args: CreateExternalAccessSessionArgs,
): ExternalAccessSession {
  return {
    kind: "external_access",
    subject: {
      kind: "token",
      tokenId: args.tokenId,
      hashedToken: args.hashedToken,
      role: args.role,
    },
    scope: {
      resource: args.resource ?? "offer",
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      allowedActions: [...args.allowedActions],
      expiresAt: args.expiresAt,
    },
    permissions: buildExternalAccessSessionPermissions(args.allowedActions),
  };
}

export function isTokenDenialReason(value: string): value is TokenDenialReason {
  return TOKEN_DENIAL_REASONS.includes(value as TokenDenialReason);
}

export function isExternalActionAllowed(
  session: ExternalAccessSession,
  action: ExternalAccessAction,
): boolean {
  switch (action) {
    case "view_offer":
      return session.permissions.canViewOffer;
    case "submit_response":
      return session.permissions.canSubmitResponse;
    case "confirm_compensation":
      return session.permissions.canConfirmCompensation;
    case "acknowledge_receipt":
      return session.permissions.canAcknowledgeReceipt;
  }
}

export function generateToken(): string {
  const crypto = getCrypto();
  if (!crypto?.getRandomValues) {
    throw new Error(
      "Web Crypto API unavailable — cannot generate external access token",
    );
  }
  const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return `eat_${toBase64Url(bytes)}`;
}

export async function hashToken(plaintext: string): Promise<string> {
  const crypto = getCrypto();
  if (!crypto?.subtle) {
    throw new Error(
      "Web Crypto Subtle API unavailable — cannot hash external access token",
    );
  }
  const encoded = new TextEncoder().encode(plaintext);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function validateToken(args: ValidateTokenArgs): TokenValidationResult {
  if (!args.record) {
    return { granted: false, reason: "not_found" };
  }

  if (!constantTimeEqual(args.presentedHash, args.record.hashedToken)) {
    return { granted: false, reason: "not_found" };
  }

  if (args.record.revokedAt !== undefined) {
    return { granted: false, reason: "revoked" };
  }

  const nowMs = parseInstant(args.now);
  const expiresMs = parseInstant(args.record.expiresAt);
  if (nowMs === null || expiresMs === null || nowMs >= expiresMs) {
    return { granted: false, reason: "expired" };
  }

  if (!args.record.allowedActions.includes(args.intendedAction)) {
    return { granted: false, reason: "action_not_allowed" };
  }

  return {
    granted: true,
    allowedActions: [...args.record.allowedActions],
    dealRoomId: args.record.dealRoomId,
    offerId: args.record.offerId,
    expiresAt: args.record.expiresAt,
    role: args.record.role,
  };
}

function parseInstant(iso: string): number | null {
  const n = Date.parse(iso);
  return Number.isNaN(n) ? null : n;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa !== "undefined"
    ? btoa(binary)
    : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function computeExpiry(hoursFromNow: number, now: Date): string {
  const expiry = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
  return expiry.toISOString();
}
