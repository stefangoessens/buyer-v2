import { describe, expect, it } from "vitest";

import { buildOfferCompensationLedgerPayload } from "@/lib/dealroom/offer-cockpit-ledger";

describe("buildOfferCompensationLedgerPayload", () => {
  it("uses seller concessions as the projected closing credit", () => {
    const payload = buildOfferCompensationLedgerPayload({
      buyerCredits: 2_500,
      sellerCredits: 7_500,
    });

    expect(payload.negotiatedAmount).toBe(7_500);
    expect(payload.projectedClosingCredit).toBe(7_500);
    expect(payload.ipcProjectedSellerCredit).toBe(7_500);
    expect(payload.ipcProjectedBuyerCredit).toBe(0);
  });
});
