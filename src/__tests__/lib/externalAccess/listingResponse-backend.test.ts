import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  authorizeListingResponseSubmission,
  buildListingResponseReviewModel,
} from "../../../../convex/lib/listingResponses";

const NOW = "2028-05-01T12:00:00.000Z";

function makeToken(
  overrides: Partial<Doc<"externalAccessTokens">> = {},
): Doc<"externalAccessTokens"> {
  return {
    _id: "token_1" as Id<"externalAccessTokens">,
    _creationTime: Date.parse("2028-05-01T11:00:00.000Z"),
    hashedToken: "hash_1",
    dealRoomId: "dr_1" as Id<"dealRooms">,
    offerId: "off_1" as Id<"offers">,
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

function makeResponse(
  overrides: Partial<Doc<"listingResponses">> = {},
): Doc<"listingResponses"> {
  return {
    _id: "resp_1" as Id<"listingResponses">,
    _creationTime: Date.parse("2028-05-01T12:05:00.000Z"),
    tokenId: "token_1" as Id<"externalAccessTokens">,
    dealRoomId: "dr_1" as Id<"dealRooms">,
    offerId: "off_1" as Id<"offers">,
    propertyId: "prop_1" as Id<"properties">,
    counterpartyRole: "listing_agent",
    responseType: "offer_countered",
    message: "We can move if closing stays flexible.",
    counterPrice: 640_000,
    counterEarnestMoney: 25_000,
    counterClosingDate: "2028-05-31T00:00:00.000Z",
    requestedConcessions: "Seller credit for roof repair",
    sellerCreditsRequested: 10_000,
    confirmedPct: undefined,
    confirmedFlat: undefined,
    disputeReason: undefined,
    accessKind: "external_access",
    accessResource: "offer",
    accessAllowedActions: ["view_offer", "submit_response"],
    accessExpiresAt: "2028-05-02T12:00:00.000Z",
    reviewStatus: "unreviewed",
    reviewedBy: undefined,
    reviewedAt: undefined,
    reviewNotes: undefined,
    submittedAt: "2028-05-01T12:05:00.000Z",
    ...overrides,
  };
}

describe("authorizeListingResponseSubmission", () => {
  it("authorizes a valid limited-access submission", () => {
    const result = authorizeListingResponseSubmission({
      token: makeToken(),
      hashedToken: "hash_1",
      dealRoomId: "dr_1" as Id<"dealRooms">,
      offerId: "off_1" as Id<"offers">,
      responseType: "offer_acknowledged",
      now: NOW,
      existingResponses: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.permissions.canSubmitResponse).toBe(true);
      expect(result.accessContext.kind).toBe("external_access");
      expect(result.accessContext.allowedActions).toEqual([
        "view_offer",
        "submit_response",
      ]);
    }
  });

  it("rejects expired access", () => {
    const result = authorizeListingResponseSubmission({
      token: makeToken({ expiresAt: "2028-05-01T11:59:59.000Z" }),
      hashedToken: "hash_1",
      dealRoomId: "dr_1" as Id<"dealRooms">,
      offerId: "off_1" as Id<"offers">,
      responseType: "offer_acknowledged",
      now: NOW,
      existingResponses: [],
    });

    expect(result).toEqual({
      ok: false,
      kind: "denied",
      reason: "expired",
      token: expect.any(Object),
    });
  });

  it("rejects denied access outside the allowlist", () => {
    const result = authorizeListingResponseSubmission({
      token: makeToken({ allowedActions: ["view_offer"] }),
      hashedToken: "hash_1",
      dealRoomId: "dr_1" as Id<"dealRooms">,
      offerId: "off_1" as Id<"offers">,
      responseType: "offer_acknowledged",
      now: NOW,
      existingResponses: [],
    });

    expect(result).toEqual({
      ok: false,
      kind: "denied",
      reason: "action_not_allowed",
      token: expect.any(Object),
    });
  });

  it("rejects repeated submissions inside the dedupe window", () => {
    const result = authorizeListingResponseSubmission({
      token: makeToken(),
      hashedToken: "hash_1",
      dealRoomId: "dr_1" as Id<"dealRooms">,
      offerId: "off_1" as Id<"offers">,
      responseType: "offer_acknowledged",
      now: NOW,
      existingResponses: [
        {
          responseType: "offer_acknowledged",
          submittedAt: "2028-05-01T11:59:30.000Z",
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      kind: "duplicate_submission",
      token: expect.any(Object),
    });
  });
});

describe("buildListingResponseReviewModel", () => {
  it("builds a typed internal review model with payload and access context", () => {
    const model = buildListingResponseReviewModel(makeResponse());

    expect(model.accessContext).toEqual({
      kind: "external_access",
      tokenId: "token_1",
      resource: "offer",
      dealRoomId: "dr_1",
      offerId: "off_1",
      role: "listing_agent",
      allowedActions: ["view_offer", "submit_response"],
      expiresAt: "2028-05-02T12:00:00.000Z",
    });
    expect(model.payload.counterOffer).toEqual({
      counterPrice: 640_000,
      counterEarnestMoney: 25_000,
      counterClosingDate: "2028-05-31T00:00:00.000Z",
      requestedConcessions: "Seller credit for roof repair",
      sellerCreditsRequested: 10_000,
    });
    expect(model.review.status).toBe("unreviewed");
  });
});
