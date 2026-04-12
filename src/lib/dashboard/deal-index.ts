/**
 * Dashboard deal index read model (KIN-842).
 *
 * Pure TS — used by both the Convex backend query and the Next.js
 * dashboard UI. Takes raw deal room + property documents and produces
 * the typed summary shape the dashboard list consumes.
 *
 * Rules:
 *   - Active: any non-terminal status (intake → closing). These are
 *     the deals that need ongoing attention and surface at the top of
 *     the dashboard.
 *   - Recent: terminal statuses (closed, withdrawn). Surface below
 *     active with a "Recent" section header.
 *   - Buyer-facing rows strip internal fields (e.g. broker-only notes,
 *     internal review state). The filter runs at the boundary so
 *     downstream consumers can't accidentally leak staff-only data.
 *   - Partial hydration: if the linked property doc is missing (e.g.
 *     still in extraction), the row still renders with status-only
 *     fields and a `hydrated: false` flag instead of dropping entirely.
 */

export type DealStatus =
  | "intake"
  | "analysis"
  | "tour_scheduled"
  | "offer_prep"
  | "offer_sent"
  | "under_contract"
  | "closing"
  | "closed"
  | "withdrawn";

export type DealCategory = "active" | "recent";

/** Terminal statuses that move a deal into the "recent" section. */
export const TERMINAL_STATUSES: readonly DealStatus[] = ["closed", "withdrawn"];

/** Order used to sort active deals from most urgent → least. */
export const URGENCY_ORDER: readonly DealStatus[] = [
  "offer_sent", // time-critical: waiting on seller response
  "closing", // time-critical: closing date approaching
  "under_contract", // under contract but pre-close
  "offer_prep", // buyer drafting offer
  "tour_scheduled", // scheduled showing
  "analysis", // still reviewing property
  "intake", // just dropped in
  "closed", // terminal
  "withdrawn", // terminal
];

/** Input: the minimum fields we need from a deal room doc. */
export interface RawDealRoom {
  _id: string;
  propertyId: string;
  buyerId: string;
  status: DealStatus;
  accessLevel: "anonymous" | "registered" | "full";
  createdAt: string;
  updatedAt: string;
}

/** Input: the minimum fields we need from a property doc. */
export interface RawProperty {
  _id: string;
  canonicalId: string;
  address: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    zip: string;
    formatted?: string;
  };
  listPrice?: number;
  beds?: number;
  bathsFull?: number;
  bathsHalf?: number;
  sqftLiving?: number;
  photoUrls?: string[];
}

/** A single dashboard row — buyer-safe, presentation-ready. */
export interface DashboardDealRow {
  dealRoomId: string;
  propertyId: string;
  status: DealStatus;
  category: DealCategory;
  urgencyRank: number; // 0 = most urgent
  addressLine: string; // "123 Main St, Miami, FL 33131"
  listPrice: number | null;
  beds: number | null;
  baths: number | null; // full + 0.5 per half
  sqft: number | null;
  primaryPhotoUrl: string | null;
  accessLevel: "anonymous" | "registered" | "full";
  updatedAt: string;
  /** False when the linked property doc is missing — UI shows a skeleton. */
  hydrated: boolean;
}

/** Summary badges shown at the top of the dashboard. */
export interface DashboardSummary {
  activeCount: number;
  recentCount: number;
  mostUrgentStatus: DealStatus | null;
  oldestActiveDays: number | null;
  hasAnyDeals: boolean;
}

/** Full dashboard payload returned by the backend query. */
export interface DashboardDealIndex {
  active: DashboardDealRow[];
  recent: DashboardDealRow[];
  summary: DashboardSummary;
}

/**
 * Classify a deal status as active or recent.
 */
export function categorize(status: DealStatus): DealCategory {
  return TERMINAL_STATUSES.includes(status) ? "recent" : "active";
}

/**
 * Return the urgency rank for a deal status (0 = most urgent). Used
 * for sorting the active section on the dashboard so time-critical
 * deals float to the top.
 */
export function urgencyRank(status: DealStatus): number {
  const index = URGENCY_ORDER.indexOf(status);
  return index === -1 ? URGENCY_ORDER.length : index;
}

/**
 * Build a DashboardDealRow from raw deal room + property. The property
 * may be undefined (not yet hydrated) — we still render a row, just
 * with fewer fields.
 */
export function buildDashboardRow(
  deal: RawDealRoom,
  property: RawProperty | undefined,
): DashboardDealRow {
  const hydrated = property !== undefined;

  const addressLine = property
    ? property.address.formatted ??
      formatAddressLine(property.address)
    : "Property details loading…";

  const baths = property
    ? combineBaths(property.bathsFull, property.bathsHalf)
    : null;

  return {
    dealRoomId: deal._id,
    propertyId: deal.propertyId,
    status: deal.status,
    category: categorize(deal.status),
    urgencyRank: urgencyRank(deal.status),
    addressLine,
    listPrice: property?.listPrice ?? null,
    beds: property?.beds ?? null,
    baths,
    sqft: property?.sqftLiving ?? null,
    primaryPhotoUrl:
      property?.photoUrls && property.photoUrls.length > 0
        ? property.photoUrls[0]
        : null,
    accessLevel: deal.accessLevel,
    updatedAt: deal.updatedAt,
    hydrated,
  };
}

/**
 * Build the full dashboard deal index payload from a set of deal rooms
 * and their (possibly partial) property docs. `propertyById` is a lookup
 * map the caller builds from a single query.
 */
export function buildDealIndex(
  deals: RawDealRoom[],
  propertyById: Map<string, RawProperty>,
): DashboardDealIndex {
  const rows = deals.map((d) =>
    buildDashboardRow(d, propertyById.get(d.propertyId)),
  );

  const active = rows
    .filter((r) => r.category === "active")
    .sort((a, b) => {
      // Primary: urgency rank ascending (most urgent first).
      if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank;
      // Secondary: most recently updated first.
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const recent = rows
    .filter((r) => r.category === "recent")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const summary = buildSummary(rows);

  return { active, recent, summary };
}

/**
 * Build the summary badges shown at the top of the dashboard.
 */
export function buildSummary(rows: DashboardDealRow[]): DashboardSummary {
  const activeRows = rows.filter((r) => r.category === "active");
  const recentRows = rows.filter((r) => r.category === "recent");

  const mostUrgent = activeRows
    .slice()
    .sort((a, b) => a.urgencyRank - b.urgencyRank)[0];

  let oldestActiveDays: number | null = null;
  if (activeRows.length > 0) {
    const now = Date.now();
    const oldestMs = Math.min(
      ...activeRows.map((r) => new Date(r.updatedAt).getTime()),
    );
    oldestActiveDays = Math.floor((now - oldestMs) / (1000 * 60 * 60 * 24));
  }

  return {
    activeCount: activeRows.length,
    recentCount: recentRows.length,
    mostUrgentStatus: mostUrgent?.status ?? null,
    oldestActiveDays,
    hasAnyDeals: rows.length > 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────────

function formatAddressLine(addr: RawProperty["address"]): string {
  const parts: string[] = [];
  parts.push(addr.street);
  if (addr.unit) parts.push(`Unit ${addr.unit}`);
  parts.push(`${addr.city}, ${addr.state} ${addr.zip}`);
  return parts.join(", ");
}

function combineBaths(full?: number, half?: number): number | null {
  if (full === undefined && half === undefined) return null;
  return (full ?? 0) + (half ?? 0) * 0.5;
}
