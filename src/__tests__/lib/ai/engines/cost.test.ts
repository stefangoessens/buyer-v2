import { describe, it, expect } from "vitest";
import { calculateMortgagePayment, estimateFlInsurance, estimateFloodInsurance, computeOwnershipCosts } from "@/lib/ai/engines/cost";

describe("calculateMortgagePayment", () => {
  it("computes standard 30yr payment", () => {
    const payment = calculateMortgagePayment(400000, 0.065);
    expect(payment).toBeGreaterThan(2500);
    expect(payment).toBeLessThan(2600);
  });

  it("returns 0 for zero principal", () => {
    expect(calculateMortgagePayment(0, 0.065)).toBe(0);
  });
});

describe("estimateFlInsurance", () => {
  it("increases with roof age", () => {
    const newRoof = estimateFlInsurance(500000, 2023);
    const oldRoof = estimateFlInsurance(500000, 2000);
    expect(oldRoof.mid).toBeGreaterThan(newRoof.mid);
  });

  it("discounts for impact windows", () => {
    const without = estimateFlInsurance(500000, 2015);
    const withWindows = estimateFlInsurance(500000, 2015, undefined, true);
    expect(withWindows.mid).toBeLessThan(without.mid);
  });
});

describe("estimateFloodInsurance", () => {
  it("returns high for VE zone", () => {
    expect(estimateFloodInsurance("VE").mid).toBeGreaterThanOrEqual(5000);
  });

  it("returns moderate for AE zone", () => {
    expect(estimateFloodInsurance("AE").mid).toBeGreaterThanOrEqual(2000);
  });

  it("returns zero for no zone", () => {
    expect(estimateFloodInsurance(undefined).mid).toBe(0);
  });
});

describe("computeOwnershipCosts", () => {
  it("produces complete breakdown", () => {
    const result = computeOwnershipCosts({
      purchasePrice: 500000, yearBuilt: 2020, taxAnnual: 8000,
      hoaFee: 500, roofYear: 2020, impactWindows: true, floodZone: "AE",
    });
    expect(result.lineItems.length).toBeGreaterThanOrEqual(5);
    expect(result.totalMonthlyMid).toBeGreaterThan(0);
    expect(result.upfrontCosts.downPayment).toBe(100000);
    expect(result.disclaimers.length).toBeGreaterThan(0);
  });

  it("includes PMI for low down payment", () => {
    const result = computeOwnershipCosts({
      purchasePrice: 500000, yearBuilt: 2020,
      assumptions: { downPaymentPct: 0.05 },
    });
    const pmi = result.lineItems.find(i => i.category === "pmi");
    expect(pmi).toBeDefined();
  });

  it("separates facts from estimates", () => {
    const result = computeOwnershipCosts({
      purchasePrice: 500000, yearBuilt: 2020, taxAnnual: 8000, hoaFee: 400,
    });
    const facts = result.lineItems.filter(i => i.source === "fact");
    const estimates = result.lineItems.filter(i => i.source === "estimate");
    expect(facts.length).toBeGreaterThanOrEqual(2);
    expect(estimates.length).toBeGreaterThanOrEqual(1);
  });
});
