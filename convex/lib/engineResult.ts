/**
 * Engine confidence and review-state helpers.
 *
 * Every AI engine output carries a confidence score and review state.
 * This module centralises the threshold logic so engines, mutations,
 * and UI components all share a single source of truth.
 */

/**
 * Confidence threshold for auto-approval.
 * Outputs >= this threshold are automatically approved.
 * Outputs below require human review.
 */
export const AUTO_APPROVE_THRESHOLD = 0.8;

/**
 * Determine the initial review state based on confidence score.
 */
export function determineReviewState(
  confidence: number,
): "approved" | "pending" {
  return confidence >= AUTO_APPROVE_THRESHOLD ? "approved" : "pending";
}

/**
 * Confidence level categories for UI rendering.
 */
export function confidenceLevel(
  confidence: number,
): "high" | "medium" | "low" {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

/**
 * Valid engine types in the system.
 */
export const ENGINE_TYPES = [
  "pricing",
  "comps",
  "leverage",
  "offer",
  "cost",
  "doc_parser",
  "copilot",
  "case_synthesis",
] as const;

export type EngineType = (typeof ENGINE_TYPES)[number];
