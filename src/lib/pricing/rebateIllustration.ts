/**
 * Canonical rebate illustration helper (KIN-1086).
 *
 * Powers the homepage interactive rebate slider — a "how much could I
 * get back at closing?" illustration that turns a home price into a
 * rebate estimate. Intentionally minimal: pure functions only, no
 * framework imports, no side effects. This is the single source of
 * truth for the slider math and is imported by the UI section, the
 * content catalog, the analytics instrumentation, and the test suite.
 *
 * Model summary
 * -------------
 * buyer-v2 acts as the buyer's Florida brokerage. The default
 * illustration assumes:
 *   - Seller-paid buyer-side commission: 3% of home price
 *   - buyer-v2 flat fee: 1% of home price (collected at close)
 *   - Estimated rebate to the buyer: buyer-side commission - fee
 *
 * When the listing offers less than 1% buyer-side compensation the
 * raw math would go negative; in that case the rebate clamps to $0
 * and the result reports `isClamped: true` so the UI can surface a
 * dedicated "no rebate, still full representation" state. The
 * optional `buyerSideCommissionPct` parameter exists so that edge
 * case is callable — the homepage slider always passes the default.
 *
 * Everything in this file is pure. No React, no DOM, no analytics.
 */

export const DEFAULT_BUYER_SIDE_COMMISSION_PCT = 0.03;
export const BUYER_V2_FEE_PCT = 0.01;

export const SLIDER_MIN_PRICE = 100_000;
export const SLIDER_MAX_PRICE = 2_000_000;
export const SLIDER_DEFAULT_PRICE = 750_000;
export const SLIDER_SNAP_POINTS: readonly number[] = [
  250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000,
] as const;

export type RebateBand =
  | "zero"
  | "under-5k"
  | "5k-10k"
  | "10k-20k"
  | "over-20k";

export interface RebateIllustration {
  price: number;
  buyerSideCommission: number;
  buyerV2Fee: number;
  rebate: number;
  rebateBand: RebateBand;
  isClamped: boolean;
}

function classifyBand(rebate: number): RebateBand {
  if (rebate === 0) return "zero";
  if (rebate < 5_000) return "under-5k";
  if (rebate < 10_000) return "5k-10k";
  if (rebate < 20_000) return "10k-20k";
  return "over-20k";
}

export function illustrateRebate(
  price: number,
  buyerSideCommissionPct: number = DEFAULT_BUYER_SIDE_COMMISSION_PCT,
): RebateIllustration {
  const buyerSideCommission = price * buyerSideCommissionPct;
  const buyerV2Fee = price * BUYER_V2_FEE_PCT;
  const rawRebate = buyerSideCommission - buyerV2Fee;
  const isClamped = rawRebate < 0;
  const rebate = isClamped ? 0 : rawRebate;
  return {
    price,
    buyerSideCommission,
    buyerV2Fee,
    rebate,
    rebateBand: classifyBand(rebate),
    isClamped,
  };
}

export function clampPrice(raw: number): number {
  if (!Number.isFinite(raw)) return SLIDER_DEFAULT_PRICE;
  const rounded = Math.round(raw);
  if (rounded < SLIDER_MIN_PRICE) return SLIDER_MIN_PRICE;
  if (rounded > SLIDER_MAX_PRICE) return SLIDER_MAX_PRICE;
  return rounded;
}

export function nearestSnapPoint(price: number): number {
  let nearest = SLIDER_SNAP_POINTS[0];
  let nearestDistance = Math.abs(price - nearest);
  for (let i = 1; i < SLIDER_SNAP_POINTS.length; i++) {
    const candidate = SLIDER_SNAP_POINTS[i];
    const distance = Math.abs(price - candidate);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCurrency(dollars: number): string {
  return currencyFormatter.format(dollars);
}
