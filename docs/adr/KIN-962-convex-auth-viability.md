# KIN-962 - Convex Auth Viability

Status: Proposed
Scope: buyer-v2 web app, Convex backend, iOS app session model
Date: 2026-04-12

## Decision Summary

Convex Auth library is not sufficient for the buyer-v2 architecture. Convex's own docs describe Convex Auth as beta, and Next.js SSR support as experimental. That makes it a poor primary auth product for this repo's chosen web and native architecture.

Primary session provider: Clerk.

- Web: Clerk cookie/session is the source of truth on the server.
- iOS: Clerk iOS is the source of truth for native session state.
- Convex: authorization and realtime layer, not the primary auth product.

Keep `users.role` in Convex as the authoritative app role. Convex still owns backend authorization, role gating, and realtime reads. The client never becomes the source of truth for access control.

Fallback: if Clerk procurement or integration blocks the ship path, Auth0 is acceptable as the primary OIDC provider with the same contract and the same downstream Convex integration shape.

## Context

Current repo state already splits auth by platform:

- Web uses `ConvexProvider` and `useQuery`, with server-side role checks in `convex/lib/session.ts` and `convex/adminShell.ts`.
- iOS uses a custom `AuthService` with `AuthState`, `AuthTokens`, and `AuthUser`, stores tokens in `KeychainStore`, and calls `/auth/login`, `/auth/refresh`, and `/auth/validate`.
- iOS network helpers already depend on bearer access tokens for authenticated HTTP calls.
- The repo does not currently define `convex/auth.config.ts`, and no `/auth/login`, `/auth/refresh`, or `/auth/validate` backend implementation exists in this tree.
- This spike should preserve the current data/role model while changing the auth provider strategy.

The question for KIN-962 is not whether auth works today. It is whether buyer-v2 should center its session model on an external OIDC provider and treat Convex as backend authorization/realtime infrastructure. The answer is yes.

## Supported vs Unsupported Patterns

| Pattern | Web | iOS | Decision |
| --- | --- | --- | --- |
| Clerk as primary OIDC/session provider | Supported | Supported | Use for both web and native |
| Convex Auth library as primary auth product | Unsupported | Unsupported | Do not adopt as primary auth |
| `ConvexProvider` + `useQuery` realtime hydration | Supported | Supported via ConvexClientWithAuth | Keep for reactive data |
| Server-side role checks in Convex queries/mutations | Supported | Required for all shared backend access | Keep and expand |
| Client-side role checks as the only gate | Unsupported | Unsupported | Never rely on client-only gating |
| Custom mobile token auth with `/auth/login`, `/auth/refresh`, `/auth/validate` long-term | Unsupported | Unsupported | Replace with Clerk-based session flow |
| Bearer-token helpers for HTTP APIs | Supported only as transport detail | Supported only as transport detail | Keep only if required by backend adapter |
| Sharing a single role/claim contract across web and iOS | Supported | Supported | Normalize the claims, not the transport |
| Trusting client claims for authz | Unsupported | Unsupported | Backend must verify all privileged paths |
| Automatic execution of license-critical actions after auth | Unsupported | Unsupported | Always require HITL |

## Recommended Web Session Model

Use Clerk as the primary session source for Next.js App Router:

1. Clerk middleware/session cookies authenticate the request on the server.
2. Server Components, SSR, and Route Handlers obtain the Clerk identity first, then authenticate to Convex for data requiring `ctx.auth`.
3. Convex remains the reactive data plane for client components via `ConvexProvider` and the appropriate Clerk auth adapter.
4. Admin shell and protected server routes still gate on server-side role checks in Convex and/or server code.
5. `users.role` in Convex remains the authoritative app role used for all business authorization.

Recommended web session shape:

```ts
type WebSession = {
  user: {
    userId: string;
    name: string;
    email: string;
    role: "buyer" | "broker" | "admin";
  };
  permissions: {
    canAccessInternalConsole: boolean;
    canReadBuyerData: boolean;
    canReadBrokerTools: boolean;
    canMutateAdminOnlyState: boolean;
  };
  snapshot?: {
    openReviewItems: number;
    urgentReviewItems: number;
    latestKpiComputedAt: string | null;
    pendingOverrideCount: number;
  };
};
```

Implementation notes:

