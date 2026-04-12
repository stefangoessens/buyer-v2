// ═══════════════════════════════════════════════════════════════════════════
// Buyer Update Events (KIN-837) — CONVEX MIRROR
//
// This file is a hand-maintained mirror of
// `src/lib/dealroom/buyer-events.ts`. Convex's tsconfig cannot import
// modules from `../src`, so the pure helpers have to live twice: once for
// the Next.js app, once for Convex functions.
//
// RULES:
//   - Any change here MUST be mirrored in src/lib/dealroom/buyer-events.ts
//   - Any change there MUST be mirrored here
//   - Keep the module small — ideally the only thing that ever changes is
//     the ordered list of event types and their default priorities
//   - The exported shapes (types + function signatures) are identical
//
// The module is pure: no DB, no auth, no time-dependent logic. Good for
// unit tests and for use from both query and mutation handlers.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Machine-readable buyer event types. These align with the analytics
 * taxonomy (KIN-860) but not every event fires both a buyer update and an
 * analytics event — an analytics event can fire without surfacing to the
 * buyer, and a buyer update can be emitted from server-side reasoning
 * that never shows up in analytics.
 */
export type BuyerEventType =
  | "tour_confirmed"
  | "tour_canceled"
  | "tour_reminder"
  | "agent_assigned"
  | "offer_countered"
  | "offer_accepted"
  | "offer_rejected"
  | "agreement_received"
  | "agreement_signed_reminder"
  | "document_ready"
  | "milestone_upcoming"
  | "price_changed"
  | "new_comp_arrived"
  | "ai_analysis_ready"
  | "broker_message";

/**
 * Event lifecycle status.
 *   - pending: newly emitted, not yet seen by buyer
 *   - seen: buyer has viewed it (but not dismissed)
 *   - resolved: dismissed or acted upon
 *   - superseded: replaced by a newer event on the same dedupeKey
 */
export type BuyerEventStatus = "pending" | "seen" | "resolved" | "superseded";

/** Priority ordering used by the UI when listing events. */
export type BuyerEventPriority = "low" | "normal" | "high";

/**
 * Build the canonical dedupe key for an event type + reference ID pair.
 * Two events with the same key for the same (buyerId, dealRoomId) are
 * treated as duplicates and coalesced rather than inserted twice.
 *
 * Examples:
 *   makeDedupeKey("tour_confirmed", "tour_abc") => "tour_confirmed:tour_abc"
 *   makeDedupeKey("offer_countered", "offer_123") => "offer_countered:offer_123"
 */
export function makeDedupeKey(
  eventType: BuyerEventType,
  referenceId: string,
): string {
  return `${eventType}:${referenceId}`;
}

/**
 * Default priority mapping for event types — used when the caller doesn't
 * override. Most events are "normal"; time-sensitive reminders and terminal
 * offer states are "high"; passive market updates are "low".
 */
export function defaultPriorityFor(eventType: BuyerEventType): BuyerEventPriority {
  switch (eventType) {
    case "tour_reminder":
    case "agreement_signed_reminder":
    case "milestone_upcoming":
      return "high";
    case "broker_message":
    case "offer_accepted":
    case "offer_rejected":
      return "high";
    case "price_changed":
    case "new_comp_arrived":
      return "low";
    default:
      return "normal";
  }
}

/**
 * Decide how a dedupe collision should be handled. Returns one of:
 *   - "bump": the existing record should be bumped (increment dedupeCount,
 *     update lastDedupedAt, refresh title/body to the latest content)
 *   - "ignore": the existing record already covers this update, skip.
 *
 * All event types currently use "bump" — the existing record absorbs the
 * new content and the dedupeCount tracks how many times the same update
 * has been sent. Separate event types (e.g. tour_canceled vs tour_confirmed)
 * have different dedupeKeys and therefore different records, so this
 * function is only consulted when the keys collide.
 */
export function dedupeResolutionFor(
  _eventType: BuyerEventType,
): "bump" | "ignore" {
  return "bump";
}

/**
 * Numeric rank for a priority — higher is more important. Exposed so the
 * UI and the backend agree on ordering without duplicating a map.
 */
export function priorityRank(priority: BuyerEventPriority): number {
  switch (priority) {
    case "high":
      return 3;
    case "normal":
      return 2;
    case "low":
      return 1;
  }
}

/**
 * Compare two events for display ordering: highest priority first, then
 * most recent `emittedAt` first. Stable when the two events are equal.
 * Written as a pure function so both the Convex query surface and the
 * Next.js client can reuse the same sort.
 */
export function compareEventsForDisplay(
  a: { priority: BuyerEventPriority; emittedAt: string },
  b: { priority: BuyerEventPriority; emittedAt: string },
): number {
  const pa = priorityRank(a.priority);
  const pb = priorityRank(b.priority);
  if (pa !== pb) return pb - pa;
  // Newer first — ISO 8601 strings compare lexicographically.
  if (a.emittedAt > b.emittedAt) return -1;
  if (a.emittedAt < b.emittedAt) return 1;
  return 0;
}

/**
 * Whether the given status represents a "live" event that the buyer can
 * still act on. Resolved and superseded events are historical.
 */
export function isLiveStatus(status: BuyerEventStatus): boolean {
  return status === "pending" || status === "seen";
}

/**
 * Complete list of every known event type. Handy for exhaustive tests
 * and for building admin dropdowns without re-typing the union.
 */
export const ALL_BUYER_EVENT_TYPES: readonly BuyerEventType[] = [
  "tour_confirmed",
  "tour_canceled",
  "tour_reminder",
  "agent_assigned",
  "offer_countered",
  "offer_accepted",
  "offer_rejected",
  "agreement_received",
  "agreement_signed_reminder",
  "document_ready",
  "milestone_upcoming",
  "price_changed",
  "new_comp_arrived",
  "ai_analysis_ready",
  "broker_message",
] as const;
