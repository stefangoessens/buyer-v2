---
tracker:
  kind: linear
  team: Kindservices
  team_key: KIN
  project: buyer-v2
  project_id: 8269638f-19cc-47a6-9d30-beea34be5691
  active_states:
    - Todo
    - In Progress
    - Merging
    - Rework
  terminal_states:
    - Done
    - Canceled
    - Duplicate
  never_touch_states:
    - Backlog
polling:
  interval_ms: 300000
workspace:
  root: /Users/stefang/Desktop/buyer-v2
environment:
  setup: |
    pnpm install
    pnpm dev          # Next.js dev server
    npx convex dev    # Convex dev (run in separate terminal)
mcps:
  required:
    - linear
  optional:
    - github
    - railway
    - supabase
agent:
  model: claude-opus-4-6
  effort: max
  max_concurrent: 1
  mode: autonomous
  context_files:
    - CLAUDE.md
    - AGENTS.md
    - workflow.md
    - DESIGN.md
    - convex-rules.md
---

# buyer-v2 — Autonomous Development Workflow

This workflow drives continuous development of **buyer-v2**, the AI-native Florida buyer brokerage platform, using Claude Code with Linear as the task tracker. **Claude Code writes ALL code directly** — no Codex MCP, no external coder. Claude orchestrates teams of Claude subagents (via the Agent tool) and runs a visual design feedback loop.

## What buyer-v2 is

Second-generation AI-native buyer brokerage for Florida homebuyers:

- **Public marketing site** — Hosman-inspired hero, paste-a-link intake, trust surfaces, calculators
- **Property ingestion** — Zillow / Redfin / Realtor.com URL → normalized property record
- **Semi-public deal room** — anonymous teaser, registration-gated premium analysis
- **Buyer dashboard + broker/admin console** — authenticated app
- **iOS app** — SwiftUI, push notifications, share-sheet import, transaction tracking
- **Convex backend** — schema, real-time subscriptions, file storage, auth
- **Railway-hosted Python workers** — heavy parsing, Browser Use automation, ML
- **AI engines** — pricing, comps, leverage, offer, doc parser, copilot, case synthesis

Core principles: human-in-the-loop for license-critical actions, auditable AI with citations and confidence, Florida-first with multi-state-ready architecture, URL as intent signal, normalized property record as system of record.

## Role Split

| Role | Who | Responsibilities |
|---|---|---|
| **Lead / Orchestrator** | Claude Code (this session) | Poll Linear, pick cards, create Agent Teams, run design review loop, validate builds, create PRs, merge |
| **Coder teammates** | Claude Code subagents (Agent tool, `claude-opus-4-6`) | Write code in their owned files: Next.js, Convex, Python workers, SwiftUI |
| **Design reviewer** | Claude Code (lead) + `gstack-design-review` skill | Visual diff vs reference designs, fix UX directly when faster |
| **Code reviewer** | **`@codex` GitHub integration** (auto-runs on every PR) | Independent post-PR diff review — Claude fetches the review and implements fixes |

**Why Claude does all coding**: Codex MCP is gone from the coding path. We get tighter context control by spawning fresh Claude subagents per role (Agent tool), each with a precise prompt and owned file set. Subagents protect the lead's context window while keeping all work in one model family.

**Where Codex still lives**: Code review only. The Codex GitHub integration auto-comments on every PR with `@codex review`. Claude's job is to **fetch that review, parse findings, implement fixes, push, and re-trigger** until the review is clean.

**Lead can intervene directly** for design polish (spacing, colors, copy, layout) — pixel parity is the goal, whatever path is fastest wins.

## Models & Effort

| Agent | Model | Effort |
|---|---|---|
| **Lead (this session)** | `claude-opus-4-6` (1M context) | `/effort max` |
| **Subagent teammates** | `claude-opus-4-6` | `/effort max` |
| **Code reviewer** | `@codex` (GitHub integration) | runs automatically on PR open + push |

