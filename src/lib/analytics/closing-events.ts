/**
 * Closing command center analytics (KIN-1080).
 *
 * Thin wrapper over posthog-js. Events are fire-and-forget and guarded
 * behind a window check so server components and unit tests can import
 * this module without crashing.
 */

import posthog from "posthog-js";

export const CLOSING_EVENTS = {
  COMMAND_CENTER_VIEWED: "closing_command_center_viewed",
  TAB_VIEWED: "closing_tab_viewed",
  TASK_STATUS_CHANGED: "closing_task_status_changed",
  TASK_DOCUMENT_UPLOADED: "closing_task_document_uploaded",
  TASK_NOTE_ADDED: "closing_task_note_added",
  TASK_BLOCKED_ON_EXTERNAL: "closing_task_blocked_on_external",
  TASK_DEPENDENCY_UNBLOCKED: "closing_task_dependency_unblocked",
  BROKER_BOARD_VIEWED: "closing_broker_board_viewed",
  AMENDMENT_TRIGGERED_RESYNC: "closing_amendment_triggered_resync",
  WIRE_FRAUD_BANNER_VIEWED: "closing_wire_fraud_banner_viewed",
  BUYER_NOTIFICATION_EMITTED: "closing_buyer_notification_emitted",
} as const;

export type ClosingEventKey = keyof typeof CLOSING_EVENTS;

export function trackClosingEvent(
  event: ClosingEventKey,
  props?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  posthog.capture(CLOSING_EVENTS[event], props);
}
