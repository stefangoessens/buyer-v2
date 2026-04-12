# buyer-v2

AI-native Florida buyer brokerage platform. Next.js + Convex + Railway Python workers + iOS SwiftUI.

> **This repo is built by an autonomous Claude Code loop.** See `CLAUDE.md`, `AGENTS.md`, and `workflow.md`.

## Quick Start

```bash
pnpm install
npx convex dev          # local Convex backend (in one terminal)
pnpm dev                # Next.js dev server (in another terminal)
```

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
