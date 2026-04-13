import type {
  OfferCockpitValidation,
  OfferCockpitValidationError,
  OfferTerms,
} from "./offer-cockpit-types";

export interface ValidateInput {
  terms: OfferTerms;
  listPrice: number;
  buyerMaxBudget?: number;
}

const MIN_EARNEST_RATIO = 0.005;
const MAX_EARNEST_RATIO = 0.1;
const MIN_CLOSING_DAYS = 7;
const MAX_CLOSING_DAYS = 120;
const MIN_OFFER_PRICE_FLOOR_PCT = 0.5;

export function validateOfferTerms(input: ValidateInput): OfferCockpitValidation {
  const { terms, listPrice, buyerMaxBudget } = input;
  const errors: OfferCockpitValidationError[] = [];
  const warnings: OfferCockpitValidationError[] = [];

  if (!Number.isFinite(terms.offerPrice) || terms.offerPrice <= 0) {
    errors.push({
      field: "offerPrice",
      code: "offer_price_required",
      message: "Offer price is required.",
    });
  } else {
    if (terms.offerPrice < listPrice * MIN_OFFER_PRICE_FLOOR_PCT) {
      errors.push({
        field: "offerPrice",
        code: "offer_price_too_low",
        message: `Offer cannot be more than ${Math.round((1 - MIN_OFFER_PRICE_FLOOR_PCT) * 100)}% below list.`,
      });
    }
    if (buyerMaxBudget && terms.offerPrice > buyerMaxBudget) {
      errors.push({
        field: "offerPrice",
        code: "offer_price_exceeds_budget",
        message: `Offer exceeds your max budget of $${buyerMaxBudget.toLocaleString()}.`,
      });
    }
    if (terms.offerPrice > listPrice * 1.2) {
      warnings.push({
        field: "offerPrice",
        code: "offer_price_over_list",
        message: "Offer is more than 20% above list price.",
      });
    }
  }

  if (!Number.isFinite(terms.earnestMoney) || terms.earnestMoney < 0) {
    errors.push({
      field: "earnestMoney",
      code: "earnest_money_required",
      message: "Earnest money cannot be negative.",
    });
  } else if (terms.offerPrice > 0) {
    const ratio = terms.earnestMoney / terms.offerPrice;
    if (ratio < MIN_EARNEST_RATIO) {
      warnings.push({
        field: "earnestMoney",
        code: "earnest_money_low",
        message: "Earnest money is below 0.5% of offer price — may weaken the offer.",
      });
    }
    if (ratio > MAX_EARNEST_RATIO) {
      warnings.push({
        field: "earnestMoney",
        code: "earnest_money_high",
        message: "Earnest money above 10% is unusual and may raise lender questions.",
      });
    }
  }

  if (!Number.isInteger(terms.closingDays) || terms.closingDays < MIN_CLOSING_DAYS) {
    errors.push({
      field: "closingDays",
      code: "closing_days_too_short",
      message: `Closing window must be at least ${MIN_CLOSING_DAYS} days.`,
    });
  } else if (terms.closingDays > MAX_CLOSING_DAYS) {
    errors.push({
      field: "closingDays",
      code: "closing_days_too_long",
      message: `Closing window cannot exceed ${MAX_CLOSING_DAYS} days.`,
    });
  }

  if (terms.buyerCredits < 0) {
    errors.push({
      field: "buyerCredits",
      code: "buyer_credits_negative",
      message: "Buyer credits cannot be negative.",
    });
  }
  if (terms.sellerCredits < 0) {
    errors.push({
      field: "sellerCredits",
      code: "seller_credits_negative",
      message: "Seller credits cannot be negative.",
    });
  }
  if (terms.offerPrice > 0 && terms.sellerCredits > terms.offerPrice * 0.06) {
    warnings.push({
      field: "sellerCredits",
      code: "seller_credits_high",
      message:
        "Seller credits above 6% of offer price may exceed lender IPC limits.",
    });
  }

  if (!Array.isArray(terms.contingencies)) {
    errors.push({
      field: "contingencies",
      code: "contingencies_invalid",
      message: "Contingencies must be a list.",
    });
  } else if (terms.contingencies.length === 0) {
    warnings.push({
      field: "contingencies",
      code: "contingencies_waived",
      message: "Waiving all contingencies increases buyer risk materially.",
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function termsChanged(a: OfferTerms, b: OfferTerms): boolean {
  if (a.offerPrice !== b.offerPrice) return true;
  if (a.earnestMoney !== b.earnestMoney) return true;
  if (a.closingDays !== b.closingDays) return true;
  if (a.buyerCredits !== b.buyerCredits) return true;
  if (a.sellerCredits !== b.sellerCredits) return true;
  if (a.contingencies.length !== b.contingencies.length) return true;
  const aSet = new Set(a.contingencies);
  for (const c of b.contingencies) {
    if (!aSet.has(c)) return true;
  }
  return false;
}

export function formatPriceVsList(offerPrice: number, listPrice: number): string {
  if (listPrice <= 0) return "—";
  const pct = ((offerPrice - listPrice) / listPrice) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return "At list";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}% vs list`;
}
