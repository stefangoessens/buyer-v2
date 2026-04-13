import { describe, expect, it } from "vitest";
import {
  planCreateShareLink,
  planResolveShareLink,
  planRevokeShareLink,
} from "../../../../convex/lib/shareLinkState";
import type { RawShareLink } from "../../../../convex/lib/shareLink";

const NOW = "2026-04-12T12:00:00.000Z";

function linkFixture(overrides: Partial<RawShareLink> = {}): RawShareLink {
  return {
    _id: "link_123",
    dealRoomId: "deal_123",
    createdByUserId: "buyer_123",
    slug: "share_slug_123",
    scope: "summary_only",
    status: "active",
    createdAt: "2026-04-11T12:00:00.000Z",
    expiresAt: null,
    revokedAt: null,
    revokedByUserId: null,
    accessCount: 2,
    lastAccessedAt: "2026-04-11T15:00:00.000Z",
    ...overrides,
  };
}

describe("planCreateShareLink", () => {
  it("creates typed state for the owner buyer", () => {
    const plan = planCreateShareLink({
      actor: { userId: "buyer_123", role: "buyer" },
      dealRoom: { dealRoomId: "deal_123", buyerId: "buyer_123" },
      scope: "summary_and_documents",
      expiresAt: "2026-04-13T12:00:00.000Z",
      now: NOW,
      slug: "slug_abc",
    });

    expect(plan.link).toMatchObject({
      dealRoomId: "deal_123",
      createdByUserId: "buyer_123",
      slug: "slug_abc",
      scope: "summary_and_documents",
      status: "active",
      createdAt: NOW,
      expiresAt: "2026-04-13T12:00:00.000Z",
      accessCount: 0,
    });
    expect(plan.event).toMatchObject({
      dealRoomId: "deal_123",
      event: "created",
      actorUserId: "buyer_123",
      timestamp: NOW,
    });
    expect(plan.audit).toMatchObject({
      userId: "buyer_123",
      action: "deal_room_share_link_created",
      entityType: "dealRoomShareLinks",
      timestamp: NOW,
    });
  });

  it("attributes staff-created links to the buyer lifecycle owner", () => {
    const plan = planCreateShareLink({
      actor: { userId: "broker_123", role: "broker" },
      dealRoom: { dealRoomId: "deal_123", buyerId: "buyer_123" },
      scope: "full_read",
      expiresAt: null,
      now: NOW,
      slug: "slug_staff",
    });

    expect(plan.createdByUserId).toBe("buyer_123");
    expect(plan.link.createdByUserId).toBe("buyer_123");
    expect(plan.event.actorUserId).toBe("broker_123");
  });

  it("rejects a buyer who does not own the deal room", () => {
    expect(() =>
      planCreateShareLink({
        actor: { userId: "buyer_999", role: "buyer" },
        dealRoom: { dealRoomId: "deal_123", buyerId: "buyer_123" },
        scope: "summary_only",
        expiresAt: null,
        now: NOW,
        slug: "slug_denied",
      }),
    ).toThrow("not authorized");
  });

  it("rejects invalid or non-future expiry timestamps", () => {
    expect(() =>
      planCreateShareLink({
        actor: { userId: "buyer_123", role: "buyer" },
        dealRoom: { dealRoomId: "deal_123", buyerId: "buyer_123" },
        scope: "summary_only",
        expiresAt: "not-a-timestamp",
        now: NOW,
        slug: "slug_invalid",
      }),
    ).toThrow("expiresAt must be in the future");
  });
});

describe("planResolveShareLink", () => {
  it("resolves an active link and records access state updates", () => {
    const plan = planResolveShareLink(linkFixture(), "share_slug_123", NOW);

    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.response).toEqual({
        ok: true,
        linkId: "link_123",
        dealRoomId: "deal_123",
        scope: "summary_only",
      });
      expect(plan.patch).toEqual({
        accessCount: 3,
        lastAccessedAt: NOW,
      });
      expect(plan.event).toEqual({
        linkId: "link_123",
        dealRoomId: "deal_123",
        event: "resolved",
        timestamp: NOW,
      });
    }
  });

  it("returns a denied_expired event for expired links", () => {
    const plan = planResolveShareLink(
      linkFixture({ expiresAt: "2026-04-10T00:00:00.000Z" }),
      "share_slug_123",
      NOW,
    );

    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.response).toEqual({ ok: false, reason: "expired" });
      expect(plan.event).toEqual({
        linkId: "link_123",
        dealRoomId: "deal_123",
        event: "denied_expired",
        timestamp: NOW,
      });
      expect(plan.audit).toBeUndefined();
    }
  });

  it("returns a denied_revoked event for revoked links", () => {
    const plan = planResolveShareLink(
      linkFixture({ status: "revoked", revokedAt: "2026-04-11T16:00:00.000Z" }),
      "share_slug_123",
      NOW,
    );

    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.response).toEqual({ ok: false, reason: "revoked" });
      expect(plan.event?.event).toBe("denied_revoked");
    }
  });

  it("audits not-found probes without exposing the full slug", () => {
    const plan = planResolveShareLink(null, "secret_share_slug", NOW);

    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.response).toEqual({ ok: false, reason: "not_found" });
      expect(plan.event).toBeUndefined();
      expect(plan.audit).toMatchObject({
        action: "deal_room_share_link_denied_not_found",
        entityType: "dealRoomShareLinks",
        entityId: "unknown",
        timestamp: NOW,
      });
      expect(plan.audit?.details).toContain('"slugPrefix":"secr"');
      expect(plan.audit?.details).toContain('"slugLength":17');
      expect(plan.audit?.details).not.toContain("secret_share_slug");
    }
  });
});

describe("planRevokeShareLink", () => {
  it("revokes a link for the creator and emits audit state", () => {
    const plan = planRevokeShareLink(
      linkFixture(),
      { userId: "buyer_123", role: "buyer" },
      NOW,
    );

    expect(plan.patch).toEqual({
      status: "revoked",
      revokedAt: NOW,
      revokedByUserId: "buyer_123",
    });
    expect(plan.event).toEqual({
      linkId: "link_123",
      dealRoomId: "deal_123",
      event: "revoked",
      actorUserId: "buyer_123",
      timestamp: NOW,
    });
    expect(plan.audit).toEqual({
      userId: "buyer_123",
      action: "deal_room_share_link_revoked",
      entityType: "dealRoomShareLinks",
      entityId: "link_123",
      timestamp: NOW,
    });
  });

  it("rejects revocation by a different buyer", () => {
    expect(() =>
      planRevokeShareLink(
        linkFixture(),
        { userId: "buyer_999", role: "buyer" },
        NOW,
      ),
    ).toThrow("created the link");
  });
});
