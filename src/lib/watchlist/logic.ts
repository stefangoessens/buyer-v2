/**
 * Pure decision logic for the watchlist state (KIN-849).
 *
 * Every function is pure — no Convex calls, no IO. The Convex
 * mutation layer composes these helpers so the full decision
 * tree is exercised in Vitest without a live backend.
 */

import {
  MAX_NOTE_LENGTH,
  MAX_WATCHLIST_SIZE,
  type AddWatchlistResult,
  type BuyerWatchlistView,
  type RemoveWatchlistResult,
  type ReorderWatchlistResult,
  type WatchlistEntry,
  type WatchlistValidation,
  type WatchlistValidationError,
} from "./types";

// MARK: - Validation

/**
 * Validate a single entry's fields. Used by both create and patch
 * paths to fail loud before the write lands.
 */
export function validateEntry(
  entry: WatchlistEntry
): WatchlistValidation {
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
 *   - capacity overflow
 *   - duplicate propertyIds (a property should only appear once)
 *   - per-entry errors via `validateEntry`
 */
export function validateWatchlist(
  entries: readonly WatchlistEntry[]
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
    if (!perEntry.ok) errors.push(...perEntry.errors);
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
 * Add a property to the watchlist. Idempotent — adding a property
 * that's already there returns `alreadyInList` with the existing
 * entry so the caller doesn't surface an "error" to the buyer.
 *
 * New entries land at the END of the list (highest position). The
 * buyer can reorder later via `reorderWatchlist`.
 */
export function addToWatchlist(
  entries: readonly WatchlistEntry[],
  propertyId: string,
  buyerId: string,
  newId: string,
  now: string,
  note?: string
): AddWatchlistResult {
  const existing = entries.find((e) => e.propertyId === propertyId);
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
 * (positions recomputed) or a `notFound` verdict if the property
 * isn't in the list.
 *
 * Note: returns the REMOVED id and the NEW list separately so the
 * Convex mutation layer can delete the row + patch positions in
 * one transaction.
 */
export function removeFromWatchlist(
  entries: readonly WatchlistEntry[],
  propertyId: string,
  now: string
):
  | (RemoveWatchlistResult & { kind: "removed" } & {
      reorderedEntries: WatchlistEntry[];
    })
  | (RemoveWatchlistResult & { kind: "notFound" }) {
  const target = entries.find((e) => e.propertyId === propertyId);
  if (!target) {
    return { kind: "notFound", propertyId };
  }
  const rest = entries.filter((e) => e.propertyId !== propertyId);
  // Recompute positions so the list is always contiguous 0..N-1.
  const reorderedEntries = rest
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e, index) => ({
      ...e,
      position: index,
      updatedAt: now,
    }));
  return { kind: "removed", removedId: target.id, reorderedEntries };
}

// MARK: - Reorder

/**
 * Reorder the watchlist to match `orderedEntryIds`. The new order
 * must be a permutation of the existing entry ids — any missing,
 * extra, or duplicate ids return a typed `invalidOrder` error so
 * the Convex mutation can fail loud.
 *
 * Returns the new entry list with positions 0..N-1 assigned by
 * the caller-supplied order. `updatedAt` is refreshed on every
 * entry that moved.
 */
export function reorderWatchlist(
  entries: readonly WatchlistEntry[],
  orderedEntryIds: readonly string[],
  now: string
): ReorderWatchlistResult {
  const currentIds = new Set(entries.map((e) => e.id));
  const newIdsSet = new Set(orderedEntryIds);

  // Duplicate detection in the new order
  if (newIdsSet.size !== orderedEntryIds.length) {
    return { kind: "invalidOrder", reason: "duplicateIds" };
  }
  // Missing: current has ids not in new order
  for (const id of currentIds) {
    if (!newIdsSet.has(id)) {
      return { kind: "invalidOrder", reason: "missingIds" };
    }
  }
  // Extra: new order has ids not in current
  for (const id of orderedEntryIds) {
    if (!currentIds.has(id)) {
      return { kind: "invalidOrder", reason: "extraIds" };
    }
  }

  const byId = new Map(entries.map((e) => [e.id, e]));
  const reordered: WatchlistEntry[] = orderedEntryIds.map((id, index) => {
    const original = byId.get(id)!;
    if (original.position === index) return original;
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
 * Replace the note on a watchlist entry. Returns the updated
 * entry or undefined if the property isn't in the list. A caller
 * that passes `undefined` or an empty string clears the note.
 *
 * Enforces the 280-char note budget; callers that exceed it get a
 * thrown error so the UI surfaces the problem clearly.
 */
export function setEntryNote(
  entries: readonly WatchlistEntry[],
  propertyId: string,
  note: string | undefined,
  now: string
): WatchlistEntry | undefined {
  const target = entries.find((e) => e.propertyId === propertyId);
  if (!target) return undefined;
  const trimmed = note?.trim();
  if (trimmed !== undefined && trimmed.length > MAX_NOTE_LENGTH) {
    throw new Error(
      `watchlist note exceeds ${MAX_NOTE_LENGTH} char budget`
    );
  }
  return {
    ...target,
    note: trimmed && trimmed.length > 0 ? trimmed : undefined,
    updatedAt: now,
  };
}

// MARK: - Buyer view projection

/**
 * Project a raw entry into the buyer view. Kept as a pure
 * function so tests can assert the shape without instantiating
 * a Convex runtime.
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
 * Bulk projection — sorts by position ascending so the buyer
 * always sees a stable ordering.
 */
export function projectBuyerWatchlist(
  entries: readonly WatchlistEntry[]
): BuyerWatchlistView[] {
  return entries
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(projectBuyerView);
}

// MARK: - Selectors

/**
 * Count the number of watchlist entries for a buyer. Exposed here
 * so the Convex layer and tests share one implementation.
 */
export function countEntries(
  entries: readonly WatchlistEntry[]
): number {
  return entries.length;
}

/**
 * True when the buyer's watchlist is at the hard cap.
 */
export function isFull(entries: readonly WatchlistEntry[]): boolean {
  return entries.length >= MAX_WATCHLIST_SIZE;
}

/**
 * Return the entry for a given property id, or undefined if not
 * in the watchlist.
 */
export function findByPropertyId(
  entries: readonly WatchlistEntry[],
  propertyId: string
): WatchlistEntry | undefined {
  return entries.find((e) => e.propertyId === propertyId);
}
