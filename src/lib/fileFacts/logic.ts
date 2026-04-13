/**
 * Pure validation + role-filter logic for the file facts state
 * (KIN-841).
 *
 * Every function is pure — no Convex calls, no IO. The Convex
 * mutation layer composes these helpers so the full decision
 * tree is exercised in Vitest without a live backend.
 */

import type {
  BrokerFactView,
  BuyerFactView,
  FileFact,
  FileFactReviewStatus,
  FileFactValidation,
  FileFactValidationError,
  FileFactValue,
  FileFactValueKind,
} from "./types";

// MARK: - Slug validation

/**
 * Valid fact slug: lowercase kebab-case or dot-separated segments
 * of kebab-case. Examples:
 *   - "hoa.monthly_fee"
 *   - "flood.zone"
 *   - "inspection.roof_age_years"
 *   - "contract.cash_to_close"
 * Must start with a letter and contain no whitespace or uppercase.
 */
const FACT_SLUG_REGEX = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

export function isValidFactSlug(slug: string): boolean {
  return FACT_SLUG_REGEX.test(slug);
}

// MARK: - Value validation

/**
 * Validate a standalone `FileFactValue`. Runs the per-kind checks
 * the full validator does but without requiring a full fact
 * record — useful for form-level validation in the broker UI
 * before the record is built.
 */
export function validateFactValue(
  value: FileFactValue,
  factId?: string
): FileFactValidationError[] {
  const errors: FileFactValidationError[] = [];
  // Runtime typeof checks go through `unknown` so the type system
  // doesn't narrow the check away — callers may be constructing
  // FileFactValue from raw Convex / form input that bypassed the
  // compiler.
  const rawValue: unknown = (value as { value: unknown }).value;
  switch (value.kind) {
    case "numeric":
      if (typeof rawValue !== "number" || Number.isNaN(rawValue)) {
        errors.push({
          kind: "valueKindMismatch",
          factId,
          expected: "numeric",
          actual: typeof rawValue,
        });
      }
      break;
    case "text":
      if (typeof rawValue !== "string") {
        errors.push({
          kind: "valueKindMismatch",
          factId,
          expected: "text",
          actual: typeof rawValue,
        });
      }
      break;
    case "date":
      if (typeof rawValue !== "string" || !isIsoDate(rawValue)) {
        errors.push({
          kind: "invalidIsoDate",
          factId,
          value: String(rawValue),
        });
      }
      break;
    case "boolean":
      if (typeof rawValue !== "boolean") {
        errors.push({
          kind: "valueKindMismatch",
          factId,
          expected: "boolean",
          actual: typeof rawValue,
        });
      }
      break;
    case "enum":
      if (!Array.isArray(value.allowed) || value.allowed.length === 0) {
        errors.push({ kind: "emptyEnumAllowList", factId });
      } else if (!value.allowed.includes(value.value)) {
        errors.push({
          kind: "enumValueNotAllowed",
          factId,
          value: value.value,
          allowed: value.allowed,
        });
      }
      break;
  }
  return errors;
}

// MARK: - Fact validation

/**
 * Validate a full `FileFact` record. Used by `createFact` and
 * `updateFact` in the Convex layer before writes land. Returns
 * a discriminated-union result so tests can branch on error
 * kinds.
 *
 * Required fields: factSlug, storageId, value. Optional fields
 * (propertyId, dealRoomId, analysisRunId, confidence) are
 * validated for format only when present.
 */
