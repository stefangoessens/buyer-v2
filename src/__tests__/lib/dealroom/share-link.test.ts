import { describe, it, expect } from "vitest";
import {
  computeStatus,
  resolveShareLink,
  canRevoke,
  projectListRow,
  sortForManagement,
  generateShareLinkSlug,
  type RawShareLink,
  type ShareLinkRow,
} from "@/lib/dealroom/share-link";

const mk = (overrides: Partial<RawShareLink> = {}): RawShareLink => ({
  _id: "link_1",
  dealRoomId: "deal_1",
  createdByUserId: "user_buyer_1",
  slug: "abc123",
  scope: "summary_only",
  status: "active",
  createdAt: "2026-04-01T00:00:00.000Z",
  expiresAt: null,
  revokedAt: null,
  revokedByUserId: null,
  accessCount: 0,
  lastAccessedAt: null,
  ...overrides,
});

describe("generateShareLinkSlug", () => {
  it("produces a 24-char URL-safe string from 18 bytes of entropy", () => {
    const slug = generateShareLinkSlug(
      (n) => new Uint8Array(Array.from({ length: n }, (_, i) => i * 7 % 256)),
    );
    expect(slug.length).toBe(24);
    expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is deterministic when RNG is deterministic", () => {
    const rng = (n: number) => new Uint8Array(n).fill(42);
    expect(generateShareLinkSlug(rng)).toBe(generateShareLinkSlug(rng));
  });

  it("varies when RNG varies", () => {
    const a = generateShareLinkSlug((n) => new Uint8Array(n).fill(0));
    const b = generateShareLinkSlug((n) => new Uint8Array(n).fill(255));
    expect(a).not.toBe(b);
  });
});

describe("computeStatus", () => {
  it("returns active when stored active and no expiry", () => {
    expect(computeStatus(mk(), "2026-04-10T00:00:00.000Z")).toBe("active");
  });

  it("returns active when stored active and expiry is in the future", () => {
    expect(
      computeStatus(
        mk({ expiresAt: "2026-04-30T00:00:00.000Z" }),
        "2026-04-10T00:00:00.000Z",
      ),
    ).toBe("active");
  });

  it("returns expired when expiresAt is in the past", () => {
    expect(
      computeStatus(
        mk({ expiresAt: "2026-04-01T00:00:00.000Z" }),
        "2026-04-10T00:00:00.000Z",
      ),
    ).toBe("expired");
  });

  it("returns expired when expiresAt exactly equals now (boundary)", () => {
    expect(
      computeStatus(
        mk({ expiresAt: "2026-04-10T00:00:00.000Z" }),
        "2026-04-10T00:00:00.000Z",
      ),
    ).toBe("expired");
  });

  it("returns revoked when stored status is revoked, even if expiry is in the future", () => {
    expect(
      computeStatus(
        mk({ status: "revoked", expiresAt: "2027-01-01T00:00:00.000Z" }),
        "2026-04-10T00:00:00.000Z",
      ),
    ).toBe("revoked");
  });

  it("treats offset timestamps by real instant, not string order", () => {
    expect(
      computeStatus(
        mk({ expiresAt: "2028-04-12T20:30:00+01:00" }),
        "2028-04-12T19:45:00.000Z",
      ),
    ).toBe("expired");
  });

  it("fail-closes to expired when now is invalid", () => {
    expect(
      computeStatus(
        mk({ expiresAt: "2028-04-12T20:30:00+01:00" }),
        "not-a-timestamp",
      ),
    ).toBe("expired");
  });
});

