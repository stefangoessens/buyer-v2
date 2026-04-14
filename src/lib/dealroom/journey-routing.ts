// ═══════════════════════════════════════════════════════════════════════════
// Journey routing (KIN-1082)
//
// Shared href resolver that translates a deal room lifecycle status into the
// canonical wizard URL the buyer should land on when they tap a journey card.
//
// This is the only place that knows the routing map — the server canonical
// projection (convex/dashboard.ts `getJourneys`) calls this helper, the
// dashboard UI teasers call this helper, and the new /dashboard/journeys
// screen calls this helper. One source of truth keeps the three screens in
// sync when a new wizard step lands.
//
// KIN-1080 merged the /closing route, so `under_contract` + `closing` now
// resolve to `/property/<id>/closing` (NOT the legacy `/close`).
// ═══════════════════════════════════════════════════════════════════════════

import type { DealRoomLifecycleStatus } from "./journey-status-labels";

export interface ResolveJourneyHrefArgs {
  propertyId: string;
  status: DealRoomLifecycleStatus;
}

export function resolveJourneyHref({
  propertyId,
  status,
}: ResolveJourneyHrefArgs): string {
  if (status === "under_contract" || status === "closing") {
    return `/property/${propertyId}/closing`;
  }
  if (status === "offer_prep" || status === "offer_sent") {
    return `/property/${propertyId}/offer`;
  }
  if (status === "tour_scheduled") {
    return `/property/${propertyId}/disclosures`;
  }
  if (status === "analysis") {
    return `/property/${propertyId}/price`;
  }
  return `/property/${propertyId}/details`;
}
