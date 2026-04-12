/**
 * Dashboard deal index read model (KIN-842).
 *
 * Convex-side mirror of `src/lib/dashboard/deal-index.ts`. Convex can't
 * import from `../src`, so the pure compute logic is duplicated here.
 * Keep the two files in sync — the test suite lives on the src version.
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

export interface DashboardDealRow {
  dealRoomId: string;
  propertyId: string;
  status: DealStatus;
  category: DealCategory;
  urgencyRank: number;
  addressLine: string;
  listPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  primaryPhotoUrl: string | null;
  accessLevel: "anonymous" | "registered" | "full";
  updatedAt: string;
  hydrated: boolean;
}

export interface DashboardSummary {
  activeCount: number;
  recentCount: number;
  mostUrgentStatus: DealStatus | null;
  oldestActiveDays: number | null;
  hasAnyDeals: boolean;
}

export interface DashboardDealIndex {
  active: DashboardDealRow[];
  recent: DashboardDealRow[];
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
  const hydrated = property !== undefined;
  const addressLine = property
    ? property.address.formatted ?? formatAddressLine(property.address)
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
      if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const recent = rows
    .filter((r) => r.category === "recent")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { active, recent, summary: buildSummary(rows) };
}

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
