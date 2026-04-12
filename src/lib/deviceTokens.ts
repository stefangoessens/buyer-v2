/**
 * Pure functions for device token resolution.
 *
 * Extracted from convex/deviceTokens.ts so the decision logic can be
 * unit-tested in Vitest without a live Convex instance.
 *
 * The Convex mutation duplicates this logic inline because Convex files
 * cannot import from `src/lib` (convex/tsconfig.json only scopes the
 * convex directory). Keep both implementations in sync.
 */

export type DeviceTokenRecord = {
  _id: string;
  userId: string;
  token: string;
  deviceId?: string;
  invalidatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RegisterTokenInput = {
  token: string;
  deviceId?: string;
  now: string;
};

export type RegisterDecision =
  | {
      kind: "insert";
      token: string;
      deviceId?: string;
      createdAt: string;
      updatedAt: string;
    }
  | {
      kind: "replace";
      rowId: string;
      token: string;
      updatedAt: string;
    }
  | {
      kind: "reactivate";
      rowId: string;
      token: string;
      updatedAt: string;
    };

/**
 * Decide how to upsert a device token registration for a user.
 *
 * Match priority:
 *   1. An existing row with the same deviceId (preferred — a device's IDFV
 *      is stable across app installs and reliably identifies the hardware).
 *   2. Fallback: an existing row with the same token string (covers the
 *      case where deviceId wasn't sent, e.g. pre-IDFV legacy client).
 *
 * Decision:
 *   - match + not invalidated → `replace` (update token/metadata)
 *   - match + invalidated     → `reactivate` (clear invalidatedAt, update)
 *   - no match                → `insert`
 */
export function resolveRegisterDecision(
  existing: DeviceTokenRecord[],
  input: RegisterTokenInput
): RegisterDecision {
  const match = findMatchingRow(existing, input);

  if (!match) {
    return {
      kind: "insert",
      token: input.token,
      deviceId: input.deviceId,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  if (match.invalidatedAt) {
    return {
      kind: "reactivate",
      rowId: match._id,
      token: input.token,
      updatedAt: input.now,
    };
  }

  return {
    kind: "replace",
    rowId: match._id,
    token: input.token,
    updatedAt: input.now,
  };
}

function findMatchingRow(
  existing: DeviceTokenRecord[],
  input: RegisterTokenInput
): DeviceTokenRecord | undefined {
  // 1. Prefer deviceId match (most reliable)
  if (input.deviceId) {
    const byDevice = existing.find((row) => row.deviceId === input.deviceId);
    if (byDevice) return byDevice;
  }

  // 2. Fallback to exact token match (same hardware, pre-IDFV client,
  //    or a reinstall that happens to keep the APNS token)
  return existing.find((row) => row.token === input.token);
}

/**
 * Identify stale rows that reference the same APNS token string but
 * belong to a different logical device (different rowId).
 *
 * This runs after a register/replace so we can invalidate any other
 * rows that incidentally share the same token — an edge case that
 * occurs if APNS re-issues a token to a different device installation.
 */
export function tokensToInvalidate(
  allForUser: DeviceTokenRecord[],
  input: { token: string; keepRowId?: string }
): string[] {
  return allForUser
    .filter(
      (row) => row.token === input.token && row._id !== input.keepRowId
    )
    .map((row) => row._id);
}

/**
 * Return only rows that are not marked invalidated.
 * Treats both `undefined` and `null` as "active".
 */
export function filterActiveTokens(
  tokens: DeviceTokenRecord[]
): DeviceTokenRecord[] {
  return tokens.filter(
    (row) => row.invalidatedAt === undefined || row.invalidatedAt === null
  );
}
