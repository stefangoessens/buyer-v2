/**
 * Deal-room share link (KIN-853).
 *
 * Pure TS state machine + validators for the "share my deal room"
 * feature. A buyer creates a scoped share link for a single deal room
 * and sends it to a collaborator (spouse, parent, co-investor, etc.).
 * The collaborator resolves the link and gets a narrow, read-mostly
 * view of that one deal room — they cannot enumerate other deal rooms
 * or take lifecycle actions (signing, offering, etc.).
 *
 * Lifecycle:
 *
 *   created → active → (revoked | expired)
 *
 * "Active" is a derived state: a link is active if its stored `status`
 * is "active" AND its `expiresAt` is in the future (or null for
 * no-expiry links). `computeStatus()` turns raw row state into the
 * derived status — resolve/revoke paths should always go through this
 * helper instead of reading `row.status` directly.
 *
 * Scope is intentionally small today — just which sections of the
 * deal room the collaborator can see. If we add richer permission
 * grants later (e.g. "can post a comment"), the scope type is the
 * place to extend.
 */

export type ShareLinkStoredStatus = "active" | "revoked";

export type ShareLinkDerivedStatus = "active" | "revoked" | "expired";

export type ShareLinkScope =
  | "summary_only"
  | "summary_and_documents"
  | "full_read";

export interface RawShareLink {
  _id: string;
  dealRoomId: string;
  createdByUserId: string;
  slug: string;
  scope: ShareLinkScope;
  status: ShareLinkStoredStatus;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
}

export interface ResolvedShareLink {
  linkId: string;
  dealRoomId: string;
  scope: ShareLinkScope;
  derivedStatus: ShareLinkDerivedStatus;
  accessCount: number;
  lastAccessedAt: string | null;
}

export type ResolveReason =
  | "not_found"
  | "revoked"
  | "expired";

// ───────────────────────────────────────────────────────────────────────────
// Slug generation — URL-safe, unguessable
// ───────────────────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe share-link slug. 24 chars of base64url entropy is
 * well above the "can't brute force" threshold — 144 bits of randomness.
 * The caller provides the RNG so tests can inject a deterministic source.
 */
export function generateShareLinkSlug(
  randomBytes: (n: number) => Uint8Array,
): string {
  const bytes = randomBytes(18); // 18 * 8 = 144 bits
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  // Build base64 from raw bytes manually so this works in both the
  // Convex runtime (no Buffer) and the test harness (node).
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++] ?? 0;
    const b2 = bytes[i++] ?? 0;
    const b3 = bytes[i++] ?? 0;
    const triple = (b1 << 16) | (b2 << 8) | b3;
    output += alphabet[(triple >> 18) & 0x3f];
    output += alphabet[(triple >> 12) & 0x3f];
    output += alphabet[(triple >> 6) & 0x3f];
    output += alphabet[triple & 0x3f];
  }
  // 18-byte input → 24 base64 chars, no padding needed.
  return output;
}

// ───────────────────────────────────────────────────────────────────────────
// Status + resolve
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compute the derived status of a share link against the current time.
 * Expired links keep their stored status `active` — we don't rewrite
 * the row on the read path, only on revoke. "Expired" is a derivation.
 */
export function computeStatus(
  link: Pick<RawShareLink, "status" | "expiresAt">,
  now: string,
): ShareLinkDerivedStatus {
  if (link.status === "revoked") return "revoked";
  if (link.expiresAt && link.expiresAt <= now) return "expired";
  return "active";
}

/** Result of a resolve attempt — either a typed success or a typed failure. */
export type ResolveResult =
  | { ok: true; resolved: ResolvedShareLink }
  | { ok: false; reason: ResolveReason };

/**
 * Attempt to resolve a share link. Takes an already-loaded row (or null
 * if lookup missed) and the current time, and returns a typed result.
 * On success the resolved scope is included so the caller can use it
 * to gate downstream reads without re-parsing the row.
 */
export function resolveShareLink(
  link: RawShareLink | null,
  now: string,
): ResolveResult {
  if (!link) return { ok: false, reason: "not_found" };
  const derived = computeStatus(link, now);
  if (derived === "revoked") return { ok: false, reason: "revoked" };
  if (derived === "expired") return { ok: false, reason: "expired" };
  return {
    ok: true,
    resolved: {
      linkId: link._id,
      dealRoomId: link.dealRoomId,
      scope: link.scope,
      derivedStatus: "active",
      accessCount: link.accessCount,
      lastAccessedAt: link.lastAccessedAt,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Revoke — authorization check
// ───────────────────────────────────────────────────────────────────────────

export type RevokeActorRole = "buyer" | "broker" | "admin";

/**
 * Check if `actorUserId` (with `actorRole`) is allowed to revoke the
 * given link. Only the creator or staff may revoke. Returns a
 * `{ ok, reason }` tuple; callers surface `reason` verbatim.
 */
export function canRevoke(
  link: RawShareLink,
  actorUserId: string,
  actorRole: RevokeActorRole,
): { ok: true } | { ok: false; reason: string } {
  if (link.status === "revoked") {
    return { ok: false, reason: "Share link is already revoked." };
  }
  if (actorRole === "broker" || actorRole === "admin") {
    return { ok: true };
  }
  if (link.createdByUserId !== actorUserId) {
    return {
      ok: false,
      reason: "Only the buyer who created the link (or a broker/admin) can revoke it.",
    };
  }
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Presentation helpers
// ───────────────────────────────────────────────────────────────────────────

/** Buyer-facing row for the "manage my share links" UI. */
export interface ShareLinkRow {
  linkId: string;
  slug: string;
  scope: ShareLinkScope;
  derivedStatus: ShareLinkDerivedStatus;
  createdAt: string;
  expiresAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
}

/** Project a raw row into the buyer-facing list shape. */
export function projectListRow(
  link: RawShareLink,
  now: string,
): ShareLinkRow {
  return {
    linkId: link._id,
    slug: link.slug,
    scope: link.scope,
    derivedStatus: computeStatus(link, now),
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    accessCount: link.accessCount,
    lastAccessedAt: link.lastAccessedAt,
  };
}

/**
 * Sort share-link rows for the buyer's management UI: active first
 * (most-recently created first), then expired/revoked (most-recently
 * created first). Does not mutate the input.
 */
export function sortForManagement(rows: ShareLinkRow[]): ShareLinkRow[] {
  const statusOrder: Record<ShareLinkDerivedStatus, number> = {
    active: 0,
    expired: 1,
    revoked: 2,
  };
  return rows.slice().sort((a, b) => {
    const aStatus = statusOrder[a.derivedStatus];
    const bStatus = statusOrder[b.derivedStatus];
    if (aStatus !== bStatus) return aStatus - bStatus;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