describe("resolveShareLink", () => {
  const now = "2026-04-10T00:00:00.000Z";

  it("returns not_found for null", () => {
    const result = resolveShareLink(null, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("returns revoked for a revoked link", () => {
    const result = resolveShareLink(mk({ status: "revoked" }), now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("revoked");
  });

  it("returns expired for an expired link", () => {
    const result = resolveShareLink(
      mk({ expiresAt: "2026-04-01T00:00:00.000Z" }),
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("returns ok with scope for an active link", () => {
    const result = resolveShareLink(
      mk({ scope: "full_read", accessCount: 3, lastAccessedAt: "2026-04-08T00:00:00.000Z" }),
      now,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved.scope).toBe("full_read");
      expect(result.resolved.dealRoomId).toBe("deal_1");
      expect(result.resolved.derivedStatus).toBe("active");
      expect(result.resolved.accessCount).toBe(3);
      expect(result.resolved.lastAccessedAt).toBe("2026-04-08T00:00:00.000Z");
    }
  });
});

describe("canRevoke", () => {
  it("allows the creator to revoke", () => {
    expect(canRevoke(mk(), "user_buyer_1", "buyer").ok).toBe(true);
  });

  it("refuses a non-creator buyer", () => {
    const result = canRevoke(mk(), "user_buyer_2", "buyer");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("created the link");
  });

  it("allows a broker regardless of creator", () => {
    expect(canRevoke(mk(), "user_broker", "broker").ok).toBe(true);
  });

  it("allows an admin regardless of creator", () => {
    expect(canRevoke(mk(), "user_admin", "admin").ok).toBe(true);
  });

  it("refuses if the link is already revoked", () => {
    const result = canRevoke(
      mk({ status: "revoked" }),
      "user_buyer_1",
      "buyer",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("already revoked");
  });

  it("refuses already-revoked even for admins (no double-revoke)", () => {
    const result = canRevoke(
      mk({ status: "revoked" }),
      "user_admin",
      "admin",
    );
    expect(result.ok).toBe(false);
  });
});

describe("projectListRow", () => {
  const now = "2026-04-10T00:00:00.000Z";

  it("includes the derived status", () => {
    const row = projectListRow(mk(), now);
    expect(row.derivedStatus).toBe("active");
  });

  it("shows expired for past expiry", () => {
    const row = projectListRow(
      mk({ expiresAt: "2026-04-01T00:00:00.000Z" }),
      now,
    );
    expect(row.derivedStatus).toBe("expired");
  });

  it("preserves scope and access metadata", () => {
    const row = projectListRow(
      mk({
        scope: "summary_and_documents",
        accessCount: 5,
        lastAccessedAt: "2026-04-09T00:00:00.000Z",
      }),
      now,
    );
    expect(row.scope).toBe("summary_and_documents");
    expect(row.accessCount).toBe(5);
    expect(row.lastAccessedAt).toBe("2026-04-09T00:00:00.000Z");
  });
});

describe("sortForManagement", () => {
  const mkRow = (overrides: Partial<ShareLinkRow>): ShareLinkRow => ({
    linkId: "l",
    slug: "s",
    scope: "summary_only",
    derivedStatus: "active",
    createdAt: "2026-04-01T00:00:00.000Z",
    expiresAt: null,
    accessCount: 0,
    lastAccessedAt: null,
    ...overrides,
  });

  it("puts active links first, then expired, then revoked", () => {
    const rows = [
      mkRow({ linkId: "revoked", derivedStatus: "revoked" }),
      mkRow({ linkId: "active", derivedStatus: "active" }),
      mkRow({ linkId: "expired", derivedStatus: "expired" }),
    ];
    const sorted = sortForManagement(rows);
    expect(sorted.map((r) => r.linkId)).toEqual([
      "active",
      "expired",
      "revoked",
    ]);
  });

  it("ties break by most recent createdAt desc within status", () => {
    const rows = [
      mkRow({
        linkId: "older",
        derivedStatus: "active",
        createdAt: "2026-04-01T00:00:00.000Z",
      }),
      mkRow({
        linkId: "newer",
        derivedStatus: "active",
        createdAt: "2026-04-05T00:00:00.000Z",
      }),
    ];
    const sorted = sortForManagement(rows);
    expect(sorted.map((r) => r.linkId)).toEqual(["newer", "older"]);
  });

  it("does not mutate the input", () => {
    const rows = [
      mkRow({ linkId: "a", derivedStatus: "revoked" }),
      mkRow({ linkId: "b", derivedStatus: "active" }),
    ];
    const copy = [...rows];
    sortForManagement(rows);
    expect(rows).toEqual(copy);
  });
});
