/**
 * Typed watchlist state (KIN-849).
 *
 * A watchlist is a per-buyer ordered list of candidate properties
 * the buyer wants to revisit. Distinct from:
 *   - `propertyComparisons` (KIN-843) — side-by-side spec diff
 *   - deal rooms — active representation
 *
 * Each entry carries the property id plus an optional note the
 * buyer can attach for themselves ("visited 4/15, liked the yard").
 *
 * Pure decision logic lives in `src/lib/watchlist/logic.ts` so the
 * full decision tree is exercised in Vitest. The Convex mutation
 * layer mirrors the same rules.
 */

// MARK: - Constants

/**
 * Hard cap on a single buyer's watchlist. 50 is more than enough
 * for any individual buyer's active search; larger lists are
 * better served by saved-searches (future KIN card). The limit
 * also acts as a runaway guard.
 */
export const MAX_WATCHLIST_SIZE = 50;

/**
 * Max length for an entry note. Keeps UI render budgets sane and
 * reflects that notes are a buyer shorthand, not an essay.
 */
export const MAX_NOTE_LENGTH = 280;

// MARK: - Entry

/**
 * One watchlist entry. `position` is a 0-based index the server
 * maintains — entries always render in position order. `note` is
 * buyer-authored free text shown only to the buyer who owns the
 * watchlist (brokers do not see buyer notes).
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

// MARK: - Buyer view

/**
 * Buyer-facing projection — drops the internal `buyerId` and
 * renames `addedAt`/`updatedAt` to camelCase display fields the
 * UI can consume directly. The view never carries internal-only
 * fields because the schema has none; the projection exists
 * symmetric to other state modules in the codebase so the read
 * path is consistent.
 */
export interface BuyerWatchlistView {
  id: string;
  propertyId: string;
  position: number;
  note?: string;
  addedAt: string;
  updatedAt: string;
}

// MARK: - Validation

export type WatchlistValidationError =
  | { kind: "missingField"; field: keyof WatchlistEntry }
  | { kind: "noteTooLong"; length: number; max: number }
  | { kind: "invalidPosition"; position: number }
  | { kind: "watchlistFull"; size: number; max: number }
  | { kind: "duplicatePropertyId"; propertyId: string };

export type WatchlistValidation =
  | { ok: true }
  | { ok: false; errors: WatchlistValidationError[] };

// MARK: - Mutation result types

/**
 * Typed result from `addToWatchlist` — surfaces whether the entry
 * was freshly added, was already in the list (idempotent), or was
 * rejected because the list is at capacity.
 */
export type AddWatchlistResult =
  | { kind: "added"; entry: WatchlistEntry }
  | { kind: "alreadyInList"; entry: WatchlistEntry }
  | { kind: "full"; size: number; max: number };

/**
 * Typed result from `removeFromWatchlist` — `notFound` handled as
 * a no-op the UI can surface separately from the success path.
 */
export type RemoveWatchlistResult =
  | { kind: "removed"; removedId: string }
  | { kind: "notFound"; propertyId: string };

/**
 * Reorder result — `invalidOrder` when the new position list is
 * not a permutation of the existing ids.
 */
export type ReorderWatchlistResult =
  | { kind: "reordered"; entries: readonly WatchlistEntry[] }
  | {
      kind: "invalidOrder";
      reason: "missingIds" | "extraIds" | "duplicateIds";
    };
