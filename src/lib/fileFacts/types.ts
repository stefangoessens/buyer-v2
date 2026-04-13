/**
 * Typed file facts state (KIN-841).
 *
 * A "file fact" is one discrete data point extracted from an
 * uploaded document (HOA estoppel, inspection report, flood
 * certificate, contract rider, etc.) by the AI analysis pipeline.
 * Facts are stored separately from the raw document so downstream
 * consumers (risk summary, offer engine, broker review) can query
 * the typed projection without re-parsing.
 *
 * Each fact carries:
 *   - a stable `kind` that discriminates the value type
 *   - a typed value matching the kind
 *   - a `factSlug` naming the semantic fact (e.g. "hoa.monthly_fee",
 *     "flood.zone", "inspection.roof_age_years") — this is what
 *     downstream code queries by
 *   - an optional confidence 0..1 from the extracting engine
 *   - a review status so brokers can approve/reject facts before
 *     they surface in buyer-facing views
 *   - an `internalOnly` flag for facts that must never leak to
 *     buyers (e.g. seller concession notes, internal ops comments)
 *
 * Pure validation + role-filter logic is in `src/lib/fileFacts/logic.ts`
 * so the decision tree is exercised in Vitest without a live
 * Convex backend. The Convex mutation layer mirrors the same rules.
 */

// MARK: - Value kinds

/**
 * Tagged union of fact values. Every fact is one of these; the
 * `kind` field discriminates.
 *
 * `enum` carries both the selected value and the allowed set so
 * downstream readers can validate the value is still in the
 * current set without re-fetching the catalog.
 */
export type FileFactValue =
  | { kind: "numeric"; value: number; unit?: string }
  | { kind: "text"; value: string }
  | { kind: "date"; value: string } // ISO-8601
  | { kind: "boolean"; value: boolean }
  | { kind: "enum"; value: string; allowed: readonly string[] };

export type FileFactValueKind = FileFactValue["kind"];

// MARK: - Review state

/**
 * Review lifecycle. Brokers approve or reject facts before they
 * surface in buyer-facing views. `needsReview` is the initial state
 * for newly-extracted facts.
 *
 * - `needsReview` — awaiting broker decision (default for new facts)
 * - `approved`    — broker confirmed; buyer-facing reads can return
 * - `rejected`    — broker rejected; never surfaced to buyers
 * - `superseded`  — replaced by a newer fact on the same slug
 *                   (append-only history; the old row stays for
 *                   audit but returns from buyer reads only if
 *                   no newer approved fact exists)
 */
export type FileFactReviewStatus =
  | "needsReview"
  | "approved"
  | "rejected"
  | "superseded";

// MARK: - Fact record

/**
 * A single fact row. `factSlug` is the semantic identifier
 * (namespaced — dot-separated); `storageId` is the Convex _storage
 * id of the source file; `analysisRunId` is the optional id of the
 * analysis run that produced the fact (for tracing back to the
 * exact LLM call or deterministic parser).
 */
export interface FileFact {
  id: string;
  factSlug: string;
  value: FileFactValue;
  /** Convex storage id of the source file. */
  storageId: string;
  /** Optional property context. */
  propertyId?: string;
  /** Optional deal room context. */
  dealRoomId?: string;
  /** Optional analysis run id so the fact can be traced to its source. */
  analysisRunId?: string;
  /** Engine confidence 0..1 (null for facts entered manually by broker). */
  confidence?: number;
  reviewStatus: FileFactReviewStatus;
  /**
   * When true, the fact never surfaces to buyers — only brokers/
   * admins. Used for internal ops notes that shouldn't leak.
   */
  internalOnly: boolean;
  /** Broker user id that set the current reviewStatus. */
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// MARK: - Validation errors

export type FileFactValidationError =
  | { kind: "missingFactSlug" }
  | { kind: "invalidFactSlug"; value: string }
  | { kind: "missingStorageId" }
  | { kind: "missingValue" }
  | {
      kind: "valueKindMismatch";
      factId?: string;
      expected: FileFactValueKind;
      actual: string;
    }
  | { kind: "invalidIsoDate"; factId?: string; value: string }
  | {
      kind: "confidenceOutOfRange";
      factId?: string;
      value: number;
    }
  | {
      kind: "enumValueNotAllowed";
      factId?: string;
      value: string;
      allowed: readonly string[];
    }
  | {
      kind: "emptyEnumAllowList";
      factId?: string;
    };

export type FileFactValidation =
  | { ok: true }
  | { ok: false; errors: FileFactValidationError[] };

// MARK: - Read model

/**
 * Buyer-facing projection of a fact. Drops internal fields
 * (`internalOnly`, `reviewedBy`, review status) and renames
 * `value` to a flat string for display. Constructed via
 * `projectBuyerFact` in the logic module.
 */
export interface BuyerFactView {
  id: string;
  factSlug: string;
  /** Display-ready string form of the value. */
  displayValue: string;
  /** Original tagged value, kept so UI code can format per kind. */
  value: FileFactValue;
  storageId: string;
  propertyId?: string;
  confidence?: number;
}

/**
 * Internal/broker projection — full fact with review metadata.
 * Used by broker review queues and audit tooling.
 */
export interface BrokerFactView extends FileFact {
  /** Same as `value` — kept for symmetry with BuyerFactView. */
  displayValue: string;
}
