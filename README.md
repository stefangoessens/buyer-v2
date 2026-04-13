# buyer-v2

AI-native Florida buyer brokerage platform. Next.js + Convex + Railway Python workers + iOS SwiftUI.

> **This repo is built by an autonomous Claude Code loop.** See `CLAUDE.md`, `AGENTS.md`, and `workflow.md`.

## Quick Start

```bash
pnpm install
pnpm bootstrap
pnpm dev:backend        # local Convex backend (terminal 1)
pnpm dev:web            # Next.js App Router app (terminal 2)
```

## Web Runtime Baseline

- Public browser-safe config lives in `src/lib/env.ts` and is sourced from `webPublicEnvSpec`.
- Server-only secrets live in `src/lib/env.server.ts` and are sourced from `webServerEnvSpec`.
- The App Router baseline is split into `(marketing)`, `(dealroom)`, `(app)`, and `(admin)` route groups so new feature modules can land without moving existing surfaces.
- `NEXT_PUBLIC_APP_URL` is the canonical web origin used by metadata, sitemap, and robots generation.

## Repository Layout

```text
.
├── .                         # @buyer-v2/web (Next.js App Router app)
├── convex/                   # @buyer-v2/convex workspace
├── ios/BuyerV2/              # Swift Package / SwiftUI app workspace
├── packages/shared/          # contracts, config metadata, shared TS utilities
├── python-workers/           # reusable Python worker library
└── services/extraction/      # deployable FastAPI extraction worker
```

## Local Commands

```bash
# web + backend
pnpm dev:web
pnpm dev:backend
pnpm build:web
pnpm build:backend

# shared package
pnpm typecheck:shared

# iOS
pnpm ios:open
pnpm build:ios
pnpm ios:test

# python workers
pnpm workers:lib:test
pnpm workers:service:dev
pnpm workers:service:test
pnpm workers:test
```

## Testing

- `pnpm test` runs the Vitest suite for web logic, contracts, Convex integration harnesses, and AI eval snapshots.
- `pnpm test:e2e` runs the Playwright browser smoke checks against a local dev server with test env defaults.
- `pnpm workers:test` runs the Python worker and extraction-service pytest suites with coverage thresholds.
- `pnpm ios:test` runs the Swift package tests.
- `pnpm test:eval` smoke-tests the pricing eval harness against the seeded fixture set.
- Strategy, thresholds, fixture locations, and CI gates live in [docs/testing-strategy.md](./docs/testing-strategy.md).

## Dependency Boundaries

- `@buyer-v2/web` may import from `@buyer-v2/shared` and its local `src/`.
- `convex/` may import from `@buyer-v2/shared`, but never from web-only `src/`.
- `ios/BuyerV2` consumes typed backend boundaries over network APIs; it does not
  import JavaScript or Python code directly.
- `python-workers` owns reusable Python worker primitives.
- `services/extraction` is the deployable Python worker service wrapper.

## Read Order

1. [`CLAUDE.md`](./CLAUDE.md) — overview, quick start, key rules
2. [`AGENTS.md`](./AGENTS.md) — working rules, Linear operating model, design quality bar
3. [`workflow.md`](./workflow.md) — full autonomous loop, agent team patterns, Codex review fetch
4. `DESIGN.md` — design language, tokens, references *(written by KIN-742)*
5. `convex-rules.md` — Convex backend coding standards *(written by KIN-741)*

## Stack

- **Web**: Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui
- **Backend**: Convex (queries, mutations, actions, schema, file storage, auth)
- **Workers**: Python 3.13 on Railway (Browser Use, parsers, ML)
- **AI**: AI SDK v6 + Anthropic + OpenAI, prompt registry in Convex
- **iOS**: SwiftUI, Swift 6, iOS 17+
- **Hosting**: Railway (Next.js + Python services, per-PR preview environments)
- **CI**: GitHub Actions
- **Tracking**: Linear (project `buyer-v2`, team `Kindservices` / KIN)
