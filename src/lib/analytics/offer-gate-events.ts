/**
 * Offer gate analytics (KIN-1077).
 *
 * Thin wrapper over posthog-js. Events are fire-and-forget and guarded
 * behind a window check so server components and unit tests can import
 * this module without crashing.
 */

import posthog from "posthog-js";

export const OFFER_GATE_EVENTS = {
  MODAL_SHOWN: "offer_gate_modal_shown",
  STAGE1_CTA_CLICKED: "offer_gate_stage1_cta_clicked",
  STAGE2_SHOWN: "offer_gate_stage2_shown",
  PHONE_SUBMITTED: "offer_gate_phone_submitted",
  PHONE_SUBMIT_ERROR: "offer_gate_phone_submit_error",
  WIZARD_UNLOCKED: "offer_wizard_unlocked",
  WIZARD_STEP_CHANGED: "offer_wizard_step_changed",
  SUBMIT_BLOCKED: "offer_submit_blocked",
  SUBMIT_ENABLED: "offer_submit_enabled",
  SUBMIT_CLICKED: "offer_submit_clicked",
} as const;

export type OfferGateEventKey = keyof typeof OFFER_GATE_EVENTS;

export function trackOfferGateEvent(
  event: OfferGateEventKey,
  props?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  posthog.capture(OFFER_GATE_EVENTS[event], props);
}
