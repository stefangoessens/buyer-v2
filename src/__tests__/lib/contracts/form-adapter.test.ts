import { describe, expect, it } from "vitest";
import {
  createAdapterRun,
  mapApprovedOfferToFloridaContract,
  validateContractFields,
} from "@/lib/contracts/formAdapter";
import { REQUIRED_FIELDS } from "@/lib/contracts/types";

const baseSource = {
  dealRoomId: "deal-room-1",
  offerId: "offer-1",
  propertyId: "property-1",
  offerStatus: "approved" as const,
  approvedAt: "2026-04-10T12:00:00.000Z",
  purchasePrice: 550000,
  earnestMoney: 11000,
  closingDate: "2026-05-20",
  contingencies: ["inspection", "financing"],
  financingType: "conventional" as const,
  property: {
    street: "123 Main St",
    city: "Miami",
    state: "FL",
    zip: "33101",
    county: "Miami-Dade",
    folioNumber: "30-1234-567-8900",
    yearBuilt: 1972,
    listPrice: 575000,
    hoaFee: 450,
    propertyType: "Condo",
    listingAgentName: "Sally Seller",
    listingBrokerage: "Listing Co",
  },
  buyer: {
    fullName: "John Buyer",
    email: "john@example.com",
    phone: "3055551212",
    mailingAddress: "456 Oak Ave, Tampa, FL 33602",
  },
  buyerBroker: {
    fullName: "Brenda Broker",
    email: "broker@example.com",
  },
};

describe("mapApprovedOfferToFloridaContract", () => {
  it("maps approved offer state into Florida contract fields and forms", () => {
    const result = mapApprovedOfferToFloridaContract(baseSource);

    expect(result.status).toBe("ready");
    expect(result.templateVersion).toBe("2026-01");
    expect(result.fieldMap.purchasePrice).toBe(550000);
    expect(result.fieldMap.countyName).toBe("Miami-Dade");
    expect(result.fieldMap.buyerParty1Name).toBe("John Buyer");
    expect(result.formSimplicity.addTransaction.transactionType).toBe("P");
    expect(result.forms.map((form) => form.formKey)).toEqual([
      "fl_far_bar_residential_contract",
      "fl_condominium_rider",
      "fl_homeowners_association_addendum",
      "fl_lead_based_paint_disclosure",
    ]);
    expect(result.sabalSign.recipients).toEqual([
      {
        role: "buyer",
        name: "John Buyer",
        email: "john@example.com",
      },
      {
        role: "broker",
        name: "Brenda Broker",
        email: "broker@example.com",
      },
    ]);
  });

  it("blocks handoff when required fields are missing", () => {
    const result = mapApprovedOfferToFloridaContract({
      ...baseSource,
      property: {
        ...baseSource.property,
        county: undefined,
        yearBuilt: undefined,
      },
      buyer: {
        ...baseSource.buyer,
        email: undefined,
      },
    });

    expect(result.status).toBe("missing_fields");
    expect(result.missingFields.map((field) => field.field)).toEqual(
      expect.arrayContaining(["countyName", "buyerParty1Email", "yearBuilt"]),
    );
  });

  it("warns when ops follow-up is likely required", () => {
    const result = mapApprovedOfferToFloridaContract({
      ...baseSource,
      seller: undefined,
      buyer: {
        ...baseSource.buyer,
        phone: undefined,
      },
    });

    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["buyer_phone_missing", "seller_name_missing"]),
    );
  });
});

describe("validateContractFields", () => {
  it("accepts a complete field map", () => {
    const result = mapApprovedOfferToFloridaContract(baseSource);
    const validation = validateContractFields(result.fieldMap);

    expect(validation.valid).toBe(true);
    expect(validation.missingFields).toHaveLength(0);
  });

  it("tracks missing required fields from the shared contract list", () => {
    const validation = validateContractFields({
      purchasePrice: 550000,
    });

    expect(validation.valid).toBe(false);
    for (const field of REQUIRED_FIELDS) {
      if (field !== "purchasePrice") {
        expect(validation.missingFields).toContain(field);
      }
    }
  });
});

describe("createAdapterRun", () => {
  it("creates a legacy adapter run snapshot for audit-style summaries", () => {
    const result = mapApprovedOfferToFloridaContract(baseSource);
    const validation = validateContractFields(result.fieldMap);
    const run = createAdapterRun("offer-1", result.fieldMap, validation);

    expect(run.status).toBe("mapped");
    expect(run.offerId).toBe("offer-1");
    expect(run.mappedFieldCount).toBeGreaterThan(5);
  });
});