- The web session should remain a server-fetched snapshot, not a local token cache.
- Clerk is the source of truth for session presence and identity on the server.
- Convex is the source of truth for app authorization and reactive domain data.
- If Clerk is absent or misconfigured, render a deterministic unavailable surface instead of throwing.
- Admin pages should continue to use the `null` session pattern for access denial.

## Recommended SwiftUI Session Model

Use Clerk iOS as the native session boundary, with Convex client auth bridging into the realtime/data layer:

1. Clerk iOS owns sign-in, sign-out, and refresh behavior.
2. `ConvexClientWithAuth` or `ClerkConvexAuthProvider` bridges the Clerk session into Convex.
3. UI reads only the native session state and auth status, never raw tokens or claims as trust inputs.
4. Convex queries/mutations still enforce authorization through backend role checks.
5. The old custom `/auth/login`, `/auth/refresh`, and `/auth/validate` endpoints are not the long-term mobile architecture.

Recommended SwiftUI session shape:

```swift
enum AuthState: Sendable, Equatable {
    case signedOut
    case restoring
    case signedIn(user: AuthUser)
    case expired
    case authUnavailable
}

struct AuthUser: Sendable, Codable, Equatable {
    let id: String
    let email: String
    let name: String
    let role: UserRole
    let clerkUserId: String
    let sessionVersion: Int?
    let issuedAt: Date?
}
```

Implementation notes:

- Keep `restoring` as the boot state on app launch.
- Keep native auth behind a stable app boundary so the rest of the app does not care whether Clerk or Auth0 is the OIDC provider.
- Treat token refresh as a state transition, not an implicit background side effect.
- If mobile auth ever migrates away from Clerk, do it behind the same `AuthService`-like surface so the rest of the app does not care.

## Role / Claim Contract

The contract must be the same across web, backend, and iOS even if the transport differs.

Canonical role set:

- `buyer`
- `broker`
- `admin`

Canonical claim fields:

- `subject` or `authSubject` for the backend identity join key.
- `userId` for application identity.
- `clerkUserId` or equivalent OIDC subject for identity-provider correlation.
- `email` and `name` for presentation.
- `role` for access control.
- `sessionVersion` for forced invalidation and migration control.
- `issuedAt` and optional `expiresAt` for diagnostics and client refresh behavior.
- `provider` for the OIDC source (`clerk` or `auth0`).

Rules:

- `admin` implies `broker`.
- `broker` never implies `admin`.
- `buyer` never reaches internal-console surfaces.
- Any license-critical mutation must re-check role on the server, even if the client already filtered the UI.
- Claims are authorization hints only until the backend verifies them against Convex/session state.
- Client-side claims never override Convex `users.role`.

## Explicit Edge States

Handle these states intentionally and render deterministic UI/service behavior for each:

- `anonymous`: no session, no identity.
- `restoring`: app or page is hydrating session state.
- `signed_out`: no valid session is available.
- `expired`: known access token expired or invalidated.
- `refresh_failed`: refresh attempted and failed.
- `auth_unavailable`: auth provider or backend auth endpoint unavailable.
- `role_mismatch`: authenticated identity exists, but the role does not permit the current surface.
- `stale_claims`: role/permissions changed since the token/session was issued.
- `unknown_user`: identity exists but no matching user record exists in Convex.
- `revoked_session`: server invalidated the session or rotated the account out.
- `clock_skew`: client expiry math disagrees with server validation.

Required handling:

- Web admin shell returns `null` for denied or unauthorized access.
- iOS returns to `signedOut` or `expired` with an explicit user-facing explanation.
- Backend mutations throw on unauthorized access instead of assuming client state is trustworthy.

## Evidence

Repo evidence:

- `convex/lib/session.ts` already treats the Convex auth context plus `users.role` lookup as the backend authorization boundary.
- `convex/adminShell.ts` already returns `null` for unauthenticated or role-mismatched internal-console requests.
- `src/app/providers.tsx` and `src/lib/convex.tsx` currently mount a generic `ConvexProvider` client-only path rather than a provider-specific auth adapter.
- `ios/BuyerV2/Sources/Services/AuthService.swift` and related services currently depend on a custom token lifecycle and bearer-token HTTP helpers.

External product evidence:

- Convex documents third-party auth as the comprehensive option and explicitly says Convex Auth is beta; it also says Next.js support is under active development / experimental.
- Convex Swift docs support `ConvexClientWithAuth` with Auth0 and Clerk auth providers.
- Clerk documents a native iOS + Convex integration using `ClerkConvexAuthProvider`.

## Unstable / Beta Feature Callouts

Convex Auth is explicitly unstable for this architecture and should remain non-primary.

Risks:

- Convex Auth library as a primary auth product is beta and not the right foundation for this repo.
- Next.js SSR support for Convex Auth is experimental and not the right basis for the App Router architecture.
- Trusting client claims instead of backend role checks would create an authorization hole.
- Keeping a separate custom mobile token auth stack long-term would duplicate session semantics and drift from web.
- Using provider-specific transport details as the app's source of truth would make migration harder later.

Mitigation:

- Use Clerk or Auth0 as the OIDC source of truth, not Convex Auth.
- Centralize role and claim parsing in one type per platform.
- Force server-side validation on every privileged action.
- Add a session version field so future invalidation does not depend only on token expiry.
- Treat auth provider outages as recoverable UI states, not crashes.

## Migration Notes From Current Repo State

What already exists and should be preserved:

- `src/app/providers.tsx` already conditionally mounts `ConvexProvider`; that remains useful for client realtime.
- `src/components/admin/AdminShell.tsx` already uses `useQuery(api.adminShell.getCurrentSession)` and treats `undefined` as loading and `null` as denied.
- `convex/lib/session.ts` already resolves the current user from the Convex auth context and role-gates by user record.
- `convex/adminShell.ts` already enforces broker/admin access and returns a role-filtered session payload.
- `ios/BuyerV2/Sources/Services/AuthService.swift` already exposes the right high-level lifecycle states, but its custom transport is a migration target, not the long-term architecture.

What should not be changed in this spike:

- Do not replace the web session source with Convex Auth.
- Do not move role decisions into client-side SwiftUI or React components.
- Do not keep the custom iOS login/refresh/validate endpoints as the long-term mobile plan.
- Do not collapse web and iOS into one transport abstraction before the shared session contract is pinned down.

Immediate migration implications:

- Web must move from a generic unauthenticated `ConvexReactClient` boot path to a provider-backed auth adapter so protected realtime queries stop depending on ambient client state.
- Server-rendered protected paths must authenticate to Convex with the provider identity instead of falling back to client-only hydration.
- iOS must stop treating locally managed refresh tokens as the long-term contract and instead derive app session state from the provider SDK plus Convex auth bridge.
- Existing services that attach bearer tokens can remain temporarily, but they must read from the new provider-backed session boundary rather than their own credential store.

## Follow-Up Implementation Tasks

These are placeholders for downstream work, not Linear issues:

1. `Add Clerk web integration` - wire Clerk cookies/session into Next.js App Router and make server components authenticate Convex calls with the Clerk-backed identity.
2. `Add Clerk realtime adapter` - replace generic client auth wiring with the Clerk/Convex client adapter so `useQuery` and subscriptions stay reactive.
3. `Add Clerk iOS integration` - replace the custom mobile auth transport with Clerk iOS session management and wire it into Convex client auth.
4. `Normalize app role claims` - define a shared role/claim contract that maps Clerk/Auth0 identity to Convex `users.role` without trusting the client.
5. `Harden privileged mutations` - audit all broker/admin mutations to ensure backend authorization checks use Convex session state and `users.role`.
6. `Add fallback OIDC path` - document and test Auth0 as the alternate provider with the same claims and backend authorization contract.
7. `Remove legacy mobile auth endpoints` - retire `/auth/login`, `/auth/refresh`, and `/auth/validate` after the Clerk iOS path is validated.
8. `Add revocation and downgrade tests` - cover session invalidation, provider outage, and role downgrade on web and iOS.

## Bottom Line

Convex is the right backend authorization/realtime layer, but not the primary auth product.

For KIN-962, the implementation-ready decision is:

- Web/admin: Clerk canonical, Convex authoritative for backend authorization and realtime.
- iOS: Clerk canonical, Convex client auth adapter for reactive data.
- Fallback: Auth0 acceptable if Clerk is blocked, with the same OIDC contract.
- Shared contract: roles and claims are normalized, server-verified, and never trusted from the client alone.
