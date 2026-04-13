/**
 * Deal-room share link (KIN-853).
 *
 * Convex-side mirror of `src/lib/dealroom/share-link.ts`.
 * Keep in sync.
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

export type ResolveReason = "not_found" | "revoked" | "expired";

export function generateShareLinkSlug(
  randomBytes: (n: number) => Uint8Array,
): string {
  const bytes = randomBytes(18);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
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
  return output;
}

export function computeStatus(
  link: Pick<RawShareLink, "status" | "expiresAt">,
  now: string,
): ShareLinkDerivedStatus {
  if (link.status === "revoked") return "revoked";
  if (link.expiresAt) {
    const nowMs = parseInstant(now);
    const expiresMs = parseInstant(link.expiresAt);
    if (nowMs === null || expiresMs === null || nowMs >= expiresMs) {
      return "expired";
    }
  }
  return "active";
}

export type ResolveResult =
  | { ok: true; resolved: ResolvedShareLink }
  | { ok: false; reason: ResolveReason };

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

export type RevokeActorRole = "buyer" | "broker" | "admin";

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
      reason:
        "Only the buyer who created the link (or a broker/admin) can revoke it.",
    };
  }
  return { ok: true };
}

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
    const aCreatedAt = parseInstant(a.createdAt) ?? 0;
    const bCreatedAt = parseInstant(b.createdAt) ?? 0;
    return bCreatedAt - aCreatedAt;
  });
}

function parseInstant(iso: string): number | null {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}
