/**
 * Typed watchlist state (KIN-986).
 *
 * A watchlist is a per-buyer ordered list of candidate properties the
 * buyer wants to revisit. The persisted state stores the buyer/property
 * relationship and ordering metadata; buyer-facing rows are derived from
 * the shared canonical property record so the UI never has to join raw
 * property documents client-side.
 */

// MARK: - Constants

/**
 * Hard cap on a single buyer's watchlist. 50 is more than enough for any
 * individual buyer's active search and acts as a runaway guard.
 */
export const MAX_WATCHLIST_SIZE = 50;

/**
 * Max length for an entry note. Keeps UI render budgets sane and reflects
 * that notes are buyer shorthand, not a long-form document.
 */
export const MAX_NOTE_LENGTH = 280;

// MARK: - Stored state entities

/** Buyer-scoped ownership reference for a watchlist entry. */
export interface WatchlistBuyer {
  buyerId: string;
}

/** Canonical property reference stored on a watchlist entry. */
export interface WatchlistPropertyReference {
  propertyId: string;
}

/** Server-maintained ordering metadata for one entry. */
export interface WatchlistOrderingMetadata {
  position: number;
  addedAt: string;
  updatedAt: string;
}

/**
 * One watchlist entry in backend state. `position` is a 0-based index the
 * server maintains — entries always render in position order. `note` is
 * buyer-authored free text shown only to the owning buyer.
 */
export interface WatchlistEntry {
  /** Stable id assigned at insert time. */
  id: string;
  buyerId: string;
  propertyId: string;
  position: number;
  note?: string;
  addedAt: string;
  updatedAt: string;
}

/** Buyer entity projected from the stored entry shape. */
export function getWatchlistBuyer(entry: WatchlistEntry): WatchlistBuyer {
  return { buyerId: entry.buyerId };
}

/** Property reference projected from the stored entry shape. */
export function getWatchlistPropertyReference(
  entry: WatchlistEntry,
): WatchlistPropertyReference {
  return { propertyId: entry.propertyId };
}

/** Ordering metadata projected from the stored entry shape. */
export function getWatchlistOrderingMetadata(
  entry: WatchlistEntry,
): WatchlistOrderingMetadata {
  return {
    position: entry.position,
    addedAt: entry.addedAt,
    updatedAt: entry.updatedAt,
  };
}

// MARK: - Buyer entry view

/**
 * Buyer-facing projection of the stored watchlist entry. This drops the
 * internal buyer ownership field while preserving entry order + note.
 */
export interface BuyerWatchlistView {
  id: string;
  propertyId: string;
  position: number;
  note?: string;
  addedAt: string;
  updatedAt: string;
}

// MARK: - Canonical property projection

export type WatchlistPropertyStatus =
  | "active"
  | "pending"
  | "contingent"
  | "sold"
  | "withdrawn";

/** Minimum canonical property fields required to build a watchlist row. */
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

/**
 * Internal row shape derived from the shared canonical property record.
 * `buyerId` and `canonicalId` remain internal-only so caller-specific
 * projections can decide whether those fields are safe to surface.
 */
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

/**
 * Buyer-safe row shape. Ownership metadata and internal canonical ids are
 * removed at the boundary so buyer callers cannot read them.
 */
export type BuyerWatchlistRow = Omit<
  InternalWatchlistRow,
  "buyerId" | "canonicalId"
>;

// MARK: - Validation

export type WatchlistValidationField =
  | "id"
  | "buyerId"
  | "propertyId"
  | "position";

export type WatchlistValidationError =
  | { kind: "missingField"; field: WatchlistValidationField }
  | { kind: "noteTooLong"; length: number; max: number }
  | { kind: "invalidPosition"; position: number }
  | { kind: "watchlistFull"; size: number; max: number }
  | { kind: "duplicatePropertyId"; propertyId: string };

export type WatchlistValidation =
  | { ok: true }
  | { ok: false; errors: WatchlistValidationError[] };

// MARK: - Mutation result types

export type AddWatchlistResult =
  | { kind: "added"; entry: WatchlistEntry }
  | { kind: "alreadyInList"; entry: WatchlistEntry }
  | { kind: "full"; size: number; max: number };

export type RemoveWatchlistResult =
  | { kind: "removed"; removedId: string }
  | { kind: "notFound"; propertyId: string };

export type ReorderWatchlistResult =
  | { kind: "reordered"; entries: readonly WatchlistEntry[] }
  | {
      kind: "invalidOrder";
      reason: "missingIds" | "extraIds" | "duplicateIds";
    };
