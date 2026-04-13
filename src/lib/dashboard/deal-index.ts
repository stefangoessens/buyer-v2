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
 *   - Explicit detail state: rows distinguish between loading (no
 *     property doc yet), partial (property exists but buyer-facing
 *     summary fields are still missing), and complete.
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
export type DashboardRowDetailState = "loading" | "partial" | "complete";
export type DashboardMissingField =
  | "listPrice"
  | "beds"
  | "baths"
  | "sqft"
  | "primaryPhoto";

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

/** Shared buyer-safe fields present on every dashboard row. */
export interface DashboardDealRowBase {
  dealRoomId: string;
  propertyId: string;
  status: DealStatus;
  urgencyRank: number; // 0 = most urgent
  addressLine: string; // "123 Main St, Miami, FL 33131"
  listPrice: number | null;
  beds: number | null;
  baths: number | null; // full + 0.5 per half
  sqft: number | null;
  primaryPhotoUrl: string | null;
  accessLevel: "anonymous" | "registered" | "full";
  updatedAt: string;
  /**
   * Explicit property-summary readiness for the row:
   *   - loading: linked property doc missing entirely
   *   - partial: property exists but some buyer-facing summary fields missing
   *   - complete: summary row has all buyer-facing fields
   */
  detailState: DashboardRowDetailState;
  /** Buyer-facing summary fields not yet available on this row. */
  missingFields: DashboardMissingField[];
}

export interface DashboardActiveDealRow extends DashboardDealRowBase {
  category: "active";
}

export interface DashboardRecentDealRow extends DashboardDealRowBase {
  category: "recent";
}

/** A single dashboard row — buyer-safe, presentation-ready. */
export type DashboardDealRow = DashboardActiveDealRow | DashboardRecentDealRow;

export interface DashboardSummaryBadge {
  kind:
    | "active_count"
    | "recent_count"
    | "most_urgent"
    | "oldest_active";
  label: string;
  tone: "primary" | "neutral" | "warning";
  value: string;
  isEmpty: boolean;
}

/** Summary badges shown at the top of the dashboard. */
export interface DashboardSummary {
  activeCount: number;
  recentCount: number;
  mostUrgentStatus: DealStatus | null;
  oldestActiveDays: number | null;
  hasAnyDeals: boolean;
  hasPartialDeals: boolean;
  badges: DashboardSummaryBadge[];
}

/** Full dashboard payload returned by the backend query. */
export interface DashboardDealIndex {
  active: DashboardActiveDealRow[];
  recent: DashboardRecentDealRow[];
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
 * with explicit `detailState` / `missingFields` markers.
 */
export function buildDashboardRow(
  deal: RawDealRoom,
  property: RawProperty | undefined,
): DashboardDealRow {
  const { detailState, missingFields } = computeDetailState(property);
  const category = categorize(deal.status);

  const addressLine = property
    ? property.address.formatted ??
      formatAddressLine(property.address)
    : "Property details loading…";

  const baths = property
    ? combineBaths(property.bathsFull, property.bathsHalf)
    : null;

  const baseRow: DashboardDealRowBase = {
    dealRoomId: deal._id,
    propertyId: deal.propertyId,
    status: deal.status,
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
    detailState,
    missingFields,
  };

  if (category === "active") {
    return { ...baseRow, category: "active" };
  }

  return { ...baseRow, category: "recent" };
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
  const rows: DashboardDealRow[] = deals.map((d) =>
    buildDashboardRow(d, propertyById.get(d.propertyId)),
  );

  const active = rows
    .filter((r): r is DashboardActiveDealRow => r.category === "active")
    .sort((a, b) => {
      // Primary: urgency rank ascending (most urgent first).
      if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank;
      // Secondary: most recently updated first.
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const recent = rows
    .filter((r): r is DashboardRecentDealRow => r.category === "recent")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const summary = buildSummary(rows);

  return { active, recent, summary };
}

/**
 * Build the summary badges shown at the top of the dashboard.
 */
export function buildSummary(rows: DashboardDealRow[]): DashboardSummary {
  const activeRows = rows.filter(
    (r): r is DashboardActiveDealRow => r.category === "active",
  );
  const recentRows = rows.filter(
    (r): r is DashboardRecentDealRow => r.category === "recent",
  );

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

  const badges = buildSummaryBadges({
    activeCount: activeRows.length,
    recentCount: recentRows.length,
    mostUrgentStatus: mostUrgent?.status ?? null,
    oldestActiveDays,
  });

  return {
    activeCount: activeRows.length,
    recentCount: recentRows.length,
    mostUrgentStatus: mostUrgent?.status ?? null,
    oldestActiveDays,
    hasAnyDeals: rows.length > 0,
    hasPartialDeals: rows.some((row) => row.detailState !== "complete"),
    badges,
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

function computeDetailState(
  property: RawProperty | undefined,
): {
  detailState: DashboardRowDetailState;
  missingFields: DashboardMissingField[];
} {
  if (!property) {
    return {
      detailState: "loading",
      missingFields: ["listPrice", "beds", "baths", "sqft", "primaryPhoto"],
    };
  }

  const missingFields: DashboardMissingField[] = [];
  if (property.listPrice === undefined) missingFields.push("listPrice");
  if (property.beds === undefined) missingFields.push("beds");
  if (property.bathsFull === undefined && property.bathsHalf === undefined) {
    missingFields.push("baths");
  }
  if (property.sqftLiving === undefined) missingFields.push("sqft");
  if (!property.photoUrls || property.photoUrls.length === 0) {
    missingFields.push("primaryPhoto");
  }

  return {
    detailState: missingFields.length === 0 ? "complete" : "partial",
    missingFields,
  };
}

function buildSummaryBadges(args: {
  activeCount: number;
  recentCount: number;
  mostUrgentStatus: DealStatus | null;
  oldestActiveDays: number | null;
}): DashboardSummaryBadge[] {
  return [
    {
      kind: "active_count",
      label: "Active",
      tone: args.activeCount > 0 ? "primary" : "neutral",
      value: String(args.activeCount),
      isEmpty: args.activeCount === 0,
    },
    {
      kind: "recent_count",
      label: "Recent",
      tone: args.recentCount > 0 ? "neutral" : "neutral",
      value: String(args.recentCount),
      isEmpty: args.recentCount === 0,
    },
    {
      kind: "most_urgent",
      label: "Most urgent",
      tone: args.mostUrgentStatus ? "warning" : "neutral",
      value: args.mostUrgentStatus
        ? formatDealStatusLabel(args.mostUrgentStatus)
        : "None",
      isEmpty: args.mostUrgentStatus === null,
    },
    {
      kind: "oldest_active",
      label: "Oldest active",
      tone: args.oldestActiveDays !== null ? "warning" : "neutral",
      value:
        args.oldestActiveDays === null ? "None" : `${args.oldestActiveDays}d`,
      isEmpty: args.oldestActiveDays === null,
    },
  ];
}

export function formatDealStatusLabel(status: DealStatus): string {
  switch (status) {
    case "intake":
      return "Intake";
    case "analysis":
      return "Analysis";
    case "tour_scheduled":
      return "Tour scheduled";
    case "offer_prep":
      return "Offer prep";
    case "offer_sent":
      return "Offer sent";
    case "under_contract":
      return "Under contract";
    case "closing":
      return "Closing";
    case "closed":
      return "Closed";
    case "withdrawn":
      return "Withdrawn";
  }
}
