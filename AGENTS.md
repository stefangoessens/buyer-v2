# buyer-v2 Agent Guide

This repository is the implementation target for **buyer-v2** — the second-generation AI-native Florida buyer brokerage platform. Next.js + Convex + Railway Python workers + iOS SwiftUI app.

## Source of Truth

Read these files in order before changing code:

1. `CLAUDE.md` — project overview, quick start, build commands
2. `AGENTS.md` — this file: working rules, Linear operating model, stop conditions
3. `workflow.md` — full autonomous loop, agent team patterns, design review loop
4. `DESIGN.md` — design language, tokens, component patterns, reference screenshots
5. `convex-rules.md` — Convex backend coding standards
6. Linear issue descriptions — acceptance criteria, scope, screenshots (canon)

## Working Rules

- Build in `/Users/stefang/Desktop/buyer-v2`.
- **Every issue MUST use an Agent Team** — TeamCreate → TaskCreate → Spawn teammates → Work → TeamDelete. No exceptions. The lead orchestrates but never writes code directly on a card. See https://code.claude.com/docs/en/agent-teams
- **Claude Code subagents write ALL code** — no Codex MCP for coding. Subagents are spawned via the Agent tool with distinct file ownership.
- **Code review is owned by the `@codex` GitHub integration** — it auto-runs on every PR. Claude's job is to fetch the review, implement fixes, reply to each comment, and re-trigger until clean.
- Each subagent owns a **distinct, exclusive** set of files. No overlap between teammates.
- Use the Convex client for all data access — never bypass with raw DB.
- Linear issue description is canon — implement what it describes, no scope creep.
- One Linear issue per branch. Branch prefix: `buyer/`.
- Open a PR for each issue once validation is green; merge only after Codex review is addressed.
- Edit one workpad comment per Linear issue — never duplicate.

## Linear Operating Model

- **Project**: `buyer-v2` (id: `8269638f-19cc-47a6-9d30-beea34be5691`)
- **Team**: `Kindservices` (key: `KIN`)
- **Active states**: `Todo`, `In Progress`, `Rework`, `Merging`
- **Terminal states**: `Done`, `Canceled`, `Duplicate`
- **Never touch**: `Backlog` (doc-only / ADR / strategy cards — not coding work)
- **`blockedBy` relations**: actively maintained. Always query `includeRelations: true` and skip blocked issues.
- **Processing order**: `Merging` > `Rework` > `In Progress` > `Todo`
- **Within a bucket**: Urgent > High > Normal > Low
- **Prefer children over umbrellas**: umbrella issues are scoping containers. Pick their unblocked children for actual work.

### Milestone Order

1. **P0 — Strategy & Compliance Foundations** — product, architecture, vendor, compliance, domain decisions
2. **P1 — Design System & Platform Foundation** — design language, components, repo scaffolding, Convex, Railway, CI/CD, security baseline
3. **P2 — Public Site & Acquisition** — marketing site, calculators, trust surfaces, SEO, intake instrumentation
4. **P3 — Property Ingestion, Deal Room & AI** — URL/address intake, extraction, normalized property graph, deal room UI, AI engines
5. **P4 — Brokerage Workflow, Offers & Closing** — buyer agreements, tour ops, agents, offers, negotiation, contract ingestion, closing, rebate visibility
6. **P5 — iOS, Analytics & Launch Readiness** — mobile app, push, deep links, share import, analytics taxonomy, QA/UAT, launch ops, SaaS boundaries

**Rule**: Don't start a later milestone while the current has unfinished Urgent/High issues.

## Design Quality Standard

**Design is the #1 priority of buyer-v2.** This is the one place where speed bows to quality. We are autonomous on coding and code review (Codex caps at 2 rounds), but design quality is non-negotiable — **never ship half-assed UI**.

- The marketing site must feel like Hosman, with component cues from PayFit and RealAdvisor.
- The deal room must feel premium and trustworthy.
- The dashboard must feel as polished as a top-tier SaaS product.
- Reference screenshots and tokens: `DESIGN.md` + `/design/refs/`
- Brand palette and typography defined in `DESIGN.md` (canonical)
- **2-3 design iterations per UI component is the floor, not the ceiling.** Run a 4th round if the screen still doesn't match the reference.

### `/clone-website` first, polish second

