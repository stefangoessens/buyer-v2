import type { OfferTerms } from "./offer-cockpit-types";

export interface OfferCompensationLedgerPayload {
  negotiatedAmount: number;
  projectedClosingCredit: number;
  ipcProjectedSellerCredit: number;
  ipcProjectedBuyerCredit: number;
}

/**
 * Map offer-cockpit terms into the compensation-ledger payload.
 *
 * Seller concessions are the projected buyer closing credit subject to IPC
 * limits. Buyer credits are money the buyer pays at closing and should not
 * be fed into the ledger's projected credit path.
 */
export function buildOfferCompensationLedgerPayload(
  terms: Pick<OfferTerms, "buyerCredits" | "sellerCredits">,
): OfferCompensationLedgerPayload {
  return {
    negotiatedAmount: terms.sellerCredits,
    projectedClosingCredit: terms.sellerCredits,
    ipcProjectedSellerCredit: terms.sellerCredits,
    ipcProjectedBuyerCredit: 0,
  };
}
