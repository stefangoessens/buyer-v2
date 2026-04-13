export {
  EXTERNAL_ACCESS_ACTIONS,
  EXTERNAL_ACCESS_RESOURCES,
  EXTERNAL_ROLES,
  TOKEN_DENIAL_REASONS,
  buildExternalAccessSessionPermissions,
  createExternalAccessSession,
  isExternalActionAllowed,
  isTokenDenialReason,
  type ExternalAccessAction,
  type ExternalAccessResource,
  type ExternalAccessScope,
  type ExternalAccessSession,
  type ExternalAccessSessionPermissions,
  type ExternalRole,
  type TokenDenialReason,
  type TokenRecord,
  type TokenValidationResult,
} from "../../../packages/shared/src/external-access";
import type {
  ExternalAccessAction,
  TokenDenialReason,
} from "../../../packages/shared/src/external-access";

/** Shape used for recording an audit event about a token interaction. */
export type TokenEventType =
  | "issued"
  | "accessed"
  | "submitted"
  | "denied"
  | "revoked";

export interface TokenEventMetadata {
  attemptedAction?: ExternalAccessAction;
  denialReason?: TokenDenialReason;
  /** Free-form context for submissions (e.g., offer response summary). Never PII. */
  summary?: string;
}
