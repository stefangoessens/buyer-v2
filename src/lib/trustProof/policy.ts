/**
 * Trust-proof labeling policy + selector helpers (KIN-825).
 *
 * This is the ONLY place the labeling rules are encoded. The UI
 * must not inspect `source` directly — it must call `labelCase`
 * and `labelBlock` to receive a `LabeledCaseStudy` / `LabeledProofBlock`
 * with the policy already applied. Any code path that bypasses this
 * module risks rendering illustrative demo content as live
 * transaction proof, which is the exact regression this card is
 * guarding against.
 */

import type {
  CaseStudy,
  LabelingPolicy,
  LabeledCaseStudy,
  LabeledProofBlock,
  ProofBlock,
} from "./types";

// MARK: - Default policy

/**
 * Canonical labeling copy. Editable by content/legal; any change
 * here is a legal-review line item.
 */
export const DEFAULT_LABELING_POLICY: LabelingPolicy = {
  illustrativeLabel: "Illustrative example",
  illustrativeAria:
    "Illustrative example — not a live buyer-v2 transaction.",
  illustrativeDetailNote:
    "This is an illustrative example used to explain the buyer-v2 process. The figures shown are representative of typical Florida transactions and are not derived from a specific closed buyer-v2 deal. When buyer-v2 has live transaction data we will display it separately with explicit verification metadata.",
};

// MARK: - Validation errors

/**
 * Returned by `validateLiveTransactionCaseStudy` when a live-source
 * case study is missing the guardrails required for public render.
 */
export type LiveProofValidationError =
  | { kind: "missingVerification"; field: string }
  | { kind: "missingConsent" }
  | { kind: "missingClosingDate" }
  | { kind: "missingTransactionRef" }
  | { kind: "invalidClosingDate"; value: string }
  | { kind: "futureClosingDate"; closingDate: string; nowIso: string };

/**
 * ISO-8601 date format guard: strict `YYYY-MM-DD` or full
 * `YYYY-MM-DDTHH:MM:SSZ`. We parse through `new Date(...)` and
 * then round-trip to detect "looks like a date but isn't valid"
 * inputs like `2026-13-40`.
 */
function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip check — catches 2026-13-40 style "parses but invalid"
  const roundTrip = parsed.toISOString().slice(0, 10);
  const inputDateOnly = value.slice(0, 10);
  if (roundTrip !== inputDateOnly) return null;
  return parsed;
}

/**
 * Validate that a live-transaction case study has all the metadata
 * required for public render. Illustrative case studies bypass
 * this — they render under the illustrative label no matter what.
 *
 * Closing date is required to be a valid ISO-8601 date AND be in
 * the past relative to `now` — a future closing date is not yet a
 * "live transaction" and should not render as verified outcome.
 *
 * `now` is injectable so tests can pin the clock deterministically.
 * Defaults to `new Date()` for production use.
 */
export function validateLiveTransactionCaseStudy(
  study: CaseStudy,
  now: Date = new Date()
): LiveProofValidationError[] {
  if (study.source !== "liveTransaction") return [];
  const errors: LiveProofValidationError[] = [];
  if (!study.verification) {
    errors.push({ kind: "missingVerification", field: "verification" });
    return errors;
  }
  if (study.verification.buyerConsent !== true) {
    errors.push({ kind: "missingConsent" });
  }
  if (!study.verification.closingDate) {
    errors.push({ kind: "missingClosingDate" });
  } else {
    // Parse + round-trip — catches malformed + "parses but invalid" dates
    const parsed = parseIsoDate(study.verification.closingDate);
    if (!parsed) {
      errors.push({
        kind: "invalidClosingDate",
        value: study.verification.closingDate,
      });
    } else if (parsed.getTime() > now.getTime()) {
      // Future closing dates are not "live transactions" yet — reject
      errors.push({
        kind: "futureClosingDate",
        closingDate: study.verification.closingDate,
        nowIso: now.toISOString(),
      });
    }
  }
  if (!study.verification.transactionRef) {
    errors.push({ kind: "missingTransactionRef" });
  }
  return errors;
}

// MARK: - Labeling

/**
 * Wrap a raw CaseStudy in the labeling envelope. Illustrative
 * sources get the policy's label; live sources get null (render
 * without a qualifier).
 */
export function labelCase(
  study: CaseStudy,
  policy: LabelingPolicy = DEFAULT_LABELING_POLICY
): LabeledCaseStudy {
  if (study.source === "illustrative") {
    return {
      case: study,
      label: policy.illustrativeLabel,
      ariaLabel: policy.illustrativeAria,
      isIllustrative: true,
    };
  }
  return {
    case: study,
    label: null,
    ariaLabel: null,
    isIllustrative: false,
  };
}

/**
 * Same as `labelCase` but for `ProofBlock`.
 */