When spawning a subagent via the Agent tool, pass a detailed prompt including: role, owned file paths, Linear issue ID + acceptance criteria, design references, test commands. The subagent has no memory of this conversation — brief it like a smart colleague who just walked into the room.

## Architecture

```
+--------------------------------------------------------------+
|  Claude Code terminal (Lead / Orchestrator)                   |
|                                                               |
|  /loop 5m (runs indefinitely)                                 |
|    +- 0. PRE-FLIGHT: git sync + build check                  |
|    +- 1. Poll Linear: Todo / In Progress / Merging / Rework  |
|    +- 2. Pick highest-priority unblocked issue                |
|    +- 3. CREATE AGENT TEAM for this issue                     |
|    |     +- TeamCreate (one team per card)                    |
|    |     +- TaskCreate (5-6 tasks per teammate)               |
|    |     +- Spawn 2-4 specialized Claude subagents            |
|    +- 4. TEAMMATES WORK (each is a Claude subagent)           |
|    |     +- Subagent edits its owned files                    |
|    |     +- Lead reviews via TaskGet, iterates via SendMsg    |
|    |     +- Cross-teammate sync via SendMessage               |
|    +- 5. DESIGN REVIEW LOOP (lead runs this):                 |
|    |     +- Build (pnpm build / xcodebuild)                   |
|    |     +- Run dev server, navigate via gstack browse        |
|    |     +- Screenshot, compare vs DESIGN.md references       |
|    |     +- Feedback -> teammates iterate (2-3+ rounds, quality bar) |
|    |     +- Lead may fix UX directly for pixel parity         |
|    +- 6. Shut down teammates -> TeamDelete                    |
|    +- 7. Final validation: build + typecheck + tests          |
|    +- 8. Create PR -> move to Merging                         |
|    +- 9. Wait for @codex GitHub review (auto-triggered)       |
|    +- 10. Fetch review -> implement fixes -> push -> repeat   |
|    +- 11. When review clean -> squash-merge -> Done           |
+--------------------------------------------------------------+
```

---

## Execution Flow

### On each /loop tick

#### Phase 0: Pre-flight

```bash
cd /Users/stefang/Desktop/buyer-v2
git checkout main && git pull --rebase origin main
```

**Workspace recovery** — clean up debris from any crashed previous tick:

```bash
# kill any orphan dev servers
lsof -ti:3000,3001,4000 | xargs kill -9 2>/dev/null || true

# discard any uncommitted local debris (we always work on a clean main)
git stash push -u -m "preflight-stash-$(date +%s)" || true

# delete merged local branches
git branch --merged main | grep -v '^\*\|^  main$' | xargs -r git branch -d

# orphan Agent Teams from a previous crashed tick — list and delete any
# team that doesn't correspond to an open Linear card
```

**Cold-start detection** — is there actually an app to build?

```bash
# Cold start = no real Next.js scaffold yet (root package.json scripts are placeholders)
if grep -q "cold-start: no app scaffolded yet" package.json; then
  echo "[preflight] cold start detected — skipping build, picking platform-foundation card"
  COLD_START=1
fi
```

If `COLD_START=1`:
- Skip the build/typecheck step.
- In Phase 1, **force-pick** the platform-foundation card (`KIN-741 — buyer-v2 / Core Platform Foundation`). Move it to `Todo` from `Backlog` if needed (one-time exception to the no-touch-Backlog rule for cold start only).
- The first card must scaffold real `apps/web/`, real `package.json` scripts, install Convex client, install shadcn/ui, and pass `pnpm build` for real.

Otherwise (warm start) — build check:

```bash
pnpm install --frozen-lockfile
pnpm build 2>&1 | tail -30
pnpm typecheck 2>&1 | tail -30
pnpm test --run 2>&1 | tail -30
```

If the build is broken on `main`: the loop's first task is a hotfix card before any new work. Create a Linear hotfix issue or look for an existing one tagged `hotfix`.

**Pre-flight env sync**:

