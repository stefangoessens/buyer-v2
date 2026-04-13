/**
 * Pure decision logic for the watchlist state (KIN-986).
 *
 * Every function is pure — no Convex calls, no IO. The Convex backend
 * mirrors the read-model helpers in `convex/lib/watchlist.ts` so tests
 * can validate the full decision tree without a live database.
 */

import {
  MAX_NOTE_LENGTH,
  MAX_WATCHLIST_SIZE,
  getWatchlistBuyer,
  getWatchlistOrderingMetadata,
  type AddWatchlistResult,
  type BuyerWatchlistRow,
  type BuyerWatchlistView,
  type InternalWatchlistRow,
  type RemoveWatchlistResult,
  type ReorderWatchlistResult,
  type WatchlistEntry,
  type WatchlistMissingField,
  type WatchlistPropertyInput,
  type WatchlistValidation,
  type WatchlistValidationError,
} from "./types";

// MARK: - Validation

/**
 * Validate a single entry's fields. Used by both create and patch paths to
 * fail loud before the write lands.
 */
export function validateEntry(entry: WatchlistEntry): WatchlistValidation {
  const errors: WatchlistValidationError[] = [];

  if (!entry.id || entry.id.trim() === "") {
    errors.push({ kind: "missingField", field: "id" });
  }
  if (!entry.buyerId || entry.buyerId.trim() === "") {
    errors.push({ kind: "missingField", field: "buyerId" });
  }
  if (!entry.propertyId || entry.propertyId.trim() === "") {
    errors.push({ kind: "missingField", field: "propertyId" });
  }
  if (typeof entry.position !== "number" || entry.position < 0) {
    errors.push({ kind: "invalidPosition", position: entry.position });
  }
  if (entry.note !== undefined && entry.note.length > MAX_NOTE_LENGTH) {
    errors.push({
      kind: "noteTooLong",
      length: entry.note.length,
      max: MAX_NOTE_LENGTH,
    });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Validate a full list as a group. Catches:
 * - capacity overflow
 * - duplicate propertyIds (a property should only appear once)
 * - per-entry errors via `validateEntry`
 */
export function validateWatchlist(
  entries: readonly WatchlistEntry[],
): WatchlistValidation {
  const errors: WatchlistValidationError[] = [];

  if (entries.length > MAX_WATCHLIST_SIZE) {
    errors.push({
      kind: "watchlistFull",
      size: entries.length,
      max: MAX_WATCHLIST_SIZE,
    });
  }

  const seen = new Set<string>();
  for (const entry of entries) {
    const perEntry = validateEntry(entry);
    if (!perEntry.ok) {
      errors.push(...perEntry.errors);
    }
    if (seen.has(entry.propertyId)) {
      errors.push({
        kind: "duplicatePropertyId",
        propertyId: entry.propertyId,
      });
    }
    seen.add(entry.propertyId);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// MARK: - Add

/**
 * Add a property to the watchlist. Idempotent — adding a property that's
 * already there returns `alreadyInList` with the existing entry so the
 * caller doesn't surface an error to the buyer.
 *
 * New entries land at the end of the list (highest position). The buyer
 * can reorder later via `reorderWatchlist`.
 */
export function addToWatchlist(
  entries: readonly WatchlistEntry[],
  propertyId: string,
  buyerId: string,
  newId: string,
  now: string,
  note?: string,
): AddWatchlistResult {
  const existing = entries.find((entry) => entry.propertyId === propertyId);
  if (existing) {
    return { kind: "alreadyInList", entry: existing };
  }
  if (entries.length >= MAX_WATCHLIST_SIZE) {
    return {
      kind: "full",
      size: entries.length,
      max: MAX_WATCHLIST_SIZE,
    };
  }

  const trimmedNote = note?.trim();
  const entry: WatchlistEntry = {
    id: newId,
    buyerId,
    propertyId,
    position: entries.length,
    note: trimmedNote && trimmedNote.length > 0 ? trimmedNote : undefined,
    addedAt: now,
    updatedAt: now,
  };
  return { kind: "added", entry };
}

// MARK: - Remove

/**
 * Remove a property from the watchlist. Returns the new ordering
 * (positions recomputed) or a `notFound` verdict if the property isn't
 * in the list.
 */
export function removeFromWatchlist(
  entries: readonly WatchlistEntry[],
  propertyId: string,
  now: string,
):
  | (RemoveWatchlistResult & {
      kind: "removed";
      reorderedEntries: WatchlistEntry[];
    })
  | (RemoveWatchlistResult & { kind: "notFound" }) {
  const target = entries.find((entry) => entry.propertyId === propertyId);
  if (!target) {
    return { kind: "notFound", propertyId };
  }

  const reorderedEntries = entries
    .filter((entry) => entry.propertyId !== propertyId)
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((entry, index) => ({
      ...entry,
      position: index,
      updatedAt: now,
    }));

  return { kind: "removed", removedId: target.id, reorderedEntries };
}

// MARK: - Reorder

/**
 * Reorder the watchlist to match `orderedEntryIds`. The new order must be
 * a permutation of the existing entry ids — any missing, extra, or
 * duplicate ids return a typed `invalidOrder` error.
 */
export function reorderWatchlist(
  entries: readonly WatchlistEntry[],
  orderedEntryIds: readonly string[],
  now: string,
): ReorderWatchlistResult {
  const currentIds = new Set(entries.map((entry) => entry.id));
  const newIds = new Set(orderedEntryIds);

  if (newIds.size !== orderedEntryIds.length) {
    return { kind: "invalidOrder", reason: "duplicateIds" };
  }
  for (const id of currentIds) {
    if (!newIds.has(id)) {
      return { kind: "invalidOrder", reason: "missingIds" };
    }
  }
  for (const id of orderedEntryIds) {
    if (!currentIds.has(id)) {
      return { kind: "invalidOrder", reason: "extraIds" };
    }
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const reordered = orderedEntryIds.map((id, index) => {
    const original = byId.get(id)!;
    if (original.position === index) {
      return original;
    }
    return {
      ...original,
      position: index,
      updatedAt: now,
    };
  });

  return { kind: "reordered", entries: reordered };
}

// MARK: - Set note

/**
 * Replace the note on a watchlist entry. A caller that passes `undefined`
 * or an empty string clears the note.
 */
export function setEntryNote(
  entries: readonly WatchlistEntry[],
  propertyId: string,
  note: string | undefined,
  now: string,
): WatchlistEntry | undefined {
  const target = entries.find((entry) => entry.propertyId === propertyId);
  if (!target) {
    return undefined;
  }

  const trimmed = note?.trim();
  if (trimmed !== undefined && trimmed.length > MAX_NOTE_LENGTH) {
    throw new Error(`watchlist note exceeds ${MAX_NOTE_LENGTH} char budget`);
  }

  return {
    ...target,
    note: trimmed && trimmed.length > 0 ? trimmed : undefined,
    updatedAt: now,
  };
}

// MARK: - Buyer entry projection

/**
 * Project a raw entry into the buyer entry view. Kept as a pure function so
 * tests can assert the shape without instantiating a Convex runtime.
 */
export function projectBuyerView(entry: WatchlistEntry): BuyerWatchlistView {
  return {
    id: entry.id,
    propertyId: entry.propertyId,
    position: entry.position,
    note: entry.note,
    addedAt: entry.addedAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Bulk projection of stored entries — sorts by position ascending so the
 * buyer always sees a stable ordering.
 */
export function projectBuyerWatchlist(
  entries: readonly WatchlistEntry[],
): BuyerWatchlistView[] {
  return entries
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(projectBuyerView);
}

// MARK: - Canonical-property row projection

/**
 * Build the internal watchlist rows from stored entries plus canonical
 * property data. Missing properties are skipped so a stale watchlist entry
 * cannot break the buyer-facing surface.
 */
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

/** Strip internal-only fields from the derived row before returning it to a buyer. */
export function projectBuyerRow(row: InternalWatchlistRow): BuyerWatchlistRow {
  const { buyerId: _buyerId, canonicalId: _canonicalId, ...buyerRow } = row;
  return buyerRow;
}

/** Convenience wrapper to build buyer-safe rows directly from entries + properties. */
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

// MARK: - Selectors

/** Count the number of watchlist entries for a buyer. */
export function countEntries(entries: readonly WatchlistEntry[]): number {
  return entries.length;
}

/** True when the buyer's watchlist is at the hard cap. */
export function isFull(entries: readonly WatchlistEntry[]): boolean {
  return entries.length >= MAX_WATCHLIST_SIZE;
}

/** Return the entry for a given property id, or undefined if not in the watchlist. */
export function findByPropertyId(
  entries: readonly WatchlistEntry[],
  propertyId: string,
): WatchlistEntry | undefined {
  return entries.find((entry) => entry.propertyId === propertyId);
}
