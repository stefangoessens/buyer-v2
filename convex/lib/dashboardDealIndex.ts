/**
 * Dashboard deal index read model (KIN-842, extended by KIN-889).
 *
 * Convex-side mirror of `src/lib/dashboard/deal-index.ts`. Convex can't
 * import from `../src`, so the pure compute logic is duplicated here.
 * Keep the two files in sync — the test suite lives on the src version.
 * Rows explicitly distinguish loading / partial / complete summary state.
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

export const TERMINAL_STATUSES: readonly DealStatus[] = ["closed", "withdrawn"];

export const URGENCY_ORDER: readonly DealStatus[] = [
  "offer_sent",
  "closing",
  "under_contract",
  "offer_prep",
  "tour_scheduled",
  "analysis",
  "intake",
  "closed",
  "withdrawn",
];

export interface RawDealRoom {
  _id: string;
  propertyId: string;
  buyerId: string;
  status: DealStatus;
  accessLevel: "anonymous" | "registered" | "full";
  createdAt: string;
  updatedAt: string;
}

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

export interface DashboardDealRowBase {
  dealRoomId: string;
  propertyId: string;
  status: DealStatus;
  urgencyRank: number;
  addressLine: string;
  listPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  primaryPhotoUrl: string | null;
  accessLevel: "anonymous" | "registered" | "full";
  updatedAt: string;
  detailState: DashboardRowDetailState;
  missingFields: DashboardMissingField[];
}

export interface DashboardActiveDealRow extends DashboardDealRowBase {
  category: "active";
}

export interface DashboardRecentDealRow extends DashboardDealRowBase {
  category: "recent";
}

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

export interface DashboardSummary {
  activeCount: number;
  recentCount: number;
  mostUrgentStatus: DealStatus | null;
  oldestActiveDays: number | null;
  hasAnyDeals: boolean;
  hasPartialDeals: boolean;
  badges: DashboardSummaryBadge[];
}

export interface DashboardDealIndex {
  active: DashboardActiveDealRow[];
  recent: DashboardRecentDealRow[];
  summary: DashboardSummary;
}

export function categorize(status: DealStatus): DealCategory {
  return TERMINAL_STATUSES.includes(status) ? "recent" : "active";
}

export function urgencyRank(status: DealStatus): number {
  const index = URGENCY_ORDER.indexOf(status);
  return index === -1 ? URGENCY_ORDER.length : index;
}

export function buildDashboardRow(
  deal: RawDealRoom,
  property: RawProperty | undefined,
): DashboardDealRow {
  const { detailState, missingFields } = computeDetailState(property);
  const category = categorize(deal.status);
  const addressLine = property
    ? property.address.formatted ?? formatAddressLine(property.address)
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
      if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const recent = rows
    .filter((r): r is DashboardRecentDealRow => r.category === "recent")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { active, recent, summary: buildSummary(rows) };
}

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
      tone: "neutral",
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
