/**
 * Property comparison state helpers (KIN-883).
 *
 * Convex-side mirror of `src/lib/dashboard/comparison.ts`. Keep in sync.
 */

export const MAX_COMPARISON_SIZE = 6;

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

export interface ComparisonRecord {
  propertyId: string;
  dealRoomId?: string;
}

export interface ComparisonRow {
  propertyId: string;
  dealRoomId: string | null;
  source: "property" | "dealRoom";
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
  order: number;
}

export interface ComparisonState {
  buyerId: string;
  records: ComparisonRecord[];
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

export function addToComparison(
  state: ComparisonState,
  record: ComparisonRecord,
  now: string,
  position?: number,
): ComparisonMutationResult {
  if (state.records.some((entry) => entry.propertyId === record.propertyId)) {
    return {
      ok: false,
      error: {
        code: "already_in_comparison",
        message: `Property ${record.propertyId} is already in this comparison.`,
      },
    };
  }
  if (state.records.length >= MAX_COMPARISON_SIZE) {
    return {
      ok: false,
      error: {
        code: "comparison_full",
        message: `Cannot add more than ${MAX_COMPARISON_SIZE} properties to a comparison.`,
      },
    };
  }

  const next = state.records.slice();
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
    next.splice(position, 0, record);
  } else {
    next.push(record);
  }

  return { ok: true, state: { ...state, records: next, updatedAt: now } };
}

export function removeFromComparison(
  state: ComparisonState,
  propertyId: string,
  now: string,
): ComparisonMutationResult {
  if (!state.records.some((entry) => entry.propertyId === propertyId)) {
    return {
      ok: false,
      error: {
        code: "not_in_comparison",
        message: `Property ${propertyId} is not in this comparison.`,
      },
    };
  }
  const next = state.records.filter((entry) => entry.propertyId !== propertyId);
  return { ok: true, state: { ...state, records: next, updatedAt: now } };
}

export function reorderComparison(
  state: ComparisonState,
  fromPosition: number,
  toPosition: number,
  now: string,
): ComparisonMutationResult {
  const len = state.records.length;
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
    return { ok: true, state };
  }
  const next = state.records.slice();
  const [moved] = next.splice(fromPosition, 1);
  next.splice(toPosition, 0, moved);
  return { ok: true, state: { ...state, records: next, updatedAt: now } };
}

export function resetComparison(
  state: ComparisonState,
  now: string,
): ComparisonState {
  return { ...state, records: [], updatedAt: now };
}

export function buildComparisonRows(
  state: ComparisonState,
  propertyById: Map<string, ComparisonPropertyInput>,
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (const record of state.records) {
    const property = propertyById.get(record.propertyId);
    if (!property) continue;
    rows.push(projectRow(record, property, rows.length));
  }
  return rows;
}

export function projectRow(
  record: ComparisonRecord,
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
    dealRoomId: record.dealRoomId ?? null,
    source: record.dealRoomId ? "dealRoom" : "property",
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
