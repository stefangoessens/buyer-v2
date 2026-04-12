import { describe, it, expect } from "vitest";
import { filterByAccessLevel, resolveAccessLevel, canPerformAction } from "@/lib/dealroom/access";

const fullProperty = {
  canonicalId: "test-1",
  address: { street: "123 Main", city: "Miami", state: "FL", zip: "33101" },
  status: "active",
  listPrice: 500000,
  beds: 3,
  bathsFull: 2,
  sqftLiving: 1800,
  propertyType: "Condo",
  yearBuilt: 2020,
  photoUrls: ["https://example.com/1.jpg"],
  photoCount: 5,
  mlsNumber: "F10400001",
  description: "Beautiful waterfront condo",
  daysOnMarket: 30,
  taxAnnual: 8000,
  floodZone: "AE",
  listingAgentName: "Jane Broker",
};

describe("filterByAccessLevel", () => {
  it("returns all fields for registered", () => {
    const result = filterByAccessLevel(fullProperty, "registered");
    expect(result).toEqual(fullProperty);
  });

  it("returns all fields for full", () => {
    const result = filterByAccessLevel(fullProperty, "full");
    expect(result).toEqual(fullProperty);
  });

  it("returns only teaser fields for anonymous", () => {
    const result = filterByAccessLevel(fullProperty, "anonymous");
    expect(result.listPrice).toBe(500000);
    expect(result.beds).toBe(3);
    expect((result as Record<string, unknown>).mlsNumber).toBeUndefined();
    expect((result as Record<string, unknown>).description).toBeUndefined();
    expect((result as Record<string, unknown>).taxAnnual).toBeUndefined();
    expect((result as Record<string, unknown>).listingAgentName).toBeUndefined();
  });
});

describe("resolveAccessLevel", () => {
  it("gives full to broker/admin", () => {
    expect(resolveAccessLevel("anonymous", true, false, true)).toBe("full");
  });

  it("gives deal room level to authenticated owner", () => {
    expect(resolveAccessLevel("registered", true, true, false)).toBe("registered");
    expect(resolveAccessLevel("full", true, true, false)).toBe("full");
  });

  it("gives registered to authenticated non-owner", () => {
    expect(resolveAccessLevel("full", true, false, false)).toBe("registered");
  });

  it("gives anonymous to unauthenticated", () => {
    expect(resolveAccessLevel("full", false, false, false)).toBe("anonymous");
  });
});

describe("canPerformAction", () => {
  it("anyone can view teaser", () => {
    expect(canPerformAction("anonymous", "view_teaser")).toBe(true);
  });

  it("only registered+ can view full", () => {
    expect(canPerformAction("anonymous", "view_full")).toBe(false);
    expect(canPerformAction("registered", "view_full")).toBe(true);
  });

  it("only full can start offer", () => {
    expect(canPerformAction("registered", "start_offer")).toBe(false);
    expect(canPerformAction("full", "start_offer")).toBe(true);
  });
});
