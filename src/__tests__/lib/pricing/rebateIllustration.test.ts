import { describe, it, expect } from "vitest";
import {
  illustrateRebate,
  clampPrice,
  nearestSnapPoint,
  formatCurrency,
  SLIDER_MIN_PRICE,
  SLIDER_MAX_PRICE,
  SLIDER_DEFAULT_PRICE,
  SLIDER_SNAP_POINTS,
  DEFAULT_BUYER_SIDE_COMMISSION_PCT,
  BUYER_V2_FEE_PCT,
} from "@/lib/pricing/rebateIllustration";

describe("rebateIllustration — constants", () => {
  it("exposes the canonical slider bounds", () => {
    expect(SLIDER_MIN_PRICE).toBe(100_000);
    expect(SLIDER_MAX_PRICE).toBe(2_000_000);
    expect(SLIDER_DEFAULT_PRICE).toBe(750_000);
  });

  it("exposes the canonical commission/fee defaults", () => {
    expect(DEFAULT_BUYER_SIDE_COMMISSION_PCT).toBe(0.03);
    expect(BUYER_V2_FEE_PCT).toBe(0.01);
  });

  it("exposes 6 strictly ascending snap points", () => {
    expect(SLIDER_SNAP_POINTS).toEqual([
      250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000,
    ]);
    for (let i = 1; i < SLIDER_SNAP_POINTS.length; i++) {
      expect(SLIDER_SNAP_POINTS[i]).toBeGreaterThan(SLIDER_SNAP_POINTS[i - 1]);
    }
  });
});

describe("illustrateRebate(price)", () => {
  it("returns the canonical default-price illustration", () => {
    const result = illustrateRebate(SLIDER_DEFAULT_PRICE);
    expect(result).toEqual({
      price: 750_000,
      buyerSideCommission: 22_500,
      buyerV2Fee: 7_500,
      rebate: 15_000,
      rebateBand: "10k-20k",
      isClamped: false,
    });
  });

  it("computes $100k rebate of $2k in the under-5k band", () => {
    const result = illustrateRebate(100_000);
    expect(result.rebate).toBe(2_000);
    expect(result.rebateBand).toBe("under-5k");
    expect(result.isClamped).toBe(false);
  });

  it("computes $250k rebate of $5k landing in the 5k-10k band (boundary inclusive of 5k)", () => {
    const result = illustrateRebate(250_000);
    expect(result.rebate).toBe(5_000);
    // 5_000 is NOT < 5_000 → falls through to next branch → "5k-10k".
    expect(result.rebateBand).toBe("5k-10k");
  });

  it("computes $300k rebate of $6k in the 5k-10k band", () => {
    const result = illustrateRebate(300_000);
    expect(result.rebate).toBe(6_000);
    expect(result.rebateBand).toBe("5k-10k");
  });

  it("computes $500k rebate of $10k landing in the 10k-20k band (boundary inclusive of 10k)", () => {
    const result = illustrateRebate(500_000);
    expect(result.rebate).toBe(10_000);
    // 10_000 is NOT < 10_000 → next branch → "10k-20k".
    expect(result.rebateBand).toBe("10k-20k");
  });

  it("computes $1M rebate of $20k landing in the over-20k band (boundary inclusive of 20k)", () => {
    const result = illustrateRebate(1_000_000);
    expect(result.rebate).toBe(20_000);
    // 20_000 is NOT < 20_000 → next branch → "over-20k".
    expect(result.rebateBand).toBe("over-20k");
  });

  it("computes $2M rebate of $40k in the over-20k band", () => {
    const result = illustrateRebate(2_000_000);
    expect(result.rebate).toBe(40_000);
    expect(result.rebateBand).toBe("over-20k");
    expect(result.buyerSideCommission).toBe(60_000);
    expect(result.buyerV2Fee).toBe(20_000);
  });

  it("returns rebate $0 / band 'zero' / not clamped at price 0", () => {
    const result = illustrateRebate(0);
    expect(result.rebate).toBe(0);
    expect(result.rebateBand).toBe("zero");
    expect(result.isClamped).toBe(false);
  });

  it("computes the raw rebate at $50k as $1,000 (does not self-clamp price)", () => {
    // illustrateRebate is a pure math fn; clampPrice is the gate.
    const result = illustrateRebate(50_000);
    expect(result.rebate).toBe(1_000);
    expect(result.rebateBand).toBe("under-5k");
    expect(result.isClamped).toBe(false);
  });

  it("clamps to $0 + isClamped:true when buyer-side commission < 1% (0.5% case)", () => {
    const result = illustrateRebate(500_000, 0.005);
    expect(result.buyerSideCommission).toBe(2_500);
    expect(result.buyerV2Fee).toBe(5_000);
    expect(result.rebate).toBe(0);
    expect(result.isClamped).toBe(true);
    expect(result.rebateBand).toBe("zero");
  });

  it("at exactly 1% buyer-side commission rebate is $0 and NOT clamped", () => {
    const result = illustrateRebate(500_000, 0.01);
    expect(result.buyerSideCommission).toBe(5_000);
    expect(result.buyerV2Fee).toBe(5_000);
    expect(result.rebate).toBe(0);
    expect(result.isClamped).toBe(false);
    expect(result.rebateBand).toBe("zero");
  });

  it("at 2% buyer-side commission $500k yields $5k in the 5k-10k band", () => {
    const result = illustrateRebate(500_000, 0.02);
    expect(result.rebate).toBe(5_000);
    expect(result.rebateBand).toBe("5k-10k");
    expect(result.isClamped).toBe(false);
  });

  it("preserves the input price on the result object", () => {
    expect(illustrateRebate(123_456).price).toBe(123_456);
  });
});

