/**
 * Property comparison state (KIN-843).
 *
 * Pure TS — used by Convex backend and the dashboard comparison UI.
 * A comparison is a buyer-scoped, ordered list of property IDs the
 * user wants to compare side-by-side. The backend stores just the
 * order and metadata; the comparison row projection happens from
 * shared canonical property data so there's a single source of truth
 * for what a "property card" looks like.
 *
 * Operations: add, remove, reorder, reset. All enforce a cap on the
 * comparison set size so the UI stays manageable.
 */

/** Maximum number of properties a buyer can compare at once. */
export const MAX_COMPARISON_SIZE = 6;

/** Input: the minimum fields needed from a property doc for comparison. */
export interface ComparisonPropertyInput {
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
  lotSize?: number;
  yearBuilt?: number;
  photoUrls?: string[];
  propertyType?: string;
  hoaFee?: number;
  pool?: boolean;
  waterfrontType?: string;
}

/** Output: the projected comparison row the dashboard consumes. */
export interface ComparisonRow {
  propertyId: string;
  addressLine: string;
  primaryPhotoUrl: string | null;
  listPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSize: number | null;
  yearBuilt: number | null;
  pricePerSqft: number | null;
  propertyType: string | null;
  hoaFee: number | null;
  hasPool: boolean;
  waterfront: boolean;
  order: number; // position in the comparison list, 0-indexed
}

/** The shape of a comparison record as stored in backend state. */
export interface ComparisonState {
  buyerId: string;
  propertyIds: string[]; // ordered
  createdAt: string;
  updatedAt: string;
}

export type ComparisonErrorCode =
  | "empty_comparison"
  | "property_not_found"
  | "already_in_comparison"
  | "comparison_full"
  | "invalid_position"
  | "not_in_comparison";

export interface ComparisonError {
  code: ComparisonErrorCode;
  message: string;
}

export type ComparisonMutationResult<T = ComparisonState> =
  | { ok: true; state: T }
  | { ok: false; error: ComparisonError };

// ───────────────────────────────────────────────────────────────────────────
// Mutations (pure — callers persist the returned state)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Add a property to the comparison. Rejects duplicates and respects the
 * MAX_COMPARISON_SIZE cap. New properties append to the end of the list
 * unless `position` is specified (0-indexed).
 */
export function addToComparison(
  state: ComparisonState,
  propertyId: string,
  now: string,
  position?: number,
): ComparisonMutationResult {
  if (state.propertyIds.includes(propertyId)) {
    return {
      ok: false,
      error: {
        code: "already_in_comparison",
        message: `Property ${propertyId} is already in this comparison.`,
      },
    };
  }
  if (state.propertyIds.length >= MAX_COMPARISON_SIZE) {
    return {
      ok: false,
      error: {
        code: "comparison_full",
        message: `Cannot add more than ${MAX_COMPARISON_SIZE} properties to a comparison.`,
      },
    };
  }

  const next = state.propertyIds.slice();
  if (position !== undefined) {
    if (position < 0 || position > next.length) {
      return {
        ok: false,
        error: {
          code: "invalid_position",
          message: `Position ${position} is out of range [0, ${next.length}].`,
        },
      };
    }
    next.splice(position, 0, propertyId);
  } else {
    next.push(propertyId);
  }

  return {
    ok: true,
    state: { ...state, propertyIds: next, updatedAt: now },
  };
}

/**
 * Remove a property from the comparison. No-op errors if the property
 * isn't in the set.
 */
export function removeFromComparison(
  state: ComparisonState,
  propertyId: string,
  now: string,
): ComparisonMutationResult {
  if (!state.propertyIds.includes(propertyId)) {
    return {
      ok: false,
      error: {
        code: "not_in_comparison",
        message: `Property ${propertyId} is not in this comparison.`,
      },
    };
  }

  const next = state.propertyIds.filter((id) => id !== propertyId);
  return {
    ok: true,
    state: { ...state, propertyIds: next, updatedAt: now },
  };
}

/**
 * Reorder the comparison by moving a property from one position to
 * another (both 0-indexed). The list length is preserved.
 */
export function reorderComparison(
  state: ComparisonState,
  fromPosition: number,
  toPosition: number,
  now: string,
): ComparisonMutationResult {
  const len = state.propertyIds.length;
  if (fromPosition < 0 || fromPosition >= len) {
    return {
      ok: false,
      error: {
        code: "invalid_position",
        message: `From position ${fromPosition} is out of range [0, ${len - 1}].`,
      },
    };
  }
  if (toPosition < 0 || toPosition >= len) {
    return {
      ok: false,
      error: {
        code: "invalid_position",
        message: `To position ${toPosition} is out of range [0, ${len - 1}].`,
      },
    };
  }
  if (fromPosition === toPosition) {
    // No-op reorder — return current state unchanged.
    return { ok: true, state };
  }

  const next = state.propertyIds.slice();
  const [moved] = next.splice(fromPosition, 1);
  next.splice(toPosition, 0, moved);
  return {
    ok: true,
    state: { ...state, propertyIds: next, updatedAt: now },
  };
}

/**
 * Reset the comparison — clears all properties but keeps the record so
 * the buyer's subscription to changes stays intact.
 */
export function resetComparison(
  state: ComparisonState,
  now: string,
): ComparisonState {
  return { ...state, propertyIds: [], updatedAt: now };
}

// ───────────────────────────────────────────────────────────────────────────
// Read-model projection
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build the ordered list of comparison rows from a state record and a
 * property lookup map. Missing properties are skipped silently — the
 * UI shouldn't crash if a property was deleted while the comparison
 * was open in another tab. The caller can detect skipped entries by
 * comparing length of the result vs `state.propertyIds.length`.
 */
export function buildComparisonRows(
  state: ComparisonState,
  propertyById: Map<string, ComparisonPropertyInput>,
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (let i = 0; i < state.propertyIds.length; i++) {
    const id = state.propertyIds[i];
    const property = propertyById.get(id);
    if (!property) continue;
    rows.push(projectRow(property, i));
  }
  return rows;
}

/**
 * Project a single property into the safe comparison row shape.
 * Internal or PII-ish fields (listing agent contact, raw descriptions,
 * portal estimates, listing party) are intentionally excluded — this
 * is a buyer-facing view.
 */
export function projectRow(
  property: ComparisonPropertyInput,
  order: number,
): ComparisonRow {
  const addressLine =
    property.address.formatted ?? formatAddressLine(property.address);

  const baths = combineBaths(property.bathsFull, property.bathsHalf);
  const pricePerSqft =
    property.listPrice && property.sqftLiving && property.sqftLiving > 0
      ? Math.round(property.listPrice / property.sqftLiving)
      : null;

  return {
    propertyId: property._id,
    addressLine,
    primaryPhotoUrl:
      property.photoUrls && property.photoUrls.length > 0
        ? property.photoUrls[0]
        : null,
    listPrice: property.listPrice ?? null,
    beds: property.beds ?? null,
    baths,
    sqft: property.sqftLiving ?? null,
    lotSize: property.lotSize ?? null,
    yearBuilt: property.yearBuilt ?? null,
    pricePerSqft,
    propertyType: property.propertyType ?? null,
    hoaFee: property.hoaFee ?? null,
    hasPool: property.pool === true,
    waterfront:
      property.waterfrontType !== undefined &&
      property.waterfrontType !== "none" &&
      property.waterfrontType !== "",
    order,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────────

function formatAddressLine(
  addr: ComparisonPropertyInput["address"],
): string {
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
