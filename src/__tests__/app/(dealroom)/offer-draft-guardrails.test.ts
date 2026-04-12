import { describe, expect, it } from "vitest";
import {
  termsChanged,
  validateOfferTerms,
} from "@/lib/dealroom/offer-cockpit-validation";
import type { OfferTerms } from "@/lib/dealroom/offer-cockpit-types";

const baseTerms: OfferTerms = {
  offerPrice: 485_000,
  earnestMoney: 9_700,
  closingDays: 35,
  contingencies: ["inspection", "financing"],
  buyerCredits: 0,
  sellerCredits: 0,
};

// These tests cover the client-side guardrails that mirror the server-side
// validations codex flagged on KIN-791 (negative credits + IPC ceiling).
describe("offer cockpit draft guardrails", () => {
  it("errors on negative buyer credits", () => {
    const result = validateOfferTerms({
      terms: { ...baseTerms, buyerCredits: -500 },
      listPrice: 500_000,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "buyer_credits_negative")).toBe(
      true,
    );
  });

  it("errors on negative seller credits", () => {
    const result = validateOfferTerms({
      terms: { ...baseTerms, sellerCredits: -100 },
      listPrice: 500_000,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "seller_credits_negative")).toBe(
      true,
    );
  });

  it("warns (not errors) when seller credits exceed 6% IPC", () => {
    const result = validateOfferTerms({
      terms: { ...baseTerms, sellerCredits: 35_000 },
      listPrice: 500_000,
    });
    expect(result.warnings.some((w) => w.code === "seller_credits_high")).toBe(
      true,
    );
  });

  it("detects seller credit changes as dirty", () => {
    const next: OfferTerms = { ...baseTerms, sellerCredits: 5_000 };
    expect(termsChanged(baseTerms, next)).toBe(true);
  });

  it("detects buyer credit changes as dirty", () => {
    const next: OfferTerms = { ...baseTerms, buyerCredits: 2_500 };
    expect(termsChanged(baseTerms, next)).toBe(true);
  });
});