```bash
railway login --browserless          # ensure Railway CLI is authenticated
railway link                         # confirm linked to buyer-v2 project
railway variables > /tmp/railway-env.txt 2>&1   # snapshot for diff
```

If `railway variables` shows missing required vars (compare against `.env.example`), log them in the workpad — the loop will mark blocked cards as `Rework` rather than fail.

#### Phase 1: Card selection

1. Query Linear for `buyer-v2` issues in `Todo / In Progress / Merging / Rework`.
2. Priority: **Merging > Rework > In Progress > Todo**.
3. Within each bucket: Urgent > High > Normal > Low.
4. **Respect `blockedBy` relations** — skip any issue that has unresolved blockers (query with `includeRelations: true`). Pick the highest-priority *unblocked* issue.
5. Respect milestone ordering (see below). Don't start later milestones while earlier ones have unfinished Urgent/High issues.
6. **Prefer children over umbrellas** — umbrella issues (no `parentId`) are scoping containers. Pick their children for actual work. Only touch an umbrella if all its children are Done.
7. **Max 1 card in progress at a time.** Finish current (merge → Done) before picking next. Always TeamDelete before new TeamCreate.
8. **Never touch Backlog issues** — Backlog contains doc-only/ADR/strategy cards. The loop only picks coding cards in `Todo`. All strategy decisions are already embedded in the coding cards' acceptance criteria.
9. **Read Linear attachments** — cards like KIN-771 and KIN-770 have reference URL attachments (hosman.co, payfit.com, realadvisor.ch). Read them for `/clone-website` input and design review references.

#### Phase 2: Implementation via Agent Teams

> **MANDATORY**: Every single Linear issue MUST be implemented by an Agent Team. No exceptions. The lead NEVER writes code directly on a card — it always creates a team, spawns specialized teammates, and orchestrates. This is a hard requirement, not a suggestion. Reference: https://code.claude.com/docs/en/agent-teams

The lifecycle for every card is: **TeamCreate → TaskCreate → Spawn teammates → Teammates work → Lead reviews → TeamDelete**. The lead's job is orchestration (pick card, analyze scope, design team, assign files, run design review, validate, PR, fetch codex review). The teammates' job is writing code.

Every Linear issue is implemented by an **Agent Team**. The lead creates a team, spawns 2-4 specialized subagents via the Agent tool, and coordinates through TaskCreate / SendMessage / TaskUpdate.

##### Step 1: Start new issue (Todo → In Progress)

1. Move Linear status to `In Progress`.
2. Create branch: `git checkout -b buyer/<kin-id>-<short-slug> origin/main`
3. Post workpad comment on Linear issue (template below).

##### Step 2: Create the Agent Team

> **Reference**: https://code.claude.com/docs/en/agent-teams — full API for TeamCreate, TaskCreate, SendMessage, TeamDelete.

1. **Analyze the issue** — what surfaces does it touch? (Next.js page, Convex function, Python worker, AI engine, iOS, schema, tests)
2. **Design the team** — choose 2-4 teammates with **distinct file ownership**. Distinct ownership prevents merge conflicts.
3. **Create the team**:
   ```
   TeamCreate(team_name: "<kin-id>-<slug>", description: "<issue title>")
   ```
4. **Create tasks** — 5-6 TaskCreate per teammate, with `addBlockedBy` for ordering.
5. **Spawn teammates** — each subagent (Agent tool, `subagent_type: general-purpose`) gets a prompt containing:
   - Role + owned file paths (exclusive)
   - Linear issue ID, full description, acceptance criteria
   - Design reference paths from DESIGN.md
   - Stack-specific rules (Convex schema patterns, Next.js App Router, shadcn/ui, AI SDK v6 if AI work)
   - Test/build commands they must run before reporting done
   - Instruction to call `TaskUpdate` to mark progress and `SendMessage` for cross-team sync

**Team sizing by card type:**

