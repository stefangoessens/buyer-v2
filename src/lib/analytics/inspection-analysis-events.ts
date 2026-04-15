/**
 * Inspection AI analytics (KIN-1081).
 *
 * Thin wrapper over posthog-js. Mirrors closing-events.ts and
 * disclosure-events.ts. Events are fire-and-forget and guarded behind a
 * window check so server components and unit tests can import this
 * module without crashing.
 */

import posthog from "posthog-js";

export const INSPECTION_EVENTS = {
  PACKET_UPLOAD_STARTED: "inspection_packet_upload_started",
  PACKET_UPLOAD_COMPLETED: "inspection_packet_upload_completed",
  ANALYSIS_STARTED: "inspection_analysis_started",
  ANALYSIS_COMPLETED: "inspection_analysis_completed",
  ANALYSIS_FAILED: "inspection_analysis_failed",
  FINDINGS_RENDERED: "inspection_findings_rendered",
  FINDING_EXPANDED: "inspection_finding_expanded",
  FINDING_CHAT_OPENED: "inspection_finding_chat_opened",
  LIFE_SAFETY_ACKNOWLEDGED: "inspection_life_safety_acknowledged",
  NEGOTIATION_SUMMARY_VIEWED: "inspection_negotiation_summary_viewed",
  REPAIR_ADDENDUM_DRAFT_REQUESTED: "inspection_repair_addendum_draft_requested",
  SPECIALIST_CONSULT_REQUESTED: "inspection_specialist_consult_requested",
  DEADLINE_WARNING_SHOWN: "inspection_deadline_warning_shown",
  COST_ESTIMATE_BROKER_OVERRIDDEN: "inspection_cost_estimate_broker_overridden",
} as const;

export type InspectionEventKey = keyof typeof INSPECTION_EVENTS;

export function trackInspectionEvent(
  event: InspectionEventKey,
  props?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  posthog.capture(INSPECTION_EVENTS[event], props);
}
