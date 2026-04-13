/**
 * Watchlist state helpers (KIN-986).
 *
 * Convex-side mirror of `src/lib/watchlist/logic.ts`. Keep in sync.
 */

export const MAX_WATCHLIST_SIZE = 50;
export const MAX_NOTE_LENGTH = 280;

export interface WatchlistBuyer {
  buyerId: string;
}

export interface WatchlistPropertyReference {
  propertyId: string;
}

export interface WatchlistOrderingMetadata {
  position: number;
  addedAt: string;
  updatedAt: string;
}

export interface WatchlistEntry {
  id: string;
  buyerId: string;
  propertyId: string;
  position: number;
  note?: string;
  addedAt: string;
  updatedAt: string;
}

export function getWatchlistBuyer(entry: WatchlistEntry): WatchlistBuyer {
  return { buyerId: entry.buyerId };
}

export function getWatchlistPropertyReference(
  entry: WatchlistEntry,
): WatchlistPropertyReference {
  return { propertyId: entry.propertyId };
}

export function getWatchlistOrderingMetadata(
  entry: WatchlistEntry,
): WatchlistOrderingMetadata {
  return {
    position: entry.position,
    addedAt: entry.addedAt,
    updatedAt: entry.updatedAt,
  };
}

export type WatchlistPropertyStatus =
  | "active"
  | "pending"
  | "contingent"
  | "sold"
  | "withdrawn";

export interface WatchlistPropertyInput {
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
  status: WatchlistPropertyStatus;
  listPrice?: number;
  beds?: number;
  bathsFull?: number;
  bathsHalf?: number;
  sqftLiving?: number;
  photoUrls?: string[];
  propertyType?: string;
}

export type WatchlistRowDetailState = "partial" | "complete";
export type WatchlistMissingField =
  | "listPrice"
  | "beds"
  | "baths"
  | "sqft"
  | "primaryPhoto";

export interface InternalWatchlistRow {
  entryId: string;
  buyerId: string;
  propertyId: string;
  canonicalId: string;
  position: number;
  note?: string;
  addedAt: string;
  updatedAt: string;
  addressLine: string;
  status: WatchlistPropertyStatus;
  listPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  primaryPhotoUrl: string | null;
  propertyType: string | null;
  detailState: WatchlistRowDetailState;
  missingFields: WatchlistMissingField[];
}

export type BuyerWatchlistRow = Omit<
  InternalWatchlistRow,
  "buyerId" | "canonicalId"
>;

export function buildWatchlistRows(
  entries: readonly WatchlistEntry[],
  propertyById: Map<string, WatchlistPropertyInput>,
): InternalWatchlistRow[] {
  const orderedEntries = entries
    .slice()
    .sort((left, right) => left.position - right.position);

  const rows: InternalWatchlistRow[] = [];
  for (const entry of orderedEntries) {
    const property = propertyById.get(entry.propertyId);
    if (!property) {
      continue;
    }
    rows.push(projectInternalRow(entry, property));
  }
  return rows;
}

export function projectBuyerRow(row: InternalWatchlistRow): BuyerWatchlistRow {
  const { buyerId: _buyerId, canonicalId: _canonicalId, ...buyerRow } = row;
  return buyerRow;
}

export function buildBuyerWatchlistRows(
  entries: readonly WatchlistEntry[],
  propertyById: Map<string, WatchlistPropertyInput>,
): BuyerWatchlistRow[] {
  return buildWatchlistRows(entries, propertyById).map(projectBuyerRow);
}

function projectInternalRow(
  entry: WatchlistEntry,
  property: WatchlistPropertyInput,
): InternalWatchlistRow {
  const ordering = getWatchlistOrderingMetadata(entry);
  const buyer = getWatchlistBuyer(entry);
  const { detailState, missingFields } = computeDetailState(property);

  return {
    entryId: entry.id,
    buyerId: buyer.buyerId,
    propertyId: property._id,
    canonicalId: property.canonicalId,
    position: ordering.position,
    note: entry.note,
    addedAt: ordering.addedAt,
    updatedAt: ordering.updatedAt,
    addressLine:
      property.address.formatted ?? formatAddressLine(property.address),
    status: property.status,
    listPrice: property.listPrice ?? null,
    beds: property.beds ?? null,
    baths: combineBaths(property.bathsFull, property.bathsHalf),
    sqft: property.sqftLiving ?? null,
    primaryPhotoUrl:
      property.photoUrls && property.photoUrls.length > 0
        ? property.photoUrls[0]
        : null,
    propertyType: property.propertyType ?? null,
    detailState,
    missingFields,
  };
}

function computeDetailState(
  property: WatchlistPropertyInput,
): {
  detailState: InternalWatchlistRow["detailState"];
  missingFields: WatchlistMissingField[];
} {
  const missingFields: WatchlistMissingField[] = [];
  if (property.listPrice === undefined) {
    missingFields.push("listPrice");
  }
  if (property.beds === undefined) {
    missingFields.push("beds");
  }
  if (property.bathsFull === undefined && property.bathsHalf === undefined) {
    missingFields.push("baths");
  }
  if (property.sqftLiving === undefined) {
    missingFields.push("sqft");
  }
  if (!property.photoUrls || property.photoUrls.length === 0) {
    missingFields.push("primaryPhoto");
  }

  return {
    detailState: missingFields.length > 0 ? "partial" : "complete",
    missingFields,
  };
}

function formatAddressLine(address: WatchlistPropertyInput["address"]): string {
  const parts: string[] = [];
  parts.push(address.street);
  if (address.unit) {
    parts.push(`Unit ${address.unit}`);
  }
  parts.push(`${address.city}, ${address.state} ${address.zip}`);
  return parts.join(", ");
}

function combineBaths(full?: number, half?: number): number | null {
  if (full === undefined && half === undefined) {
    return null;
  }
  return (full ?? 0) + (half ?? 0) * 0.5;
}
