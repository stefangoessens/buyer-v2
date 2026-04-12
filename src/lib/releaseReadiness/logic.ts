/**
 * Pure decision logic for the release readiness state (KIN-846).
 *
 * Every function is pure — no Convex calls, no IO. The Convex
 * mutation layer composes these helpers so the full decision tree
 * is exercised in Vitest without a live backend.
 */

import type {
  OverallReadiness,
  ReadinessItem,
  ReadinessItemStatus,
  ReadinessTransitionError,
  ReadinessValidation,
  ReadinessValidationError,
} from "./types";

// MARK: - Field validation

/**
 * Validate a single item's fields. Used by both the `createItem`
 * and `updateItem` paths to fail loud before the write lands.
 *
 * `title` budget is 3–120 chars. `blockerNote` is required when
 * `status === "blocked"`. `evidenceUrl` is required when
 * `status === "ready"` so the launch audit trail is reliable.
 */
export function validateItem(
  item: ReadinessItem
): ReadinessValidation {
  const errors: ReadinessValidationError[] = [];

  if (!item.id || item.id.trim() === "") {
    errors.push({ kind: "missingField", field: "id" });
  }

  if (!item.owner || item.owner.trim() === "") {
    errors.push({ kind: "missingField", field: "owner", itemId: item.id });
  }

  if (!item.title || item.title.trim() === "") {
    errors.push({ kind: "missingField", field: "title", itemId: item.id });
  } else if (item.title.length < 3) {
    errors.push({
      kind: "titleTooShort",
      itemId: item.id,
      length: item.title.length,
    });
  } else if (item.title.length > 120) {
    errors.push({
      kind: "titleTooLong",
      itemId: item.id,
      length: item.title.length,
    });
  }

  if (!item.targetDate || !isIsoDate(item.targetDate)) {
    errors.push({
      kind: "invalidTargetDate",
      itemId: item.id,
      value: item.targetDate,
    });
  }

  if (item.status === "blocked") {
    if (!item.blockerNote || item.blockerNote.trim() === "") {
      errors.push({ kind: "missingBlockerNote", itemId: item.id });
    }
  }

  if (item.status === "ready") {
    if (!item.evidenceUrl || item.evidenceUrl.trim() === "") {
      errors.push({ kind: "missingEvidenceForReady", itemId: item.id });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Validate a full checklist as a group — catches duplicate ids
 * across items which `validateItem` can't see individually.
 */
export function validateChecklist(
  items: readonly ReadinessItem[]
): ReadinessValidation {
  const errors: ReadinessValidationError[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const perItem = validateItem(item);
    if (!perItem.ok) {
      errors.push(...perItem.errors);
    }
    if (seen.has(item.id)) {
      errors.push({ kind: "duplicateId", itemId: item.id });
    }
    seen.add(item.id);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// MARK: - ISO date parser

/**
 * Strict ISO-8601 date parser: accepts `YYYY-MM-DD` or the full
 * `YYYY-MM-DDTHH:MM:SSZ` form. Same shape as the trust-proof
 * guardrail from KIN-825 — rounds through `Date` to catch
 * "parses but invalid" inputs like `2026-13-40`.
 */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const roundTrip = parsed.toISOString().slice(0, 10);
  const inputDate = value.slice(0, 10);
  return roundTrip === inputDate;
}

// MARK: - Status transitions

/**
 * Legal transition graph. See `types.ts` for the rationale. Returns
 * `true` when `from → to` is allowed.
 */
export function canTransition(
  from: ReadinessItemStatus,
  to: ReadinessItemStatus
): boolean {
  const allowed: Record<ReadinessItemStatus, ReadinessItemStatus[]> = {
    notStarted: ["inProgress", "blocked", "deferred"],
    inProgress: ["atRisk", "blocked", "ready", "deferred"],
    blocked: ["inProgress", "atRisk", "deferred"],
    atRisk: ["inProgress", "blocked", "ready", "deferred"],
    ready: ["inProgress", "deferred"],
    deferred: ["notStarted", "inProgress"],
  };
  // A self-transition (same status) is not "move" — it's a no-op
  // that's always safe. Callers that want to update other fields
  // without changing status should call `patchFields` instead.
  if (from === to) return true;
  return allowed[from].includes(to);
}

/**
 * Apply a status transition, returning the new item or a typed
 * error. Pure — caller is responsible for persisting the result.
 *
 * The new status takes effect only if `canTransition` allows the
 * move. Missing blocker note on a transition INTO `blocked`, or
 * missing evidence URL on a transition INTO `ready`, are reported
 * through `validateItem` — this function does NOT double-check.
 * The Convex mutation layer calls both in order.
 */
export function transitionStatus(
  item: ReadinessItem,
  nextStatus: ReadinessItemStatus,
  now: string,
  updatedBy: string
):
  | { ok: true; item: ReadinessItem }
  | { ok: false; error: ReadinessTransitionError } {
  if (!canTransition(item.status, nextStatus)) {
    return {
      ok: false,
      error: {
        kind: "illegalTransition",
        from: item.status,
        to: nextStatus,
      },
    };
  }
  return {
    ok: true,
    item: {
      ...item,
      status: nextStatus,
      updatedAt: now,
      updatedBy,
    },
  };
}

// MARK: - Overall rollup

/**
 * Derive the overall readiness verdict from a list of items.
 *
 * Rules:
 *   - Empty or all-deferred → `empty`
 *   - Any p0 `blocked` → `noGo`
 *   - Any p0 `atRisk` OR any p1 `blocked` → `atRisk`
 *   - Otherwise (every p0 is ready/inProgress/notStarted AND every
 *     p1 is at worst atRisk) → `go`
 *
 * Implementation note: the `notStarted` and `inProgress` statuses
 * are treated as "still in flight" — they don't block `go` because
 * they could still resolve before launch. The rollup is a
 * point-in-time opinion, not a commitment.
 *
 * `deferred` items are excluded from the rollup by design: they're
 * explicitly out of scope for this launch window.
 */
export function computeOverallReadiness(
  items: readonly ReadinessItem[]
): OverallReadiness {
  const active = items.filter((i) => i.status !== "deferred");
  const total = active.length;
  if (total === 0) return { kind: "empty" };

  const p0Blocked = active.filter(
    (i) => i.severity === "p0" && i.status === "blocked"
  );
  if (p0Blocked.length > 0) {
    return { kind: "noGo", total, blockedCount: p0Blocked.length };
  }

  const p0AtRisk = active.filter(
    (i) => i.severity === "p0" && i.status === "atRisk"
  );
  const p1Blocked = active.filter(
    (i) => i.severity === "p1" && i.status === "blocked"
  );
  if (p0AtRisk.length > 0 || p1Blocked.length > 0) {
    return {
      kind: "atRisk",
      total,
      atRiskCount: p0AtRisk.length + p1Blocked.length,
    };
  }

  return { kind: "go", total };
}

// MARK: - Summary metrics

export interface ReadinessSummary {
  total: number;
  notStarted: number;
  inProgress: number;
  blocked: number;
  atRisk: number;
  ready: number;
  deferred: number;
  p0Total: number;
  p0Ready: number;
  p0Blocked: number;
  readinessPct: number;
}

/**
 * Count-based projection for dashboards. `readinessPct` is the
 * share of active items in `ready` state, 0..1. Deferred items
 * are excluded from the denominator.
 */
export function summarizeChecklist(
  items: readonly ReadinessItem[]
): ReadinessSummary {
  const total = items.length;
  let notStarted = 0;
  let inProgress = 0;
  let blocked = 0;
  let atRisk = 0;
  let ready = 0;
  let deferred = 0;

  for (const item of items) {
    switch (item.status) {
      case "notStarted":
        notStarted++;
        break;
      case "inProgress":
        inProgress++;
        break;
      case "blocked":
        blocked++;
        break;
      case "atRisk":
        atRisk++;
        break;
      case "ready":
        ready++;
        break;
      case "deferred":
        deferred++;
        break;
    }
  }

  const p0Items = items.filter((i) => i.severity === "p0");
  const p0Total = p0Items.length;
  const p0Ready = p0Items.filter((i) => i.status === "ready").length;
  const p0Blocked = p0Items.filter((i) => i.status === "blocked").length;

  const activeDenominator = total - deferred;
  const readinessPct =
    activeDenominator === 0 ? 0 : ready / activeDenominator;

  return {
    total,
    notStarted,
    inProgress,
    blocked,
    atRisk,
    ready,
    deferred,
    p0Total,
    p0Ready,
    p0Blocked,
    readinessPct,
  };
}
