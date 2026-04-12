import { describe, it, expect } from "vitest";
import { mapOfferToContractFields, validateContractFields, createAdapterRun } from "@/lib/contracts/formAdapter";
import { REQUIRED_FIELDS } from "@/lib/contracts/types";

const baseOffer = { offerPrice: 500000, earnestMoney: 10000, closingDate: "2025-03-15", contingencies: ["inspection", "financing"] };
const baseProperty = { address: { street: "123 Main", city: "Miami", state: "FL", zip: "33101", county: "Miami-Dade", formatted: "123 Main, Miami, FL 33101" }, propertyType: "Condo", hoaFee: 500 };
const baseBuyer = { name: "John Doe", email: "john@example.com", address: "456 Oak, Tampa, FL", financingType: "conventional" };

describe("mapOfferToContractFields", () => {
  it("maps all core fields", () => {
    const fields = mapOfferToContractFields(baseOffer, baseProperty, baseBuyer);
    expect(fields.purchasePrice).toBe(500000);
    expect(fields.buyerName).toBe("John Doe");
    expect(fields.county).toBe("Miami-Dade");
    expect(fields.condoAddendum).toBe(true);
    expect(fields.hoaAddendum).toBe(true);
  });

  it("sets inspection period from contingencies", () => {
    const fields = mapOfferToContractFields(baseOffer, baseProperty, baseBuyer);
    expect(fields.inspectionPeriodDays).toBe(15);
  });

  it("defaults earnest money to 1% if not provided", () => {
    const fields = mapOfferToContractFields({ offerPrice: 400000 }, baseProperty, baseBuyer);
    expect(fields.earnestMoney).toBe(4000);
  });
});

describe("validateContractFields", () => {
  it("passes with complete fields", () => {
    const fields = mapOfferToContractFields(baseOffer, baseProperty, baseBuyer);
    const result = validateContractFields(fields);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it("fails with missing required fields", () => {
    const fields = mapOfferToContractFields(baseOffer, baseProperty, { ...baseBuyer, name: "" });
    const result = validateContractFields(fields);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("buyerName");
  });

  it("warns on zero earnest money", () => {
    const fields = mapOfferToContractFields({ ...baseOffer, earnestMoney: 0 }, baseProperty, baseBuyer);
    const result = validateContractFields(fields);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("createAdapterRun", () => {
  it("returns mapped status for valid fields", () => {
    const fields = mapOfferToContractFields(baseOffer, baseProperty, baseBuyer);
    const validation = validateContractFields(fields);
    const run = createAdapterRun("offer-1", fields, validation);
    expect(run.status).toBe("mapped");
  });
});

describe("REQUIRED_FIELDS", () => {
  it("includes critical FL contract fields", () => {
    expect(REQUIRED_FIELDS).toContain("buyerName");
    expect(REQUIRED_FIELDS).toContain("purchasePrice");
    expect(REQUIRED_FIELDS).toContain("closingDate");
    expect(REQUIRED_FIELDS).toContain("county");
  });
});