export function validateFact(fact: FileFact): FileFactValidation {
  const errors: FileFactValidationError[] = [];

  if (!fact.factSlug || fact.factSlug.trim() === "") {
    errors.push({ kind: "missingFactSlug" });
  } else if (!isValidFactSlug(fact.factSlug)) {
    errors.push({ kind: "invalidFactSlug", value: fact.factSlug });
  }

  if (!fact.storageId || fact.storageId.trim() === "") {
    errors.push({ kind: "missingStorageId" });
  }

  if (!fact.value) {
    errors.push({ kind: "missingValue" });
  } else {
    errors.push(...validateFactValue(fact.value, fact.id));
  }

  if (fact.confidence !== undefined) {
    if (
      typeof fact.confidence !== "number" ||
      Number.isNaN(fact.confidence) ||
      fact.confidence < 0 ||
      fact.confidence > 1
    ) {
      errors.push({
        kind: "confidenceOutOfRange",
        factId: fact.id,
        value: fact.confidence,
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// MARK: - ISO date parser

/**
 * Strict ISO-8601 date parser: accepts `YYYY-MM-DD` or full
 * `YYYY-MM-DDTHH:MM:SSZ`. Same shape as KIN-825/846.
 */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const roundTrip = parsed.toISOString().slice(0, 10);
  return roundTrip === value.slice(0, 10);
}

// MARK: - Review transitions

/**
 * Legal review-status transitions.
 *
 *   - needsReview → approved | rejected
 *   - approved    → rejected | superseded
 *   - rejected    → approved (broker changes their mind)
 *                 → superseded
 *   - superseded  → (terminal)
 *
 * Superseded is the only terminal state — rejected is reversible
 * because brokers regularly re-review after extractor improvements.
 */
export function canTransitionReview(
  from: FileFactReviewStatus,
  to: FileFactReviewStatus
): boolean {
  const allowed: Record<FileFactReviewStatus, FileFactReviewStatus[]> = {
    needsReview: ["approved", "rejected"],
    approved: ["rejected", "superseded"],
    rejected: ["approved", "superseded"],
    superseded: [],
  };
  if (from === to) return true;
  return allowed[from].includes(to);
}

// MARK: - Role filtering

/**
 * Filter a fact list by role.
 *
 * - `buyer` sees only facts that are:
 *     - reviewStatus === "approved"
 *     - internalOnly === false
 *   (needsReview, rejected, and superseded facts are always hidden
 *    from buyers, as are internal-only facts regardless of review)
 * - `broker`/`admin` see everything
 *
 * The filter is role-aware so the same read model can power both
 * the buyer deal-room view and the broker review queue.
 */
export function filterFactsByRole(
  facts: readonly FileFact[],
  role: "buyer" | "broker" | "admin"
): FileFact[] {
  if (role === "broker" || role === "admin") {
    return [...facts];
  }
  return facts.filter(
    (f) => f.reviewStatus === "approved" && !f.internalOnly
  );
}

// MARK: - Projection

/**
 * Project a raw fact into the buyer view. Drops internal fields
 * and renders the value as a display-ready string. Caller should
 * have already filtered to approved + non-internal facts — this
 * projection does NOT re-filter (would hide the bug of calling
 * it on a non-approved fact).
 */
export function projectBuyerFact(fact: FileFact): BuyerFactView {
  return {
    id: fact.id,
    factSlug: fact.factSlug,
    displayValue: formatValue(fact.value),
    value: fact.value,
    storageId: fact.storageId,
    propertyId: fact.propertyId,
    confidence: fact.confidence,
  };
}

/**
 * Project into the broker view — full fact with the display
 * string convenience field. Broker view never hides fields.
 */
export function projectBrokerFact(fact: FileFact): BrokerFactView {
  return {
    ...fact,
    displayValue: formatValue(fact.value),
  };
}

/**
 * Format a `FileFactValue` as a display-ready string. Units are
 * appended when present; enums and booleans get their natural
 * string; dates are formatted as `YYYY-MM-DD`.
 */
export function formatValue(value: FileFactValue): string {
  switch (value.kind) {
    case "numeric":
      return value.unit ? `${value.value} ${value.unit}` : String(value.value);
    case "text":
      return value.value;
    case "date":
      return value.value.slice(0, 10);
    case "boolean":
      return value.value ? "Yes" : "No";
    case "enum":
      return value.value;
  }
}

// MARK: - Latest-per-slug selector

/**
 * Return the most recent approved fact per slug. Used by the
 * buyer deal-room read model — when the same slug has multiple
 * historical entries (because extractors re-ran or a broker
 * edited), only the latest approved one surfaces. Ties on
 * `updatedAt` break by `id` descending for determinism.
 *
 * Input facts are typically already role-filtered; this helper
 * is the next layer on top of that. Callers that want the full
 * history (broker audit view) skip this helper entirely.
 */
export function latestApprovedPerSlug(
  facts: readonly FileFact[]
): FileFact[] {
  const bySlug = new Map<string, FileFact>();
  for (const fact of facts) {
    if (fact.reviewStatus !== "approved") continue;
    const existing = bySlug.get(fact.factSlug);
    if (!existing || compareDesc(fact, existing) < 0) {
      bySlug.set(fact.factSlug, fact);
    }
  }
  return Array.from(bySlug.values());
}

function compareDesc(a: FileFact, b: FileFact): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id > b.id ? -1 : 1;
  }
  return 0;
}

// Export the kind list for docs/tooling (never used at runtime but
// handy for introspection surfaces).
export const FILE_FACT_VALUE_KINDS: readonly FileFactValueKind[] = [
  "numeric",
  "text",
  "date",
  "boolean",
  "enum",
];
