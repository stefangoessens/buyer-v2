export const appRoles = ["buyer", "broker", "admin"] as const;

export type AppRole = (typeof appRoles)[number];

export const authProviders = ["clerk", "auth0"] as const;

export type AuthProvider = (typeof authProviders)[number];

export const authSessionStates = [
  "anonymous",
  "restoring",
  "signed_out",
  "signed_in",
  "expired",
  "auth_unavailable",
  "unknown_user",
  "role_mismatch",
  "stale_claims",
  "revoked_session",
  "clock_skew",
] as const;

export type AuthSessionState = (typeof authSessionStates)[number];

export interface SessionClaims {
  authTokenIdentifier: string;
  authSubject: string;
  authIssuer: string;
  authProvider?: AuthProvider;
  sessionVersion?: number;
  issuedAt?: string;
  expiresAt?: string;
}

export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  role: AppRole;
  claims: SessionClaims;
}

export interface WebSessionPermissions {
  canAccessInternalConsole: boolean;
  canReadBuyerData: boolean;
  canReadBrokerTools: boolean;
  canMutateAdminOnlyState: boolean;
}

export interface WebSession {
  user: SessionUser;
  permissions: WebSessionPermissions;
  snapshot?: {
    openReviewItems: number;
    urgentReviewItems: number;
    latestKpiComputedAt: string | null;
    pendingOverrideCount: number;
  };
}
