# buyer-v2 Convex Backend

This directory owns the Convex data plane for buyer-v2: schema, generated
types, queries, mutations, actions, auth/session helpers, and file-access
guards.

## Structure

- `schema.ts`: canonical table definitions and indexes.
- `auth.config.ts`: third-party JWT/OIDC providers accepted by Convex.
- `_generated/`: checked-in Convex codegen output used by the web and backend.
- `lib/`: backend-only helpers shared across queries/mutations/actions.
- `engines/`: internal AI actions.
- `security/`: file access, deletion/export, and other privileged paths.
- top-level `*.ts`: domain modules exported through the Convex file router.

## Naming conventions

- Public API modules use `query`, `mutation`, and `action`.
- Internal-only modules use `internalQuery`, `internalMutation`, and `internalAction`.
- Shared enums/state machines live in `lib/validators.ts`.
- Session lookups and role/permission helpers live in `lib/session.ts`.
- File access goes through `security/fileAccess.ts` and references `_storage` IDs.

## Generated types

Run codegen after any schema or function signature change:

```bash
pnpm codegen:backend
```

This refreshes the checked-in files under `convex/_generated/`.

## Auth/session baseline

- Primary OIDC provider: Clerk.
- Fallback OIDC provider: Auth0.
- Convex joins authenticated identities onto `users` through
  `authTokenIdentifier` first, then falls back to issuer/subject for legacy rows.
- Business authorization still comes from `users.role`, never from the client.

## Runtime coverage

This backend is scaffolded for:

- queries and subscriptions
- mutations
- Node/V8 actions
- file storage references via `_storage`
- provider-backed auth without changing the data model
