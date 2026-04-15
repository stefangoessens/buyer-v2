/**
 * Disclosure packet analytics (KIN-1078).
 *
 * Thin wrapper over posthog-js. Events are fire-and-forget and guarded
 * behind a window check so server components and unit tests can import
 * this module without crashing.
 */

import posthog from "posthog-js";

export const DISCLOSURE_EVENTS = {
  UPLOAD_STARTED: "disclosure_upload_started",
  UPLOAD_COMPLETED: "disclosure_upload_completed",
  UPLOAD_ERROR: "disclosure_upload_error",
  PROCESSING_STARTED: "disclosure_processing_started",
  PROCESSING_COMPLETED: "disclosure_processing_completed",
  PROCESSING_FAILED: "disclosure_processing_failed",
  FINDINGS_RENDERED: "disclosure_findings_rendered",
  FINDING_EXPANDED: "disclosure_finding_expanded",
  FINDING_CHAT_OPENED: "disclosure_finding_chat_opened",
  PACKET_REPLACED: "disclosure_packet_replaced",
  BROKER_REVIEW_QUEUED: "disclosure_broker_review_queued",
} as const;

export type DisclosureEventKey = keyof typeof DISCLOSURE_EVENTS;

export function trackDisclosureEvent(
  event: DisclosureEventKey,
  props?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  posthog.capture(DISCLOSURE_EVENTS[event], props);
}