For any card whose acceptance criteria reference an existing site (Hosman, PayFit, RealAdvisor, or any other inspiration), run `/clone-website <url>` **before** spawning the implementation team. The skill extracts assets, CSS, and structure section-by-section and dispatches parallel builder agents in worktrees. Then the design review loop runs on the clone — minimum 2-3 polish rounds to integrate brand tokens, copy, and buyer-v2 specifics.

This is the fastest path to high-fidelity design without compromising quality.

## Design Feedback Loop (per UI card)

After teammates implement a UI surface:

1. **Build**: `pnpm build && pnpm typecheck`
2. **Run**: `pnpm dev` (background)
3. **Screenshot**: `gstack browse → /<route> → screenshot` at mobile (375), tablet (768), desktop (1280)
4. **Compare**: Read screenshots + reference images from `/design/refs/`
5. **Feedback**: Detailed, specific notes via `SendMessage` to the owning teammate (or fix directly for trivial polish)
6. **Iterate**: Repeat until match
7. **Minimum 2 rounds, ideally 3, more if still gappy.** Don't bail early. The design loop is the *one* place we don't optimize for speed.

## Domain Context

- **Florida-first**: schemas, agent network, compliance flows assume FL today; multi-state seams documented but not built
- **URL as intent**: Zillow / Redfin / Realtor.com paste is the primary entry signal
- **Property record is system of record**: normalized, deterministic, AI engines read from it
- **AI engine outputs always include**: confidence, citations, review state — no naked AI outputs reach the buyer
- **License-critical actions are HITL**: buyer agreements, compensation disclosures, calls, contract terms — never auto-execute
- **PII discipline**: never put PII in Sentry, PostHog, logs, or AI prompts that hit external providers without sanitization

## Codex GitHub Review Loop

After every PR push:

1. Wait ~1-5 min for `@codex` to post its review (auto-triggered, or `gh pr comment <n> --body "@codex review"` if needed).
2. Fetch all Codex artifacts:
   ```bash
   gh pr view <n> --json reviews,comments
   gh api repos/<owner>/<repo>/pulls/<n>/comments
   ```
3. Categorize each finding: **MUST FIX** / **SHOULD FIX** / **NIT** / **OUT OF SCOPE**.
4. Implement MUST FIX + SHOULD FIX. Skip NIT if cheap to ignore. Skip OOS with a reply explaining why.
5. **Reply to every Codex comment** — fix or skip-with-rationale. No silent dismissals.
6. Push fixes; Codex re-reviews automatically.
7. **MAX 2 ROUNDS — then squash-merge regardless.**

After 2 rounds, anything Codex still flags goes into a new Backlog issue (`KIN-XXX — codex-followup-from-PR-<n>`). The loop carries on. We do not block on review polish.

## Autonomous Policy

**The loop is fully autonomous. There is no human in the loop.** Default behavior on any obstacle is **log and carry on**, not "stop and ask".

When you encounter ambiguity:

- **Ambiguous product intent** → make the most defensible decision, log the choice in the workpad, carry on. If you're really unsure, ship the simplest interpretation and open a Backlog issue for refinement.
- **Ambiguous design spec** → use closest reference in `/design/refs/` or DESIGN.md, polish in the design loop, carry on.
- **Missing credentials** → log the gap, mark the card as `Rework` with a comment, pick the next card. Don't block.
- **External vendor outage** → retry 3x with backoff, then mark `Rework` with a note, pick next card.
- **Codex still flagging things after 2 review rounds** → merge anyway, leftovers → new Backlog issue. (See Codex GitHub Review Loop above.)
- **Design loop hitting 4+ rounds** → keep going. Design quality > round count. This is the *one* place we don't carry on early.

## Hard Stops (the only things that pause the loop)

These are the only conditions where the loop must pause and surface clearly to the operator instead of carrying on:

- **Force-push to `main`** would be required to recover state.
- **Irreversible Convex schema migration** that drops or destructively transforms existing data.
- **Deleting prod resources** — Railway service, Convex deployment, GitHub branch protection, env var stores, secrets.
- **Secrets committed to git** — any API key, token, or credential pushed to a branch (rotate + force-fix immediately, then surface).
- **License-critical auto-execution path** — production code that would auto-send a buyer agreement, post compensation, place a call, or sign a disclosure without HITL gating. Treat as a `CRITICAL` bug, halt that card.

For everything else: **carry on**.
