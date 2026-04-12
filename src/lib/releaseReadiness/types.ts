/**
 * Typed release readiness state (KIN-846).
 *
 * The release readiness checklist tracks every item the team has to
 * resolve before we can flip a launch gate. Items are stored in
 * Convex via `convex/releaseReadiness.ts` and consumed by the ops
 * dashboard and the launch runbook.
 *
 * Pure decision logic for status transitions and overall rollup is
 * in `src/lib/releaseReadiness/logic.ts` so it can be exercised in
 * Vitest without a live Convex backend. The Convex file mirrors
 * the same rules at the mutation layer.
 */

// MARK: - Status

/**
 * Per-item status.
 *
 * - `notStarted` — item exists but hasn't been picked up yet
 * - `inProgress` — owner is actively working on it
 * - `blocked`    — blocked by an external dependency (captured in
 *                  `blockerNote` so ops can see why)
 * - `atRisk`     — still moving but unlikely to make the target
 *                  date without intervention
 * - `ready`      — item is done and the check has passed (terminal)
 * - `deferred`   — explicitly postponed to a post-launch cycle;
 *                  counts as "out of scope" for overall rollup
 *
 * `deferred` is distinct from `ready` so the audit log can
 * distinguish between "we shipped this" and "we moved the goalpost."
 */
export type ReadinessItemStatus =
  | "notStarted"
  | "inProgress"
  | "blocked"
  | "atRisk"
  | "ready"
  | "deferred";

/**
 * Per-item severity — how load-bearing is this item for the launch
 * decision.
 *
 * - `p0` — hard launch gate. Blocked OR atRisk on any p0 item
 *          means the overall status is NOT go.
 * - `p1` — important but the gate can still flip go if every p1
 *          item is at worst `atRisk` (not blocked).
 * - `p2` — soft nice-to-have; no p2 state blocks the overall gate.
 */
export type ReadinessItemSeverity = "p0" | "p1" | "p2";

// MARK: - Item

/**
 * A single checklist entry. Every entry has a stable id so the
 * runbook can link to it, an owner who is accountable, and a target
 * date (ISO-8601) that the rollup compares against `now` to decide
 * "at risk."
 */
export interface ReadinessItem {
  id: string;
  title: string;
  description: string;
  /** Team or individual responsible. Free text — audited on change. */
  owner: string;
  severity: ReadinessItemSeverity;
  status: ReadinessItemStatus;
  /** ISO-8601 date the item must be done by. */
  targetDate: string;
  /**
   * Required when `status === "blocked"`. Free text explaining
   * what's blocking the item. `validateItem` enforces presence.
   */
  blockerNote?: string;
  /**
   * Optional evidence URL (PR, Linear ticket, Notion doc) showing
   * why this item is in its current state. Required for `ready`
   * items so the launch audit can trace the green light.
   */
  evidenceUrl?: string;
  /** ISO-8601 of last state transition. */
  updatedAt: string;
  /** User id or service principal that last updated the item. */
  updatedBy: string;
}

// MARK: - Overall rollup

/**
 * Derived overall state for the whole readiness checklist.
 *
 * - `go`       — all p0 items ready; all p1 items at worst atRisk
 * - `atRisk`   — any p1 item blocked OR any p0 atRisk (still
 *                recoverable but requires attention)
 * - `noGo`     — any p0 blocked (launch gate is red)
 * - `empty`    — zero items in the catalog (ops hasn't seeded yet)
 *
 * `deferred` items are excluded from the rollup — they're
 * explicitly out of scope for the current launch window.
 */
export type OverallReadiness =
  | { kind: "go"; total: number }
  | { kind: "atRisk"; total: number; atRiskCount: number }
  | { kind: "noGo"; total: number; blockedCount: number }
  | { kind: "empty" };

// MARK: - Validation

export type ReadinessValidationError =
  | { kind: "missingField"; field: keyof ReadinessItem; itemId?: string }
  | { kind: "titleTooShort"; itemId: string; length: number }
  | { kind: "titleTooLong"; itemId: string; length: number }
  | {
      kind: "invalidTargetDate";
      itemId: string;
      value: string;
    }
  | {
      kind: "missingBlockerNote";
      itemId: string;
    }
  | {
      kind: "missingEvidenceForReady";
      itemId: string;
    }
  | {
      kind: "duplicateId";
      itemId: string;
    };

export type ReadinessValidation =
  | { ok: true }
  | { ok: false; errors: ReadinessValidationError[] };

// MARK: - Transition

/**
 * Legal status transitions. `transition` enforces this — an
 * illegal transition throws so the caller (Convex mutation) can
 * fail fast with a clean error.
 *
 * Transition rules (roughly a Kanban flow):
 *   - notStarted → inProgress | blocked | deferred
 *   - inProgress → atRisk | blocked | ready | deferred
 *   - blocked    → inProgress | atRisk | deferred (unblocked)
 *   - atRisk     → inProgress | blocked | ready | deferred
 *   - ready      → inProgress (reopen) | deferred
 *   - deferred   → notStarted | inProgress (re-scoped)
 */
export type ReadinessTransitionError = {
  kind: "illegalTransition";
  from: ReadinessItemStatus;
  to: ReadinessItemStatus;
};
