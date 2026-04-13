# Testing Strategy

KIN-948 establishes the baseline test stack for every buyer-v2 surface without expanding product scope. Every layer has one default toolchain, one fixture story, and one PR gate.

## Layers

| Layer | Tooling | Command | Notes |
|---|---|---|---|
| Web + shared TypeScript | Vitest | `pnpm test` / `pnpm test:coverage` | Unit tests, contract tests, Convex integration harnesses, and AI eval snapshots |
| Convex backend | Vitest + mocked Convex ctx/db harness | `pnpm test` | Registered query/mutation/action handlers are executed through `_handler` with reusable mocks |
| Browser flows | Playwright | `pnpm test:e2e` | Smoke-checks the implemented homepage paste + intake teaser handoff on every PR |
| Python worker library | pytest + pytest-cov | `pnpm workers:lib:test` | Deterministic parser/unit coverage with fixture-backed portal samples |
| Extraction service | pytest + pytest-cov | `pnpm workers:service:test` | Service API behavior and transport coverage |
| iOS | XCTest / Swift Testing | `pnpm ios:test` | Swift package tests plus shared JSON contract fixtures |
| AI eval harness | Vitest snapshots + CLI smoke | `pnpm test:eval` | Seed fixture stays stable and the CLI fails on regression |

## Fixtures

- Portal HTML fixtures live in `python-workers/fixtures/html/{zillow,redfin,realtor}`.
- Portal fixture inventory is enforced by `python-workers/tests/test_fixture_manifest.py` so each portal always includes condo / sfh / townhome / new-construction coverage.
- Web parser fixtures live under `src/test/fixtures/`.
- Cross-layer JSON contracts live under `src/test/fixtures/contracts/` and are decoded by both Vitest and Swift tests.
- AI eval seed fixtures live in `src/lib/ai/eval/fixtures.ts`.

## Local Bootstrap

- Run `pnpm workers:install` once on a fresh checkout before invoking the Python test commands.
- `pnpm test:eval` uses `node --import tsx` so the eval harness CLI runs without relying on `tsx`'s IPC shim.

## Coverage Thresholds

These thresholds are conservative baselines: high enough to catch obvious regressions, low enough to ratchet upward from the current repo state.

| Layer | Threshold |
|---|---|
| Vitest (web/shared/contracts/Convex harness) | 50% statements / branches / functions / lines |
| Python worker library | 75% line coverage |
| Extraction service | 80% line coverage |
| iOS Swift package | 65% line coverage in CI |
| Playwright | Scenario gate only; the smoke flow itself is the threshold |
| AI eval | Seed fixture set must pass 100% in `pnpm test:eval` |

## PR Gates

GitHub Actions blocks PRs on:

- web lint, typecheck, coverage, and build
- Convex typecheck
- shared package typecheck
- Playwright E2E smoke
- pricing eval smoke
- Python worker tests with coverage
- extraction-service tests with coverage
- iOS tests with coverage reporting + threshold enforcement

## Extending The Suite

- Prefer fixture-backed tests over network or vendor calls.
- Add new Convex function tests through `src/test/convex.ts` unless a real local Convex deployment is required.
- When a new mobile-facing JSON payload is introduced, add a shared fixture in `src/test/fixtures/contracts/` and validate it in both Vitest and Swift before wiring the endpoint.
- When the registration and authenticated deal-room handoff is fully implemented, extend the Playwright smoke from intake teaser coverage to the full paste → teaser → register → deal room path rather than creating a second parallel spec.
