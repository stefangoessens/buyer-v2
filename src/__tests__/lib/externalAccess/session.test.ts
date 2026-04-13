import { describe, expect, it } from "vitest";
import {
  createExternalAccessSession,
  isExternalActionAllowed,
} from "@/lib/externalAccess/token";
import { authorizeExternalAccessSession } from "../../../../convex/lib/externalAccessSession";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

function makeToken(
  overrides: Partial<Doc<"externalAccessTokens">> = {},
): Doc<"externalAccessTokens"> {
  return {
    _id: "token_1" as Id<"externalAccessTokens">,
    _creationTime: Date.parse("2028-05-01T11:00:00.000Z"),
    hashedToken: "hash_1",
    dealRoomId: "dr_1" as Id<"dealRooms">,
    offerId: undefined,
    role: "listing_agent",
    allowedActions: ["view_offer", "submit_response"],
    expiresAt: "2028-05-02T12:00:00.000Z",
    revokedAt: undefined,
    revokedBy: undefined,
    revokeReason: undefined,
    issuedBy: "user_1" as Id<"users">,
    contactName: undefined,
    contactEmail: undefined,
    createdAt: "2028-05-01T11:00:00.000Z",
    lastUsedAt: undefined,
    ...overrides,
  };
}

describe("createExternalAccessSession", () => {
  it("builds a session that cannot reach internal tooling", () => {
    const session = createExternalAccessSession({
      tokenId: "token_1",
      hashedToken: "hash_1",
      dealRoomId: "dr_1",
      offerId: "off_1",
      role: "listing_agent",
      allowedActions: ["view_offer", "submit_response"],
      expiresAt: "2028-05-02T12:00:00.000Z",
    });

    expect(session.kind).toBe("external_access");
    expect(session.scope.resource).toBe("offer");
    expect(session.permissions.canViewOffer).toBe(true);
    expect(session.permissions.canSubmitResponse).toBe(true);
    expect(session.permissions.canConfirmCompensation).toBe(false);
    expect(session.permissions.canAccessInternalConsole).toBe(false);
    expect(session.permissions.canReadBrokerTools).toBe(false);
    expect(session.permissions.canMutateAdminOnlyState).toBe(false);
    expect(isExternalActionAllowed(session, "submit_response")).toBe(true);
    expect(isExternalActionAllowed(session, "confirm_compensation")).toBe(false);
  });
});

describe("authorizeExternalAccessSession", () => {
  const now = "2028-05-01T12:00:00.000Z";

  it("authorizes a valid submit_response request", () => {
    const result = authorizeExternalAccessSession({
      token: makeToken(),
      hashedToken: "hash_1",
      intendedAction: "submit_response",
      intendedDealRoomId: "dr_1" as Id<"dealRooms">,
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.permissions.canSubmitResponse).toBe(true);
      expect(result.session.permissions.canAccessInternalConsole).toBe(false);
      expect(result.session.scope.dealRoomId).toBe("dr_1");
    }
  });

  it("denies expired access", () => {
    const result = authorizeExternalAccessSession({
      token: makeToken({ expiresAt: "2028-05-01T11:59:59.000Z" }),
      hashedToken: "hash_1",
      intendedAction: "submit_response",
      intendedDealRoomId: "dr_1" as Id<"dealRooms">,
      now,
    });

    expect(result).toEqual({
      ok: false,
      reason: "expired",
      token: expect.any(Object),
    });
  });

  it("denies actions outside the allowlist", () => {
    const result = authorizeExternalAccessSession({
      token: makeToken({ allowedActions: ["view_offer"] }),
      hashedToken: "hash_1",
      intendedAction: "submit_response",
      intendedDealRoomId: "dr_1" as Id<"dealRooms">,
      now,
    });

    expect(result).toEqual({
      ok: false,
      reason: "action_not_allowed",
      token: expect.any(Object),
    });
  });

  it("denies scope mismatches for the deal room", () => {
    const result = authorizeExternalAccessSession({
      token: makeToken(),
      hashedToken: "hash_1",
      intendedAction: "submit_response",
      intendedDealRoomId: "dr_2" as Id<"dealRooms">,
      now,
    });

    expect(result).toEqual({
      ok: false,
      reason: "scope_mismatch",
      token: expect.any(Object),
    });
  });

  it("denies scope mismatches for an offer-scoped token", () => {
    const result = authorizeExternalAccessSession({
      token: makeToken({ offerId: "off_1" as Id<"offers"> }),
      hashedToken: "hash_1",
      intendedAction: "submit_response",
      intendedDealRoomId: "dr_1" as Id<"dealRooms">,
      intendedOfferId: "off_2" as Id<"offers">,
      now,
    });

    expect(result).toEqual({
      ok: false,
      reason: "scope_mismatch",
      token: expect.any(Object),
    });
  });
});
