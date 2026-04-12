import { describe, expect, it } from "vitest";
import {
  createSearchPreviewFromUrl,
  isSupportedListingUrl,
} from "@/lib/onboarding/demo-search";
import {
  createBuyerSessionFromDraft,
  createEmptyOnboardingState,
  parseBuyerSessionCookie,
  serializeBuyerSessionCookie,
  upsertSearchInSession,
} from "@/lib/onboarding/storage";
import {
  validateAccountStep,
  validateBuyerBasicsStep,
  validatePropertyLinkageStep,
} from "@/lib/onboarding/validation";

describe("onboarding flow", () => {
  it("creates deterministic search previews for supported links", () => {
    const preview = createSearchPreviewFromUrl(
      "https://www.zillow.com/homedetails/123-Main-St-Miami-FL/123456_zpid/",
    );

    expect(preview).not.toBeNull();
    expect(preview?.portal).toBe("zillow");
    expect(preview?.propertyId).toBe("zillow-123456");
  });

  it("rejects unsupported property hosts", () => {
    expect(isSupportedListingUrl("https://example.com/listing/123")).toBe(false);
    expect(createSearchPreviewFromUrl("https://example.com/listing/123")).toBeNull();
  });

  it("validates each onboarding step", () => {
    expect(
      validateAccountStep({
        fullName: "",
        email: "bad",
        phone: "123",
      }).ok,
    ).toBe(false);

    expect(
      validateBuyerBasicsStep({
        budgetMin: 800000,
        budgetMax: 700000,
        timeline: "90_plus_days",
        financing: "conventional",
        preferredAreas: "",
      }).ok,
    ).toBe(false);

    const preview = createSearchPreviewFromUrl(
      "https://www.redfin.com/FL/Miami/1000-Biscayne-Blvd-33132/home/12345678",
    );

    expect(
      validatePropertyLinkageStep({
        listingUrl:
          "https://www.redfin.com/FL/Miami/1000-Biscayne-Blvd-33132/home/12345678",
        linkedSearch: preview,
      }).ok,
    ).toBe(true);
  });

  it("round-trips the buyer session cookie and updates session searches", () => {
    const preview = createSearchPreviewFromUrl(
      "https://www.zillow.com/homedetails/123-Main-St-Miami-FL/123456_zpid/",
    );
    const secondPreview = createSearchPreviewFromUrl(
      "https://www.redfin.com/FL/Miami/1000-Biscayne-Blvd-33132/home/12345678",
    );

    expect(preview).not.toBeNull();
    expect(secondPreview).not.toBeNull();
    if (!preview || !secondPreview) return;

    const draft = createEmptyOnboardingState();
    draft.account = {
      fullName: "Maria Gonzalez",
      email: "maria@example.com",
      phone: "(305) 555-0182",
    };
    draft.buyerBasics = {
      budgetMin: 450000,
      budgetMax: 650000,
      timeline: "30_60_days",
      financing: "conventional",
      preferredAreas: "Miami Beach, Coconut Grove",
    };
    draft.propertyLinkage = {
      listingUrl: preview.listingUrl,
      linkedSearch: preview,
    };

    const session = createBuyerSessionFromDraft(draft);
    const serialized = serializeBuyerSessionCookie({
      version: 1,
      status: "registered",
      buyerName: session.buyerName,
      buyerEmail: session.buyerEmail,
      firstPropertyId: session.firstSearch.propertyId,
    });

    expect(parseBuyerSessionCookie(serialized)).toEqual({
      version: 1,
      status: "registered",
      buyerName: "Maria Gonzalez",
      buyerEmail: "maria@example.com",
      firstPropertyId: "zillow-123456",
    });

    const updated = upsertSearchInSession(session, secondPreview);
    expect(updated.searches).toHaveLength(2);
    expect(updated.firstSearch.propertyId).toBe("redfin-12345678");
  });
});
