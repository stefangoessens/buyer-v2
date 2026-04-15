import { describe, expect, it } from "vitest";
import { BUYER_STORIES } from "@/content/trustProof";
import {
  BuyerStoryApprovalError,
  assertBuyerStoryCompliance,
  filterPublishableStories,
  selectStoriesForPlacement,
} from "@/lib/trustProof/policy";
import type { BuyerStory } from "@/lib/trustProof/types";

/**
 * KIN-1087 — buyer stories content + policy invariants.
 *
 * These tests are the hard contract for the BUYER_STORIES catalog. If
 * any one of them fails we must fix the catalog, not the test — an
 * approved story missing a compliance gate is a legal incident.
 */

function makeApprovedFixture(
  overrides: Partial<BuyerStory["compliance"]> = {}
): BuyerStory {
  // Start from a known-good draft seed, flip to approved + fill gates.
  const base = BUYER_STORIES[0];
  return {
    ...base,
    id: `${base.id}-approved-fixture`,
    publicationStatus: "approved",
    compliance: {
      releaseRef: "fixture-release-001",
      brokerApprovedForPublicUse: true,
      legalApprovedForPublicUse: true,
      retentionBucket: "legal_documents",
      ...overrides,
    },
  };
}

describe("BUYER_STORIES catalog", () => {
  it("has exactly three seed stories", () => {
    expect(BUYER_STORIES).toHaveLength(3);
  });

  it("every seed is draft (no accidental public seeds)", () => {
    for (const story of BUYER_STORIES) {
      expect(story.publicationStatus).toBe("draft");
    }
  });

  it("every seed has a non-empty Florida angle", () => {
    for (const story of BUYER_STORIES) {
      expect(story.story.floridaAngle).toBeTruthy();
      expect(story.story.floridaAngle.length).toBeGreaterThan(0);
    }
  });

  it("every seed's displayName is exactly `${firstName} ${lastInitial}.` (no full surnames leaked)", () => {
    for (const story of BUYER_STORIES) {
      const expected = `${story.buyer.firstName} ${story.buyer.lastInitial}.`;
      expect(story.buyer.displayName).toBe(expected);
      // lastInitial must be a single letter
      expect(story.buyer.lastInitial).toHaveLength(1);
    }
  });

  it("every seed is anchored in FL", () => {
    for (const story of BUYER_STORIES) {
      expect(story.buyer.state).toBe("FL");
    }
  });
});

describe("assertBuyerStoryCompliance", () => {
  it("is a no-op for draft seeds", () => {
    for (const story of BUYER_STORIES) {
      expect(() => assertBuyerStoryCompliance(story)).not.toThrow();
    }
  });

  it("throws when an approved story is missing releaseRef", () => {
    const broken = makeApprovedFixture({ releaseRef: undefined });
    expect(() => assertBuyerStoryCompliance(broken)).toThrow(
      BuyerStoryApprovalError
    );
    expect(() => assertBuyerStoryCompliance(broken)).toThrow(
      /missing compliance\.releaseRef/
    );
  });

  it("throws when an approved story has brokerApprovedForPublicUse=false", () => {
    const broken = makeApprovedFixture({ brokerApprovedForPublicUse: false });
    expect(() => assertBuyerStoryCompliance(broken)).toThrow(
      BuyerStoryApprovalError
    );
    expect(() => assertBuyerStoryCompliance(broken)).toThrow(
      /brokerApprovedForPublicUse/
    );
  });

  it("throws when an approved story has legalApprovedForPublicUse=false", () => {
    const broken = makeApprovedFixture({ legalApprovedForPublicUse: false });
    expect(() => assertBuyerStoryCompliance(broken)).toThrow(
      BuyerStoryApprovalError
    );
    expect(() => assertBuyerStoryCompliance(broken)).toThrow(
      /legalApprovedForPublicUse/
    );
  });

  it("passes for an approved story with all three compliance gates set", () => {
    const good = makeApprovedFixture();
    expect(() => assertBuyerStoryCompliance(good)).not.toThrow();
  });
});

describe("filterPublishableStories", () => {
  it("returns an empty array by default (all seeds are draft)", () => {
    expect(filterPublishableStories(BUYER_STORIES)).toEqual([]);
  });

  it("returns all seeds when includeDrafts=true", () => {
    const result = filterPublishableStories(BUYER_STORIES, {
      includeDrafts: true,
    });
    expect(result).toHaveLength(BUYER_STORIES.length);
  });
});

describe("selectStoriesForPlacement", () => {
  it("returns seeds in sortOrder for the home placement when drafts are included", () => {
    const result = selectStoriesForPlacement(BUYER_STORIES, "home", 3, {
      includeDrafts: true,
    });
    expect(result).toHaveLength(3);
    const sortOrders = result.map((s) => s.sortOrder);
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
  });

  it("returns an empty array for the stories placement when drafts are excluded (no approved seeds)", () => {
    expect(
      selectStoriesForPlacement(BUYER_STORIES, "stories", 10)
    ).toEqual([]);
  });
});
