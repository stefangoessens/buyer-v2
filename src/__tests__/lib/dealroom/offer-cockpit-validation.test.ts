import { describe, expect, it } from "vitest";
import {
  emptyTerms,
  scenarioToTerms,
  type OfferTerms,
} from "@/lib/dealroom/offer-cockpit-types";
import {
  formatPriceVsList,
  termsChanged,
  validateOfferTerms,
} from "@/lib/dealroom/offer-cockpit-validation";

const listPrice = 500_000;

function baseTerms(overrides: Partial<OfferTerms> = {}): OfferTerms {
  return {
    offerPrice: 485_000,
    earnestMoney: 9_700,
    closingDays: 35,
    contingencies: ["inspection", "financing"],
    buyerCredits: 0,
    sellerCredits: 0,
    ...overrides,
  };
}

describe("validateOfferTerms", () => {
  it("passes for a reasonable balanced offer", () => {
    const result = validateOfferTerms({ terms: baseTerms(), listPrice });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects an offer below the 50% floor", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ offerPrice: 100_000 }),
      listPrice,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "offer_price_too_low")).toBe(true);
  });

  it("rejects a zero offer price", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ offerPrice: 0 }),
      listPrice,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "offer_price_required")).toBe(
      true,
    );
  });

  it("warns when earnest is below 0.5% of price", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ earnestMoney: 1_000 }),
      listPrice,
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === "earnest_money_low")).toBe(
      true,
    );
  });

  it("warns when earnest is above 10% of price", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ earnestMoney: 80_000 }),
      listPrice,
    });
    expect(result.warnings.some((w) => w.code === "earnest_money_high")).toBe(
      true,
    );
  });

  it("errors when closing window is too short", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ closingDays: 3 }),
      listPrice,
    });
    expect(result.errors.some((e) => e.code === "closing_days_too_short")).toBe(
      true,
    );
  });

  it("errors when closing window exceeds 120 days", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ closingDays: 200 }),
      listPrice,
    });
    expect(result.errors.some((e) => e.code === "closing_days_too_long")).toBe(
      true,
    );
  });

  it("errors when buyer credits are negative", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ buyerCredits: -100 }),
      listPrice,
    });
    expect(result.errors.some((e) => e.code === "buyer_credits_negative")).toBe(
      true,
    );
  });

  it("warns when seller credits exceed 6% of offer price", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ sellerCredits: 40_000 }),
      listPrice,
    });
    expect(result.warnings.some((w) => w.code === "seller_credits_high")).toBe(
      true,
    );
  });

  it("warns when contingencies are waived", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ contingencies: [] }),
      listPrice,
    });
    expect(result.warnings.some((w) => w.code === "contingencies_waived")).toBe(
      true,
    );
  });

  it("errors when price exceeds buyer max budget", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ offerPrice: 550_000 }),
      listPrice,
      buyerMaxBudget: 520_000,
    });
    expect(
      result.errors.some((e) => e.code === "offer_price_exceeds_budget"),
    ).toBe(true);
  });

  it("warns when offer is more than 20% above list", () => {
    const result = validateOfferTerms({
      terms: baseTerms({ offerPrice: 650_000 }),
      listPrice,
    });
    expect(result.warnings.some((w) => w.code === "offer_price_over_list")).toBe(
      true,
    );
  });
});

describe("termsChanged", () => {
  it("returns false for identical terms", () => {
    expect(termsChanged(baseTerms(), baseTerms())).toBe(false);
  });

  it("detects price changes", () => {
    expect(termsChanged(baseTerms(), baseTerms({ offerPrice: 400_000 }))).toBe(
      true,
    );
  });

  it("detects contingency additions", () => {
    const a = baseTerms({ contingencies: ["inspection"] });
    const b = baseTerms({ contingencies: ["inspection", "financing"] });
    expect(termsChanged(a, b)).toBe(true);
  });

  it("ignores contingency order", () => {
    const a = baseTerms({ contingencies: ["inspection", "financing"] });
    const b = baseTerms({ contingencies: ["financing", "inspection"] });
    expect(termsChanged(a, b)).toBe(false);
  });
});

describe("formatPriceVsList", () => {
  it("returns 'At list' for identical prices", () => {
    expect(formatPriceVsList(500_000, 500_000)).toBe("At list");
  });

  it("returns positive pct with + sign", () => {
    expect(formatPriceVsList(510_000, 500_000)).toBe("+2.0% vs list");
  });

  it("returns negative pct", () => {
    expect(formatPriceVsList(485_000, 500_000)).toBe("-3.0% vs list");
  });

  it("handles zero list price", () => {
    expect(formatPriceVsList(100_000, 0)).toBe("—");
  });
});

describe("scenarioToTerms", () => {
  it("copies scenario fields into terms", () => {
    const terms = scenarioToTerms(
      {
        name: "Balanced",
        price: 485_000,
        priceVsListPct: -3,
        earnestMoney: 9_700,
        closingDays: 35,
        contingencies: ["inspection", "financing"],
        competitivenessScore: 60,
        riskLevel: "medium",
        explanation: "",
      },
      listPrice,
    );
    expect(terms.offerPrice).toBe(485_000);
    expect(terms.earnestMoney).toBe(9_700);
    expect(terms.closingDays).toBe(35);
    expect(terms.contingencies).toEqual(["inspection", "financing"]);
    expect(terms.buyerCredits).toBe(0);
    expect(terms.sellerCredits).toBe(0);
  });
});

describe("emptyTerms", () => {
  it("returns sane defaults", () => {
    const terms = emptyTerms(500_000);
    expect(terms.offerPrice).toBe(500_000);
    expect(terms.earnestMoney).toBe(10_000);
    expect(terms.closingDays).toBe(35);
    expect(terms.contingencies).toEqual(["inspection", "financing"]);
  });
});
