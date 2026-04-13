# `@buyer-v2/shared`

Canonical shared package for repository-wide contracts, config metadata, and
small reusable utilities.

## Conventions

- Put cross-surface TypeScript contracts in `src/contracts.ts`.
- Put launch analytics schema/validation helpers in `src/launch-events.ts`.
- Put workspace metadata and environment specs in `src/config.ts`.
- Keep `src/utils.ts` limited to tiny dependency-free helpers that can be
  consumed by both the web app and Convex without pulling UI code across the
  boundary.
- Do not import from `src/` or `convex/` into this package.
- Swift and Python surfaces consume the contracts through documented network or
  serialized boundaries; they do not import this package directly.