export function labelBlock(
  block: ProofBlock,
  policy: LabelingPolicy = DEFAULT_LABELING_POLICY
): LabeledProofBlock {
  if (block.source === "illustrative") {
    return {
      block,
      label: policy.illustrativeLabel,
      ariaLabel: policy.illustrativeAria,
      isIllustrative: true,
    };
  }
  return {
    block,
    label: null,
    ariaLabel: null,
    isIllustrative: false,
  };
}

// MARK: - Selectors

/**
 * Return public + renderable case studies, each pre-labeled.
 *
 * Filtering:
 *   1. Drop internal-visibility records (drafts).
 *   2. Drop live-transaction records that fail validation
 *      (missing consent, missing/invalid/future closing date,
 *      missing transaction ref).
 *   3. Wrap everything that passes through `labelCase`.
 *
 * This is the one function the UI should call to get the case-study
 * list. Anything else would bypass the labeling policy.
 *
 * `now` is injectable for deterministic tests.
 */
export function publicCaseStudies(
  catalog: readonly CaseStudy[],
  policy: LabelingPolicy = DEFAULT_LABELING_POLICY,
  now: Date = new Date()
): LabeledCaseStudy[] {
  return catalog
    .filter((c) => c.visibility === "public")
    .filter((c) => validateLiveTransactionCaseStudy(c, now).length === 0)
    .map((c) => labelCase(c, policy));
}

/**
 * Same contract as `publicCaseStudies` but for `ProofBlock`.
 * Proof blocks don't need live-transaction verification — they're
 * either illustrative (labeled) or aggregate metrics from the
 * analytics pipeline (rendered as-is).
 */
export function publicProofBlocks(
  catalog: readonly ProofBlock[],
  policy: LabelingPolicy = DEFAULT_LABELING_POLICY
): LabeledProofBlock[] {
  return catalog
    .filter((b) => b.visibility === "public")
    .map((b) => labelBlock(b, policy));
}

// MARK: - Mixed-state detection

/**
 * Given a slice of labeled case studies, report whether the slice
 * mixes illustrative and live sources. The homepage uses this to
 * decide whether to render the "Illustrative example" label once
 * above the grid (when everything is illustrative) or per-card
 * (when the slice is mixed).
 */
export type SliceLabelingMode =
  | { kind: "allIllustrative"; label: string; aria: string }
  | { kind: "allLive" }
  | { kind: "mixed" };

export function detectSliceLabelingMode(
  slice: readonly LabeledCaseStudy[],
  policy: LabelingPolicy = DEFAULT_LABELING_POLICY
): SliceLabelingMode {
  if (slice.length === 0) return { kind: "allLive" };
  const illustrative = slice.filter((s) => s.isIllustrative);
  if (illustrative.length === slice.length) {
    return {
      kind: "allIllustrative",
      label: policy.illustrativeLabel,
      aria: policy.illustrativeAria,
    };
  }
  if (illustrative.length === 0) {
    return { kind: "allLive" };
  }
  return { kind: "mixed" };
}

// MARK: - Aggregate metrics (pre-revenue)

/**
 * Small aggregate projection for the homepage trust-bar layout.
 * Returns counts + labeling-mode hint.
 */
export interface TrustProofSummary {
  totalCaseStudies: number;
  illustrativeCaseStudies: number;
  liveCaseStudies: number;
  totalProofBlocks: number;
  illustrativeProofBlocks: number;
  liveProofBlocks: number;
  /** True when there's at least one live case study ready to render. */
  hasLiveProof: boolean;
}

export function summarizeTrustProof(
  cases: readonly CaseStudy[],
  blocks: readonly ProofBlock[],
  now: Date = new Date()
): TrustProofSummary {
  const publicCases = cases.filter((c) => c.visibility === "public");
  const publicBlocks = blocks.filter((b) => b.visibility === "public");
  const illustrativeCases = publicCases.filter(
    (c) => c.source === "illustrative"
  ).length;
  const liveCases = publicCases.filter(
    (c) =>
      c.source === "liveTransaction" &&
      validateLiveTransactionCaseStudy(c, now).length === 0
  ).length;
  const illustrativeBlocks = publicBlocks.filter(
    (b) => b.source === "illustrative"
  ).length;
  const liveBlocks = publicBlocks.filter(
    (b) => b.source === "liveTransaction"
  ).length;
  return {
    totalCaseStudies: illustrativeCases + liveCases,
    illustrativeCaseStudies: illustrativeCases,
    liveCaseStudies: liveCases,
    totalProofBlocks: illustrativeBlocks + liveBlocks,
    illustrativeProofBlocks: illustrativeBlocks,
    liveProofBlocks: liveBlocks,
    hasLiveProof: liveCases > 0 || liveBlocks > 0,
  };
}
