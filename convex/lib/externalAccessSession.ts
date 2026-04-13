import type { Doc, Id } from "../_generated/dataModel";
import {
  createExternalAccessSession,
  validateToken,
  type ExternalAccessAction,
  type ExternalAccessSession,
  type TokenDenialReason,
  type TokenRecord,
} from "../../packages/shared/src/external-access";

type ExternalTokenDoc = Doc<"externalAccessTokens">;

export interface AuthorizeExternalAccessSessionArgs {
  token: ExternalTokenDoc | null;
  hashedToken: string;
  intendedAction: ExternalAccessAction;
  intendedDealRoomId: Id<"dealRooms">;
  intendedOfferId?: Id<"offers">;
  now: string;
}

export type AuthorizeExternalAccessSessionResult =
  | {
      ok: true;
      session: ExternalAccessSession;
      token: ExternalTokenDoc;
    }
  | {
      ok: false;
      reason: TokenDenialReason;
      token: ExternalTokenDoc | null;
    };

function toTokenRecord(token: ExternalTokenDoc): TokenRecord {
  return {
    hashedToken: token.hashedToken,
    dealRoomId: token.dealRoomId,
    offerId: token.offerId,
    role: token.role,
    allowedActions: [...token.allowedActions],
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
  };
}

/**
 * Resolve a token into a typed external session scoped to the minimal
 * external surface. This helper is the single gate between an untrusted
 * counterparty token and internal Convex mutations.
 */
export function authorizeExternalAccessSession(
  args: AuthorizeExternalAccessSessionArgs,
): AuthorizeExternalAccessSessionResult {
  const validation = validateToken({
    record: args.token ? toTokenRecord(args.token) : null,
    presentedHash: args.hashedToken,
    intendedAction: args.intendedAction,
    now: args.now,
  });

  if (!validation.granted) {
    return {
      ok: false,
      reason: validation.reason,
      token: args.token,
    };
  }

  if (validation.dealRoomId !== args.intendedDealRoomId) {
    return {
      ok: false,
      reason: "scope_mismatch",
      token: args.token,
    };
  }

  if (
    validation.offerId !== undefined &&
    validation.offerId !== args.intendedOfferId
  ) {
    return {
      ok: false,
      reason: "scope_mismatch",
      token: args.token,
    };
  }

  return {
    ok: true,
    token: args.token!,
    session: createExternalAccessSession({
      tokenId: args.token!._id,
      hashedToken: args.token!.hashedToken,
      dealRoomId: validation.dealRoomId,
      offerId: validation.offerId,
      role: validation.role,
      allowedActions: validation.allowedActions,
      expiresAt: validation.expiresAt,
    }),
  };
}