| Card type | Teammates | Example roles |
|---|---|---|
| Schema / Config | 2 | Convex schema specialist, TypeScript types + validators |
| Single component | 2 | shadcn/ui builder, Storybook + a11y test writer |
| Public-site page | 3 | Page composition, SEO + metadata, analytics instrumentation |
| Deal room feature | 4 | Convex queries/mutations, React UI, AI engine integration, tests |
| AI engine | 3 | Engine logic + prompt registry, eval fixtures, Convex action wiring |
| Python worker | 2 | Worker code + tests, Railway deploy + observability |
| iOS feature | 3 | SwiftUI views, Convex Swift client integration, push/deep-link wiring |

##### Step 3: Teammates implement

Each subagent works inside its owned files only. Loop:

1. Read Linear issue + design references + existing project context.
2. Edit code via Edit/Write tools — **never** outside owned files.
3. Run scoped validation (typecheck, unit test, a single Playwright spec).
4. Mark task complete via `TaskUpdate(status: completed)`.
5. Claim next task via `TaskList` → `TaskUpdate(owner: self)`.
6. Notify other teammates of API contracts via `SendMessage`.

**File ownership example — KIN-771 (public homepage)**

```
Teammate "page-builder":
  - apps/web/app/(marketing)/page.tsx
  - apps/web/app/(marketing)/layout.tsx
  - apps/web/components/marketing/Hero.tsx
  - apps/web/components/marketing/PasteLinkInput.tsx

Teammate "trust-surfaces":
  - apps/web/components/marketing/TrustBar.tsx
  - apps/web/components/marketing/SocialProof.tsx
  - apps/web/components/marketing/CalculatorTeaser.tsx

Teammate "intake-funnel":
  - apps/web/lib/intake/parseLink.ts
  - convex/intake.ts
  - apps/web/components/intake/FunnelEvents.ts (PostHog)
```

##### Step 4: Lead runs Design Review Loop

> **Design is the #1 quality bar of buyer-v2.** This is the one place where speed bows to quality. Codex review can carry on after 2 rounds — design review cannot. We do not ship half-assed UIs.

After teammates report tasks complete, the lead integrates and runs the visual review.

**When to use `/clone-website`**: For any card whose acceptance criteria reference an existing site (Hosman, PayFit, RealAdvisor, etc.), the lead should kick off `/clone-website <url>` *before* spawning the implementation team. The skill extracts assets, CSS, and structure section-by-section, dispatches parallel builder agents in worktrees, and produces a high-fidelity clone as the starting point. Then the design review loop runs on top of that clone — minimum 2-3 polish rounds to integrate brand tokens, copy, and buyer-v2 specifics.

```
┌─────────────────────────────────────────────────┐
│  DESIGN REVIEW LOOP                              │
│                                                   │
│  1. BUILD                                         │
│     pnpm build && pnpm typecheck                  │
│                                                   │
│  2. RUN                                           │
│     pnpm dev (background) on port 3000            │
│                                                   │
│  3. SCREENSHOT (web)                              │
│     gstack browse → /<route> → screenshot         │
│     /tmp/buyer-review-<route>-round-N.png         │
│                                                   │
│     OR (iOS)                                      │
│     xcrun simctl io booted screenshot ...         │
│                                                   │
│  4. COMPARE                                       │
│     Read screenshot                                │
│     Read reference: DESIGN.md + /design/refs/     │
│     Compare: layout, spacing, color, type,        │
│     hierarchy, polish, responsive (mobile/desk)    │
│                                                   │
│  5. FEEDBACK (detailed, specific)                 │
│     "Hero CTA padding is 16px, should be 24px.    │
│      H1 tracking is default, should be -0.02em.   │
│      The PasteLinkInput border is gray-200,        │
│      DESIGN.md says brand-50 with 1.5px stroke.    │
│      See /design/refs/hosman-hero-1.png for the    │
│      correct visual weight."                       │
│                                                   │
│  6. ITERATE                                       │
│     SendMessage to owning teammate with feedback. │
│     Or, for trivial polish, edit directly.        │
│     Go to step 1.                                  │
│                                                   │
│  RUN AT LEAST 2 ROUNDS, IDEALLY 3.                │
│  Design quality is non-negotiable — never        │
│  ship a half-assed UI. If round 3 still has      │
│  visible gaps vs reference, run a 4th round.     │
│  Only carry on once the screen genuinely         │
│  matches the reference caliber.                  │
└─────────────────────────────────────────────────┘
```

