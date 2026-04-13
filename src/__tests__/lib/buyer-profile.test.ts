import { describe, expect, it } from "vitest";
import {
  buildBuyerProfileView,
  buildCommunicationPreferences,
  buildDealRoomFlowProfile,
  buildOfferFlowProfile,
  buildTourFlowProfile,
  defaultBuyerProfileSections,
  mergeBuyerProfileSections,
  resolveTourAttendeeCountDefault,
} from "@/lib/buyerProfile";

describe("defaultBuyerProfileSections", () => {
  it("returns typed defaults for missing profile state", () => {
    expect(defaultBuyerProfileSections()).toEqual({
      financing: {
        preApproved: false,
      },
      searchPreferences: {
        preferredAreas: [],
        propertyTypes: [],
        mustHaves: [],
        dealbreakers: [],
      },
      household: {},
    });
  });
});

describe("mergeBuyerProfileSections", () => {
  it("creates a complete profile shape from a partial create payload", () => {
    const merged = mergeBuyerProfileSections(defaultBuyerProfileSections(), {
      financing: {
        budgetMax: 850_000,
        financingType: "conventional",
        preApproved: true,
      },
      household: {
        householdSize: 3,
      },
    });

    expect(merged.financing.preApproved).toBe(true);
    expect(merged.financing.budgetMax).toBe(850_000);
    expect(merged.financing.financingType).toBe("conventional");
    expect(merged.searchPreferences.mustHaves).toEqual([]);
    expect(merged.household.householdSize).toBe(3);
  });

  it("preserves existing values on partial update", () => {
    const existing = mergeBuyerProfileSections(defaultBuyerProfileSections(), {
      financing: {
        budgetMin: 500_000,
        budgetMax: 725_000,
        financingType: "fha",
        preApproved: true,
      },
      searchPreferences: {
        preferredAreas: ["Tampa Heights"],
        mustHaves: ["garage"],
      },
      household: {
        householdSize: 2,
        attendeeCountDefault: 2,
      },
    });

    const merged = mergeBuyerProfileSections(existing, {
      searchPreferences: {
        dealbreakers: ["busy road"],
      },
      financing: {
        preApprovalAmount: 680_000,
      },
    });

    expect(merged.financing.budgetMin).toBe(500_000);
    expect(merged.financing.budgetMax).toBe(725_000);
    expect(merged.financing.financingType).toBe("fha");
    expect(merged.financing.preApprovalAmount).toBe(680_000);
    expect(merged.searchPreferences.preferredAreas).toEqual(["Tampa Heights"]);
    expect(merged.searchPreferences.mustHaves).toEqual(["garage"]);
    expect(merged.searchPreferences.dealbreakers).toEqual(["busy road"]);
    expect(merged.household.attendeeCountDefault).toBe(2);
  });
});

describe("buildCommunicationPreferences", () => {
  it("returns stored defaults when communication preferences are missing", () => {
    const prefs = buildCommunicationPreferences();
    expect(prefs.hasStoredPreferences).toBe(false);
    expect(prefs.channels.email).toBe(true);
    expect(prefs.channels.sms).toBe(false);
    expect(prefs.categories.offers).toBe(true);
    expect(prefs.categories.marketing).toBe(false);
  });
});

describe("buildBuyerProfileView", () => {
  const identity = {
    name: "Casey Buyer",
    email: "casey@example.com",
    phone: "813-555-0100",
  };

  it("builds a role-safe buyer view without internal notes", () => {
    const view = buildBuyerProfileView({
      userId: "user_123",
      identity,
      profile: {
        profileId: "profile_123",
        hasStoredProfile: true,
        financing: {
          budgetMax: 900_000,
          preApproved: true,
          preApprovalAmount: 850_000,
        },
        internal: {
          notes: "Needs broker follow-up before weekend showings.",
        },
      },
      includeInternal: false,
    });

    expect(view.hasStoredProfile).toBe(true);
    expect(view.identity.name).toBe("Casey Buyer");
    expect(view.financing.preApprovalAmount).toBe(850_000);
    expect(view.internal).toBeUndefined();
  });

  it("includes internal notes for staff projections", () => {
    const view = buildBuyerProfileView({
      userId: "user_123",
      identity,
      profile: {
        profileId: "profile_123",
        hasStoredProfile: true,
        internal: {
          notes: "Lender needs updated VOE before offer review.",
        },
      },
      includeInternal: true,
    });

    expect(view.internal?.notes).toContain("Lender");
  });
});

describe("downstream flow projections", () => {
  const profile = buildBuyerProfileView({
    userId: "user_456",
    identity: {
      name: "Jordan Buyer",
      email: "jordan@example.com",
    },
    profile: {
      profileId: "profile_456",
      hasStoredProfile: true,
      financing: {
        budgetMax: 640_000,
        financingType: "va",
        preApproved: true,
        preApprovalAmount: 650_000,
        lenderName: "USAA",
      },
      searchPreferences: {
        preferredAreas: ["Seminole Heights"],
        propertyTypes: ["single_family"],
        mustHaves: ["yard", "office"],
        dealbreakers: ["hoa"],
        moveTimeline: "1_3_months",
      },
      household: {
        householdSize: 4,
      },
    },
  });

  it("derives offer flow context from shared profile state", () => {
    expect(buildOfferFlowProfile(profile)).toEqual({
      budgetMax: 640_000,
      financingType: "va",
      preApproved: true,
      preApprovalAmount: 650_000,
      preApprovalExpiry: undefined,
      lenderName: "USAA",
    });
  });

  it("derives deal-room summary context from shared profile state", () => {
    expect(buildDealRoomFlowProfile(profile)).toEqual({
      preferredAreas: ["Seminole Heights"],
      propertyTypes: ["single_family"],
      mustHaves: ["yard", "office"],
      dealbreakers: ["hoa"],
      timeline: undefined,
      moveTimeline: "1_3_months",
    });
  });

  it("derives tour defaults from household context", () => {
    expect(resolveTourAttendeeCountDefault(profile.household)).toBe(4);
    expect(buildTourFlowProfile(profile).attendeeCountDefault).toBe(4);
  });

  it("falls back to one attendee when household defaults are missing", () => {
    const emptyProfile = buildBuyerProfileView({
      userId: "user_empty",
      identity: {
        name: "Taylor Buyer",
        email: "taylor@example.com",
      },
    });

    expect(resolveTourAttendeeCountDefault(emptyProfile.household)).toBe(1);
    expect(buildTourFlowProfile(emptyProfile).attendeeCountDefault).toBe(1);
  });
});
