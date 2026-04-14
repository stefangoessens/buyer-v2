import { describe, it, expect } from "vitest";
import { resolveJourneyHref } from "@/lib/dealroom/journey-routing";
import type { DealRoomLifecycleStatus } from "@/lib/dealroom/journey-status-labels";

const PROPERTY_ID = "prop_abc123";

describe("resolveJourneyHref", () => {
  it("routes under_contract and closing to the /closing wizard (KIN-1080)", () => {
    expect(
      resolveJourneyHref({ propertyId: PROPERTY_ID, status: "under_contract" }),
    ).toBe(`/property/${PROPERTY_ID}/closing`);
    expect(
      resolveJourneyHref({ propertyId: PROPERTY_ID, status: "closing" }),
    ).toBe(`/property/${PROPERTY_ID}/closing`);
  });

  it("routes offer_prep and offer_sent to the offer wizard", () => {
    expect(
      resolveJourneyHref({ propertyId: PROPERTY_ID, status: "offer_prep" }),
    ).toBe(`/property/${PROPERTY_ID}/offer`);
    expect(
      resolveJourneyHref({ propertyId: PROPERTY_ID, status: "offer_sent" }),
    ).toBe(`/property/${PROPERTY_ID}/offer`);
  });

  it("routes tour_scheduled to the disclosures wizard", () => {
    expect(
      resolveJourneyHref({ propertyId: PROPERTY_ID, status: "tour_scheduled" }),
    ).toBe(`/property/${PROPERTY_ID}/disclosures`);
  });

  it("routes analysis to the price wizard", () => {
    expect(
      resolveJourneyHref({ propertyId: PROPERTY_ID, status: "analysis" }),
    ).toBe(`/property/${PROPERTY_ID}/price`);
  });

  it("routes intake, closed, and withdrawn to the details wizard", () => {
    expect(
      resolveJourneyHref({ propertyId: PROPERTY_ID, status: "intake" }),
    ).toBe(`/property/${PROPERTY_ID}/details`);
    expect(
      resolveJourneyHref({ propertyId: PROPERTY_ID, status: "closed" }),
    ).toBe(`/property/${PROPERTY_ID}/details`);
    expect(
      resolveJourneyHref({ propertyId: PROPERTY_ID, status: "withdrawn" }),
    ).toBe(`/property/${PROPERTY_ID}/details`);
  });

  it("never falls back to the legacy /close route", () => {
    const allStatuses: DealRoomLifecycleStatus[] = [
      "intake",
      "analysis",
      "tour_scheduled",
      "offer_prep",
      "offer_sent",
      "under_contract",
      "closing",
      "closed",
      "withdrawn",
    ];
    for (const status of allStatuses) {
      const href = resolveJourneyHref({ propertyId: PROPERTY_ID, status });
      expect(href).not.toMatch(/\/close$/);
    }
  });

  it("produces a valid non-empty URL for every lifecycle status", () => {
    const allStatuses: DealRoomLifecycleStatus[] = [
      "intake",
      "analysis",
      "tour_scheduled",
      "offer_prep",
      "offer_sent",
      "under_contract",
      "closing",
      "closed",
      "withdrawn",
    ];
    for (const status of allStatuses) {
      const href = resolveJourneyHref({ propertyId: PROPERTY_ID, status });
      expect(href).toBeTypeOf("string");
      expect(href.length).toBeGreaterThan(0);
      expect(href.startsWith(`/property/${PROPERTY_ID}/`)).toBe(true);
    }
  });
});