describe("clampPrice(raw)", () => {
  it("clamps values below the minimum to SLIDER_MIN_PRICE", () => {
    expect(clampPrice(50_000)).toBe(SLIDER_MIN_PRICE);
    expect(clampPrice(0)).toBe(SLIDER_MIN_PRICE);
  });

  it("clamps negative values to SLIDER_MIN_PRICE", () => {
    expect(clampPrice(-1)).toBe(SLIDER_MIN_PRICE);
    expect(clampPrice(-1_000_000)).toBe(SLIDER_MIN_PRICE);
  });

  it("clamps values above the maximum to SLIDER_MAX_PRICE", () => {
    expect(clampPrice(2_500_000)).toBe(SLIDER_MAX_PRICE);
    expect(clampPrice(Number.MAX_SAFE_INTEGER)).toBe(SLIDER_MAX_PRICE);
  });

  it("rounds fractional in-range values to the nearest integer", () => {
    expect(clampPrice(750_000.7)).toBe(750_001);
    expect(clampPrice(750_000.4)).toBe(750_000);
  });

  it("returns SLIDER_DEFAULT_PRICE for non-finite inputs", () => {
    expect(clampPrice(Number.NaN)).toBe(SLIDER_DEFAULT_PRICE);
    expect(clampPrice(Number.POSITIVE_INFINITY)).toBe(SLIDER_DEFAULT_PRICE);
    expect(clampPrice(Number.NEGATIVE_INFINITY)).toBe(SLIDER_DEFAULT_PRICE);
  });

  it("passes through in-range integer values unchanged", () => {
    expect(clampPrice(432_100)).toBe(432_100);
    expect(clampPrice(SLIDER_MIN_PRICE)).toBe(SLIDER_MIN_PRICE);
    expect(clampPrice(SLIDER_MAX_PRICE)).toBe(SLIDER_MAX_PRICE);
  });
});

describe("nearestSnapPoint(price)", () => {
  it("returns each snap point as a fixed point", () => {
    for (const snap of SLIDER_SNAP_POINTS) {
      expect(nearestSnapPoint(snap)).toBe(snap);
    }
  });

  it("snaps $600k → $500k (closer than $750k)", () => {
    expect(nearestSnapPoint(600_000)).toBe(500_000);
  });

  it("snaps $900k → $1M (closer than $750k)", () => {
    expect(nearestSnapPoint(900_000)).toBe(1_000_000);
  });

  it("breaks the $1.25M tie deterministically toward the lower snap point ($1M)", () => {
    // $1.25M is exactly midway between $1M and $1.5M; the impl picks the
    // first encountered when distances are equal — which is $1M.
    expect(nearestSnapPoint(1_250_000)).toBe(1_000_000);
  });

  it("returns the lowest snap point for inputs below the lowest snap point", () => {
    // SLIDER_MIN_PRICE is 100k which is below the lowest snap point (250k).
    expect(nearestSnapPoint(100_000)).toBe(250_000);
  });

  it("returns the highest snap point for inputs above the highest snap point", () => {
    expect(nearestSnapPoint(3_000_000)).toBe(2_000_000);
    expect(nearestSnapPoint(SLIDER_MAX_PRICE + 1)).toBe(2_000_000);
  });
});

describe("formatCurrency(dollars)", () => {
  it("formats zero as $0", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("formats $15,000 with thousands separators and no cents", () => {
    expect(formatCurrency(15_000)).toBe("$15,000");
  });

  it("formats $1,234,567 with thousands separators and no cents", () => {
    expect(formatCurrency(1_234_567)).toBe("$1,234,567");
  });

  it("rounds fractional dollars to the nearest whole dollar", () => {
    expect(formatCurrency(42.5)).toBe("$43");
    expect(formatCurrency(42.4)).toBe("$42");
  });

  it("formats large six-figure rebates correctly", () => {
    expect(formatCurrency(40_000)).toBe("$40,000");
  });
});
