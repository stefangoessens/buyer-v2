import { describe, expect, it } from "vitest";

import {
  DISCREPANCY_THRESHOLD_DOLLARS,
  buildCompensationPrompt,
  canTransitionCompensationStatus,
  computeCompensationLedgerSnapshot,
  computeCompensationReconciliation,
} from "@/lib/dealroom/compensation-ledger";

describe("canTransitionCompensationStatus", () => {
  it("allows forward lifecycle transitions", () => {
    expect(
      canTransitionCompensationStatus("unknown", "seller_disclosed_off_mls"),
    ).toBe(true);
    expect(
      canTransitionCompensationStatus(
        "seller_disclosed_off_mls",
        "negotiated_in_offer",
      ),
    ).toBe(true);
    expect(
      canTransitionCompensationStatus("negotiated_in_offer", "buyer_paid"),
    ).toBe(true);
  });

  it("rejects backward and terminal transitions", () => {
    expect(
      canTransitionCompensationStatus("buyer_paid", "unknown"),
    ).toBe(false);
    expect(
      canTransitionCompensationStatus(
        "negotiated_in_offer",
        "seller_disclosed_off_mls",
      ),
    ).toBe(false);
    expect(
      canTransitionCompensationStatus("buyer_paid", "buyer_paid"),
    ).toBe(false);
  });
});

describe("computeCompensationLedgerSnapshot", () => {
  it("uses the latest snapshot per bucket instead of summing historical states", () => {
    const snapshot = computeCompensationLedgerSnapshot([
      {
        entryType: "expected_buyer_fee",
        amount: 12_000,
        createdAt: "2026-04-12T10:00:00.000Z",
      },
      {
        entryType: "expected_buyer_fee",
        amount: 9_500,
        createdAt: "2026-04-12T11:00:00.000Z",
      },
      {
        entryType: "seller_paid_amount",
        amount: 4_000,
        createdAt: "2026-04-12T10:30:00.000Z",
      },
      {
        entryType: "seller_paid_amount",
        amount: 5_500,
        createdAt: "2026-04-12T11:30:00.000Z",
      },
      {
        entryType: "projected_closing_credit",
        amount: 2_800,
        createdAt: "2026-04-12T11:45:00.000Z",
      },
      {
        entryType: "buyer_paid_amount",
        amount: 4_000,
        createdAt: "2026-04-12T12:00:00.000Z",
      },
    ]);

    expect(snapshot.expectedBuyerFee).toBe(9_500);
    expect(snapshot.sellerPaidAmount).toBe(5_500);
    expect(snapshot.buyerPaidAmount).toBe(4_000);
    expect(snapshot.projectedClosingCredit).toBe(2_800);
    expect(snapshot.remainingFeeBalance).toBe(0);
    expect(snapshot.projectedBuyerCashToClose).toBe(1_200);
  });

  it("applies adjustments to the targeted bucket", () => {
    const snapshot = computeCompensationLedgerSnapshot([
      {
        entryType: "expected_buyer_fee",
        amount: 10_000,
        createdAt: "2026-04-12T10:00:00.000Z",
      },
      {
        entryType: "adjustment",
        amount: -500,
        adjustmentTarget: "expected_buyer_fee",
        createdAt: "2026-04-12T11:00:00.000Z",
      },
      {
        entryType: "projected_closing_credit",
        amount: 1_500,
        createdAt: "2026-04-12T12:00:00.000Z",
      },
      {
        entryType: "adjustment",
        amount: 250,
        adjustmentTarget: "projected_closing_credit",
        createdAt: "2026-04-12T12:30:00.000Z",
      },
    ]);

    expect(snapshot.expectedBuyerFee).toBe(9_500);
    expect(snapshot.projectedClosingCredit).toBe(1_750);
    expect(snapshot.remainingFeeBalance).toBe(9_500);
  });
});

describe("buildCompensationPrompt", () => {
  it("surfaces a listing-agent follow-up prompt when showing coordination has started", () => {
    const prompt = buildCompensationPrompt({
      status: "unknown",
      lastLifecycleEvent: "showing_coordination_started",
      snapshot: computeCompensationLedgerSnapshot([]),
    });

    expect(prompt.key).toBe("listing_agent_confirmation_needed");
    expect(prompt.title).toMatch(/listing-side compensation/i);
  });

  it("surfaces an offer-driven prompt once offer terms are recorded", () => {
    const snapshot = computeCompensationLedgerSnapshot([
      {
        entryType: "projected_closing_credit",
        amount: 3_200,
        createdAt: "2026-04-12T12:00:00.000Z",
      },
    ]);

    const prompt = buildCompensationPrompt({
      status: "negotiated_in_offer",
      lastLifecycleEvent: "offer_terms_submitted",
      snapshot,
    });

    expect(prompt.key).toBe("offer_terms_recorded");
    expect(prompt.body).toContain("$3200.00");
  });
});

describe("computeCompensationReconciliation", () => {
  it("compares projected and actual closing credits", () => {
    const result = computeCompensationReconciliation([
      {
        entryType: "projected_closing_credit",
        amount: 4_000,
        createdAt: "2026-04-12T10:00:00.000Z",
      },
      {
        entryType: "actual_closing_credit",
        amount: 3_930,
        createdAt: "2026-04-12T16:00:00.000Z",
      },
    ]);

    expect(result.expectedTotal).toBe(4_000);
    expect(result.actualTotal).toBe(3_930);
    expect(result.discrepancyAmount).toBe(70);
    expect(result.discrepancyFlag).toBe(true);
    expect(result.discrepancyDetails).toContain(
      DISCREPANCY_THRESHOLD_DOLLARS.toFixed(2),
    );
  });

  it("stays quiet when no actual closing credit is recorded yet", () => {
    const result = computeCompensationReconciliation([
      {
        entryType: "projected_closing_credit",
        amount: 2_500,
        createdAt: "2026-04-12T10:00:00.000Z",
      },
    ]);

    expect(result.expectedTotal).toBe(2_500);
    expect(result.actualTotal).toBeUndefined();
    expect(result.discrepancyFlag).toBe(false);
    expect(result.discrepancyDetails).toBeUndefined();
  });
});
