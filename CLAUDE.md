# buyer-v2

AI-native Florida buyer brokerage platform. Next.js 16 + Convex + Railway Python workers + iOS (SwiftUI). Hosman-inspired marketing site, paste-a-link property ingestion, semi-public deal room, buyer dashboard, broker/admin console, iOS app for transaction tracking.

## Quick Start

```bash
# Start the autonomous workflow — fully unattended
/loop 5m "Execute the autonomous development workflow defined in workflow.md. FULLY AUTONOMOUS, no human in the loop. Poll Linear for buyer-v2 (Kindservices team). Pick highest-priority Todo / In Progress / Merging / Rework, respect milestone order P0 → P5. For cards based on a reference site, run /clone-website FIRST. Create Agent Team, spawn 2-4 Claude subagents with distinct file ownership, run design review loop 2-3 rounds minimum (more if not matching reference — design is non-negotiable), validate (pnpm build + typecheck + test), open PR, fetch @codex GitHub review, implement MUST FIX findings, push. MAX 2 codex rounds — then merge regardless and log leftovers as Backlog. Squash-merge, mark Done. Pick next. Never touch Backlog. Codex is only the PR reviewer — Claude Code writes all code directly."
```

## Read Order

1. `CLAUDE.md` — this file
2. `AGENTS.md` — working rules, Linear operating model, stop conditions
3. `workflow.md` — full autonomous loop, agent team patterns, design review loop
4. `DESIGN.md` — design language, tokens, component patterns, references
5. `convex-rules.md` — Convex backend coding standards
6. Linear issue descriptions — acceptance criteria, scope, references (canon)

## Key Rules

- Linear project: **buyer-v2** (team: Kindservices, key: KIN)
- Branch prefix: `buyer/`
- **Fully autonomous** — no human in the loop, log + carry on except for hard destructive guardrails
- **Claude Code writes ALL code directly** — no Codex MCP for coding
- Subagents spawned via the Agent tool with distinct file ownership
- **Code review = `@codex` GitHub integration** — auto-runs on every PR; Claude fetches review, implements fixes, **max 2 rounds then merge regardless**
- **Design quality is the #1 priority** — 2-3 iterations per UI card, never ship half-assed (this is the one place we don't carry on early)
- **Use `/clone-website`** for any card based on a reference site (Hosman, PayFit, RealAdvisor) — clone first, polish in the design loop
- One card at a time, one branch per issue
- Linear issue spec is canon
- Never touch Backlog issues
- Milestone order: P0 (Strategy) → P1 (Platform) → P2 (Public Site) → P3 (Deal Room/AI) → P4 (Brokerage/Offers) → P5 (iOS/Launch)

## Build Commands

```bash
pnpm install
pnpm dev          # Next.js dev server
pnpm build        # production build
pnpm typecheck    # TS check
pnpm test         # Vitest
pnpm test:e2e     # Playwright

npx convex dev    # Convex local dev
npx convex deploy # Convex deploy
```

## Stack

- **Web**: Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, AI SDK v6
- **Backend**: Convex (schema, queries, mutations, actions, file storage, auth)
- **Workers**: Python on Railway (parsers, ML). Browser automation runs on **Browser Use Cloud** (hosted, residential proxies + IP rotation) via the thin wrapper at `python-workers/lib/browser_use_client.py` — canonical path for all new browser-agent work; self-hosted Railway Browser Use is being decommissioned.
- **AI**: AI SDK v6 + direct Anthropic + OpenAI providers, prompt registry in Convex
- **iOS**: SwiftUI, Swift 6, iOS 17+, Convex Swift client, `@Observable`
- **Analytics**: PostHog (events), Sentry (errors)
- **Hosting**: **Railway** for all services (Next.js web, Python workers). Per-PR preview environments enabled.
- **CI/CD**: GitHub Actions for typecheck/lint/test/build; Railway GitHub integration deploys main + PR environments

## Domain

- **Florida-first** buyer brokerage — multi-state-ready architecture, FL-only data today
- **AI engines**: pricing panel, comps, leverage, offer, doc parser, copilot, case synthesis
- **Human-in-the-loop** for all license-critical actions (agreements, compensation, calls, disclosures)
- **Auditable AI**: every engine output carries confidence, citations, and review state
- **URL as intent signal**: Zillow / Redfin / Realtor.com paste → normalized property record