**What to check each round** (web):

| Dimension | What to look for |
|---|---|
| **Layout** | Spacing tokens (Tailwind scale), container width, gap consistency |
| **Typography** | Font family, size, weight, leading, tracking — match DESIGN.md |
| **Color** | Brand tokens (CSS variables / Tailwind theme), no raw hex |
| **Hierarchy** | Primary CTAs prominent, secondary subdued, scannable |
| **Components** | shadcn/ui composition, no inline styles, no one-off classes |
| **Responsive** | Mobile (375), tablet (768), desktop (1280) all clean |
| **Motion** | Framer/CSS transitions smooth, respects `prefers-reduced-motion` |
| **A11y** | Focus rings, ARIA labels, color contrast AA, keyboard nav |
| **Reference match** | Side-by-side with `/design/refs/` — does it feel like the same caliber? |

##### Step 5: Team cleanup + final validation

1. **Wind down teammates** — `SendMessage` requesting graceful shutdown, wait for confirmation.
2. **TeamDelete** the team (only after all teammates confirmed shutdown).
3. **Build passes**: `pnpm build`
4. **Typecheck passes**: `pnpm typecheck`
5. **Tests pass**: `pnpm test` (Vitest) and any Playwright e2e relevant to the changed surface
6. **All acceptance criteria** from Linear issue checked off in workpad
7. **Design review complete** (minimum 2 rounds, ideally 3, more if reference still doesn't match)

##### Step 6: PR + Codex Review (via GitHub)

> **Code review is owned by the `@codex` GitHub integration.** It auto-runs on every PR open and every push to the PR branch. Claude's job is to **fetch the review, implement the fixes, and re-push** until the review is clean.

1. **Commit** (conventional style, see below), **push** branch, **open PR**:

   ```bash
   gh pr create \
     --base main \
     --head buyer/<kin-id>-<slug> \
     --title "<type>(<scope>): <short title> (KIN-<id>)" \
     --body "$(cat <<'EOF'
   ## Summary
   <1-3 bullets describing what shipped>

   ## Linear
   Refs: KIN-<id>
   <linear-issue-url>

   ## Test plan
   - [x] pnpm build
   - [x] pnpm typecheck
   - [x] pnpm test
   - [x] Design review loop (N rounds)
   - [ ] @codex review pass

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

2. **Move Linear issue to `Merging`**.

3. **Trigger / wait for `@codex`**. The Codex GitHub app should auto-review on PR open. If your repo requires an explicit trigger:

   ```bash
   gh pr comment <pr-number> --body "@codex review"
   ```

4. **Wait for the review.** Codex normally takes 1-5 minutes. Poll with:

   ```bash
   # Top-level review (Approve / Request changes / Comment)
   gh pr view <pr-number> --json reviews \
     --jq '.reviews[] | select(.author.login | test("codex|chatgpt-codex"; "i"))'

   # Inline review comments (file/line specific)
   gh api repos/<owner>/<repo>/pulls/<pr-number>/comments \
     --jq '.[] | select(.user.login | test("codex|chatgpt-codex"; "i")) | {path, line, body, id}'

   # General PR comments by codex
   gh pr view <pr-number> --json comments \
     --jq '.comments[] | select(.author.login | test("codex|chatgpt-codex"; "i"))'
   ```

   In the loop wrapper, prefer waiting via `ScheduleWakeup` (e.g. 270s) instead of busy polling — Codex review is async and the loop tick will resume.

5. **Parse findings.** Read every Codex comment. Categorize each:

   | Severity | Action |
   |---|---|
   | **MUST FIX** (Codex flagged a bug, security issue, broken contract, failing test, type error) | Fix immediately. Required before merge. |
   | **SHOULD FIX** (suggestion that improves correctness, perf, or maintainability) | Fix unless it expands scope beyond the issue. Default = fix. |
   | **NIT / STYLE** (formatting, naming, doc tweaks) | Fix if cheap, skip if it bloats the diff. |
   | **OUT OF SCOPE** (Codex is suggesting a refactor or new feature that doesn't belong here) | Skip. Reply on the comment with rationale. Open a Backlog issue if it's worth tracking. |

6. **Implement fixes.** For non-trivial fixes, you may spin up an Agent subagent scoped to the affected file(s). For trivial fixes, edit directly.

7. **Reply to each Codex comment** (`gh api ... comments` POST or `gh pr review --comment`) explaining the fix or the skip rationale. This creates an audit trail and lets Codex re-evaluate on the next push.

8. **Push the fixes** — Codex will re-review automatically.

9. **Loop steps 4-8 — MAX 2 ROUNDS.** Exit conditions:
   - Codex approves (`APPROVE` state, or "Looks good" / no MUST FIX findings), OR
   - All MUST FIX findings from rounds 1+2 are resolved and replied, OR
   - **2 review rounds completed — carry on regardless.** Log remaining findings in the workpad, mark them as "post-merge follow-up", and proceed to merge. Don't loop forever.

   **Autonomous policy**: speed of forward progress > exhaustive review polishing. Anything Codex still surfaces after 2 rounds goes into a new Backlog issue, not blocking the merge.

10. **Squash-merge** to `main`:
    ```bash
    gh pr merge <pr-number> --squash --delete-branch
    ```

11. **Move Linear issue to `Done`.** Update workpad with merge commit SHA.

12. Immediately poll for the next card (loop continues).

##### Step 7: Rework

Triggered when a previously-merged issue is reopened (Linear status `Rework`) or when a PR review reveals scope-level issues.

1. Read **all** feedback: Linear comments, GitHub PR comments, `@codex` review thread, workpad.
2. Move Linear issue to `In Progress`.
3. Re-create the Agent Team (TeamDelete the old one if it lingers) or extend an existing branch.
4. Re-run the design review loop if UI changed.
5. Re-validate, push, re-trigger `@codex` review.
6. Loop the codex review fetch until clean, then squash-merge.

---

## Stack Cheat Sheet

| Surface | Tech | Notes |
|---|---|---|
| **Web** | Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui | Cache Components, Fluid Compute, Turbopack |
| **Backend** | Convex (schema, queries, mutations, actions, file storage, auth) | Follow `convex-rules.md` strictly |
| **Workers** | Python on Railway — Browser Use, parsers, ML | One service per worker family |
| **AI** | AI SDK v6 + direct provider clients (Anthropic primary, OpenAI fallback), prompt registry in Convex | Provider abstraction lives in `lib/ai/gateway.ts` — single seam for fallback/observability |
| **iOS** | SwiftUI, Swift 6, iOS 17+, Convex Swift client, `@Observable` | Service interfaces, no direct SDK in views |
| **Analytics** | PostHog (events), Sentry (errors), Convex aggregates (KPIs) | Funnel events owned by KIN-771 |
| **Hosting** | **Railway** for everything: Next.js web service, Python workers (extraction, ML), Browser Use service. Per-PR preview environments enabled. | One Railway project, multiple services, monorepo root dirs |
| **CI/CD** | GitHub Actions for typecheck/lint/test/build; Railway GitHub integration deploys main + PR environments | `pnpm build` must pass before PR |
| **Tests** | Vitest (TS), Playwright (e2e), pytest (Python), XCTest (iOS) | Per KIN-859 |

**Cardinal rules:**

- **Convex is the system of record** — typed queries/mutations, no raw DB access
- **AI outputs cite sources** — every engine returns confidence + citations + review state
- **Florida-first** — schemas/flows assume FL today, multi-state seams are documented but not built
- **License-critical actions are human-in-the-loop** — agreements, compensation, calls, disclosures
- **No PII in observability sinks** — Sentry/PostHog event payloads stay clean

---

## Linear Operating Model

- **Project**: `buyer-v2` (id: `8269638f-19cc-47a6-9d30-beea34be5691`)
- **Team**: `Kindservices` (key: `KIN`)
- **Active states**: `Todo` → `In Progress` → `Merging` → `Done` (with `Rework` loop)
- **Backlog**: contains doc-only / ADR / strategy cards — never touch. Loop only picks `Todo` coding cards.
- **`blockedBy` relations**: actively maintained. Always query with `includeRelations: true` and skip blocked issues.

### Milestone Order (P0 → P5)

| # | Milestone | Focus |
|---|---|---|
| **P0** | Strategy & Compliance Foundations | Product, architecture, compliance, vendor, domain decisions |
| **P1** | Design System & Platform Foundation | Design language, components, repo scaffolding, Convex, Railway, CI/CD, security baseline |
| **P2** | Public Site & Acquisition | Marketing site, calculators, trust surfaces, SEO, intake instrumentation |
| **P3** | Property Ingestion, Deal Room & AI | URL/address intake, extraction, normalized property graph, deal room UI, AI engines |
| **P4** | Brokerage Workflow, Offers & Closing | Buyer agreements, tour ops, agents, offers, negotiation, contract ingestion, closing |
| **P5** | iOS, Analytics & Launch Readiness | Mobile app, push, deep links, analytics taxonomy, QA/UAT, launch ops, SaaS boundaries |

**Rule**: Don't start a later milestone while the current has unfinished Urgent/High issues. Hotfixes (broken main, prod outage) override priority.

---

## Branch Naming

Format: `buyer/<kin-id-lower>-<short-slug>`

Examples:
- `buyer/kin-741-core-platform-foundation`
- `buyer/kin-771-public-homepage-paste-link`
- `buyer/kin-786-pricing-panel-engine`
- `buyer/kin-826-ios-device-token-sync`

> Linear's auto-generated `goessenshidalgo/...` branch names are not used — they're too long for branch listings.

## Commit Message Format

```
<type>(<scope>): <short description>

<body — what and why, ≤72 col wrap>

Refs: KIN-<id>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`, `build`, `ci`

Scopes: `web`, `convex`, `worker`, `ai`, `ios`, `design`, `infra`, `ci`

---

## Workpad Template

Post this as a comment on every Linear issue when work starts. Edit in place as the card progresses — **one workpad per issue**.

````md
## Claude Workpad

```text
buyer-v2:/Users/stefang/Desktop/buyer-v2@<short-sha>
branch: buyer/<kin-id>-<slug>
```

### Agent Team

- Team: `<kin-id>-<slug>`
- Lead: Claude Code (`claude-opus-4-6`, max effort)
- Teammates:
  - `<name>` — <role>, owns: <file list>
  - `<name>` — <role>, owns: <file list>

### Plan

- [ ] 1. <task> (assigned to: <teammate>)
- [ ] 2. <task> (assigned to: <teammate>)
- [ ] 3. <task> (assigned to: <teammate>)

### Implementation Rounds

- <teammate> Round 1: <what was built>
- <teammate> Round 2: <changes from feedback>

### Design Review (Lead)

- Round 1: <screenshot path> — <comparison notes vs DESIGN.md>
- Round 2: <what improved, what still needs work>
- Round 3: <approved | flagged for human>

### Acceptance Criteria

- [ ] <from issue description>
- [ ] <from issue description>

### Validation

- [ ] `pnpm build` — passes
- [ ] `pnpm typecheck` — passes
- [ ] `pnpm test` — passes
- [ ] `pnpm test:e2e <relevant spec>` — passes (if UI)
- [ ] Convex deploy preview — green (if backend changed)
- [ ] Design review loop complete (≥2 rounds, screen matches reference caliber)
- [ ] `@codex` review fetched and addressed (see below)
- [ ] Agent team cleaned up (TeamDelete)

### Codex Review (GitHub @codex)

- Round 1: <verdict> — N findings (MUST/SHOULD/NIT/OOS), N fixed, N skipped (with rationale)
- Round 2: <if needed>
- Final: APPROVED → squash-merged at <commit-sha>
````

---

## Continuous Execution

**The loop NEVER stops.** After completing an issue (Linear `Done`), immediately poll for the next actionable issue. Work the entire board — all milestones, all issues, P0 → P5 — without pausing. The only reasons to stop are the **Stop Conditions** in `AGENTS.md`.

When P0 is fully Done, P1 issues continue (they're already Todo). When P1 is Done, move to P2. The goal is to ship the entire buyer-v2 platform autonomously.

---

## Guardrails

1. **Fully autonomous** — no human in the loop. Don't stop to ask. Log + carry on, except for the destructive guardrails below.
2. **Every issue = Agent Team** — TeamCreate → spawn teammates → TeamDelete. The lead orchestrates, teammates code. No card is ever implemented without a team. No code is ever written by the lead directly (except trivial design polish in the review loop).
3. **Code review is owned by `@codex` GitHub integration** — Claude fetches review, implements fixes, replies to comments. **MAX 2 rounds**, then merge regardless. Leftovers → new Backlog issue.
4. **Design loop is the exception to "carry on"** — design quality is non-negotiable. Run **at least 2 rounds, ideally 3, more if the screen still doesn't match the reference**. Never ship half-assed UI.
5. **Use `/clone-website` for any card based on a reference site** (Hosman, PayFit, RealAdvisor, etc.) before spawning the implementation team. Then polish on top.
6. **Never touch Backlog issues** — wait for human to promote them to Todo.
7. **Never skip validation** — `pnpm build` + `pnpm typecheck` + `pnpm test` must pass before PR.
8. **One workpad per issue** — edit in place, never duplicate.
9. **Don't expand scope** — create a new Backlog issue for improvements discovered mid-card or in Codex review.
10. **Convex schema is canon** — never bypass the Convex client.
11. **AI outputs must include confidence + citations** — every engine result.
12. **Milestone ordering** — P0 → P1 → P2 → P3 → P4 → P5.
13. **Florida-first** — multi-state is documented, not built.
14. **License-critical actions are HITL surfaces in the *product*** — never auto-execute compensation, contracts, calls in production code paths. (This is product behavior, not loop behavior.)
15. **PII never enters Sentry/PostHog payloads** — sanitize at the boundary.
16. **Commit hooks are mandatory** — never `--no-verify`.
17. **TeamDelete is mandatory** before starting the next card — no orphan teams.
18. **Reply to every Codex comment** — fix or skip-with-rationale, no silent dismissals.
19. **Hard stops** (the only things that pause the loop): force-push to `main`, irreversible Convex schema migration that drops data, deleting prod resources, secrets exposed in a commit. Everything else: log and carry on.

---

## Quick Start (lead)

```bash
# Start the autonomous loop (5-min interval)
/loop 5m "Execute the autonomous development workflow defined in workflow.md. FULLY AUTONOMOUS — no human in the loop, never stop to ask. Poll Linear for the buyer-v2 project (Kindservices team). Pick the highest-priority Todo / In Progress / Merging / Rework issue, respecting milestone order P0 → P5. Create an Agent Team via TeamCreate, spawn 2-4 Claude subagents with distinct file ownership, delegate via TaskCreate + SendMessage. Run the design review loop max 3 rounds, then carry on. Validate (pnpm build + typecheck + test). Open PR via gh, move to Merging, fetch @codex GitHub review (gh pr view --json reviews / gh api .../pulls/N/comments), implement every MUST FIX finding, reply to each comment, push. MAX 2 codex rounds — then merge regardless and move on (log leftovers as new Backlog issues). Squash-merge, mark Done. TeamDelete and pick next. Never touch Backlog. Never skip pnpm build + typecheck. Never use Codex MCP for coding — only as the GitHub PR reviewer. Claude Code writes all code directly."
```
