import posthog from "posthog-js";
import { stripPii } from "@/lib/security/pii-guard";

/**
 * Canonical analytics event names for buyer-v2.
 * Every tracked event must be listed here for type safety.
 */
export type AnalyticsEvent =
  // Funnel events (public site -> deal room -> transaction)
  | "link_pasted"
  | "teaser_viewed"
  | "registration_started"
  | "registration_completed"
  | "deal_room_entered"
  | "tour_requested"
  | "tour_completed"
  | "offer_started"
  | "offer_submitted"
  | "contract_signed"
  | "deal_closed"
  // Engagement events
  | "calculator_used"
  | "pricing_faq_viewed"
  | "document_uploaded"
  | "document_downloaded"
  | "ai_analysis_viewed"
  // System events
  | "error_boundary_hit"
  | "health_check_failed"
  | "worker_job_failed";

/**
 * Track an analytics event with PII-safe properties.
 * All properties are automatically stripped of PII fields before capture.
 */
export function track(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>
) {
  const safeProps = properties ? stripPii(properties) : undefined;

  if (typeof window !== "undefined" && posthog.__loaded) {
    posthog.capture(event, safeProps);
  }

  // Also log in development for debugging
  if (process.env.NODE_ENV === "development") {
    console.log(`[analytics] ${event}`, safeProps);
  }
}

/**
 * Track a funnel step with position metadata.
 * Adds step_number and funnel_name to the event properties.
 */
export function trackFunnelStep(
  event: AnalyticsEvent,
  funnelName: string,
  stepNumber: number,
  properties?: Record<string, unknown>
) {
  track(event, {
    ...properties,
    funnel_name: funnelName,
    step_number: stepNumber,
  });
}
