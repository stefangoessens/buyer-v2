export type CompensationStatus =
  | "unknown"
  | "seller_disclosed_off_mls"
  | "negotiated_in_offer"
  | "buyer_paid";

export type FeeLedgerEntryType =
  | "fee_set"
  | "expected_buyer_fee"
  | "seller_credit"
  | "seller_paid_amount"
  | "buyer_credit"
  | "closing_credit_projection"
  | "projected_closing_credit"
  | "buyer_paid_amount"
  | "actual_closing"
  | "actual_closing_credit"
  | "adjustment";

export type LedgerBucket =
  | "expected_buyer_fee"
  | "seller_paid_amount"
  | "buyer_paid_amount"
  | "projected_closing_credit"
  | "actual_closing_credit";

export type LedgerAdjustmentTarget =
  | "expected_buyer_fee"
  | "seller_paid_amount"
  | "buyer_paid_amount"
  | "projected_closing_credit";

export type CompensationLifecycleEvent =
  | "deal_room_created"
  | "showing_coordination_started"
  | "listing_agent_confirmed"
  | "offer_terms_submitted"
  | "contract_executed"
  | "closing_statement_recorded"
  | "manual_override";

export type LedgerReviewState =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type LedgerVisibility = "buyer_visible" | "internal_only";
export type CompensationViewerRole = "buyer" | "broker" | "admin";

export interface CompensationLedgerEntryLike {
  entryType: FeeLedgerEntryType;
  amount: number;
  createdAt: string;
  adjustmentTarget?: LedgerAdjustmentTarget;
}

export interface RawCompensationLedgerEntry {
  _id: string;
  _creationTime: number;
  dealRoomId: string;
  entryType: FeeLedgerEntryType;
  amount: number;
  description: string;
  source: string;
  lifecycleEvent?: CompensationLifecycleEvent;
  provenance: {
    actorId?: string;
    triggeredBy?: string;
    sourceDocument?: string;
    timestamp: string;
  };
  offerId?: string;
  contractId?: string;
  dealStatusAtChange?: string;
  offerStatusAtChange?: string;
  compensationStatusAtChange?: CompensationStatus;
  internalReviewState?: LedgerReviewState;
  visibility?: LedgerVisibility;
  financingType?: string;
  ipcLimitPercent?: number;
  adjustmentTarget?: LedgerAdjustmentTarget;
  createdAt: string;
}

export interface RawCompensationStatusRow {
  _id: string;
  _creationTime: number;
  dealRoomId: string;
  status: CompensationStatus;
  previousStatus?: CompensationStatus;
  transitionReason?: string;
  transitionActorId?: string;
  lastLifecycleEvent?: CompensationLifecycleEvent;
  buyerPromptKey?: string;
  offerId?: string;
  contractId?: string;
  internalReviewState?: LedgerReviewState;
  sourceDocument?: string;
  lastTransitionAt: string;
  sellerDisclosedAmount?: number;
  negotiatedAmount?: number;
  buyerPaidAmount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompensationLedgerSnapshot {
  expectedBuyerFee: number;
  sellerPaidAmount: number;
  buyerPaidAmount: number;
  projectedClosingCredit: number;
  actualClosingCredit: number | null;
  remainingFeeBalance: number;
  projectedBuyerCashToClose: number;
}

export interface CompensationPrompt {
  key:
    | "compensation_unknown"
    | "listing_agent_confirmation_needed"
    | "seller_disclosed_confirmed"
    | "offer_terms_recorded"
    | "buyer_payment_required"
    | "closing_credit_recorded";
  title: string;
  body: string;
}

export const DISCREPANCY_THRESHOLD_DOLLARS = 50;

export const ALLOWED_COMPENSATION_TRANSITIONS: Record<
  CompensationStatus,
  CompensationStatus[]
> = {
  unknown: ["seller_disclosed_off_mls", "negotiated_in_offer", "buyer_paid"],
  seller_disclosed_off_mls: ["negotiated_in_offer", "buyer_paid"],
  negotiated_in_offer: ["buyer_paid"],
  buyer_paid: [],
};

export function canTransitionCompensationStatus(
  from: CompensationStatus,
  to: CompensationStatus,
): boolean {
  return ALLOWED_COMPENSATION_TRANSITIONS[from].includes(to);
}

export function filterLedgerEntriesForViewer<T extends { visibility?: LedgerVisibility }>(
  entries: T[],
  role: CompensationViewerRole,
): T[] {
  if (role === "buyer") {
    return entries.filter((entry) => entry.visibility !== "internal_only");
  }
  return entries;
}

export function projectBuyerLedgerEntry(
  entry: RawCompensationLedgerEntry,
): RawCompensationLedgerEntry {
  return {
    _id: entry._id,
    _creationTime: entry._creationTime,
    dealRoomId: entry.dealRoomId,
    entryType: entry.entryType,
    amount: entry.amount,
    description: entry.description,
    source: entry.source,
    lifecycleEvent: entry.lifecycleEvent,
    provenance: {
      timestamp: entry.provenance.timestamp,
    },
    createdAt: entry.createdAt,
  };
}

export function projectBuyerCompensationStatus(
  row: RawCompensationStatusRow,
): RawCompensationStatusRow {
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    dealRoomId: row.dealRoomId,
    status: row.status,
    lastLifecycleEvent: row.lastLifecycleEvent,
    buyerPromptKey: row.buyerPromptKey,
    lastTransitionAt: row.lastTransitionAt,
    sellerDisclosedAmount: row.sellerDisclosedAmount,
    negotiatedAmount: row.negotiatedAmount,
    buyerPaidAmount: row.buyerPaidAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function normalizeLedgerBucket(
  entryType: FeeLedgerEntryType,
  adjustmentTarget?: LedgerAdjustmentTarget,
): LedgerBucket {
  switch (entryType) {
    case "fee_set":
    case "expected_buyer_fee":
      return "expected_buyer_fee";
    case "seller_credit":
    case "seller_paid_amount":
      return "seller_paid_amount";
    case "buyer_paid_amount":
      return "buyer_paid_amount";
    case "buyer_credit":
    case "closing_credit_projection":
    case "projected_closing_credit":
      return "projected_closing_credit";
    case "actual_closing":
    case "actual_closing_credit":
      return "actual_closing_credit";
    case "adjustment":
      return adjustmentTarget ?? "expected_buyer_fee";
  }
}

export function computeCompensationLedgerSnapshot(
  entries: CompensationLedgerEntryLike[],
): CompensationLedgerSnapshot {
  const latestByBucket = new Map<LedgerBucket, CompensationLedgerEntryLike>();
  const adjustmentsByBucket: Record<LedgerAdjustmentTarget, number> = {
    expected_buyer_fee: 0,
    seller_paid_amount: 0,
    buyer_paid_amount: 0,
    projected_closing_credit: 0,
  };

  for (const entry of entries) {
    const bucket = normalizeLedgerBucket(entry.entryType, entry.adjustmentTarget);
    if (entry.entryType === "adjustment") {
      const target = (entry.adjustmentTarget ?? "expected_buyer_fee") as LedgerAdjustmentTarget;
      adjustmentsByBucket[target] += entry.amount;
      continue;
    }

    const existing = latestByBucket.get(bucket);
    if (!existing || entry.createdAt > existing.createdAt) {
      latestByBucket.set(bucket, entry);
    }
  }

  const expectedBuyerFee =
    (latestByBucket.get("expected_buyer_fee")?.amount ?? 0) +
    adjustmentsByBucket.expected_buyer_fee;
  const sellerPaidAmount =
    (latestByBucket.get("seller_paid_amount")?.amount ?? 0) +
    adjustmentsByBucket.seller_paid_amount;
  const buyerPaidAmount =
    (latestByBucket.get("buyer_paid_amount")?.amount ?? 0) +
    adjustmentsByBucket.buyer_paid_amount;
  const projectedClosingCredit =
    (latestByBucket.get("projected_closing_credit")?.amount ?? 0) +
    adjustmentsByBucket.projected_closing_credit;
  const actualClosingCredit =
    latestByBucket.get("actual_closing_credit")?.amount ?? null;

  const remainingFeeBalance = Math.max(
    0,
    expectedBuyerFee - sellerPaidAmount - buyerPaidAmount,
  );

  return {
    expectedBuyerFee,
    sellerPaidAmount,
    buyerPaidAmount,
    projectedClosingCredit,
    actualClosingCredit,
    remainingFeeBalance,
    projectedBuyerCashToClose: buyerPaidAmount - projectedClosingCredit,
  };
}

export function buildCompensationPrompt(input: {
  status: CompensationStatus;
  snapshot: CompensationLedgerSnapshot;
  lastLifecycleEvent?: CompensationLifecycleEvent;
}): CompensationPrompt {
  if (input.lastLifecycleEvent === "closing_statement_recorded") {
    return {
      key: "closing_credit_recorded",
      title: "Closing statement recorded",
      body:
        input.snapshot.actualClosingCredit === null
          ? "We logged the closing package. A broker will reconcile the final credit."
          : `We recorded a final closing credit of $${input.snapshot.actualClosingCredit.toFixed(2)} and flagged any mismatch for review.`,
    };
  }

  switch (input.status) {
    case "unknown":
      if (input.lastLifecycleEvent === "showing_coordination_started") {
        return {
          key: "listing_agent_confirmation_needed",
          title: "Waiting on listing-side compensation confirmation",
          body:
            "We have started coordination and still need the listing side to confirm how buyer-broker compensation will be handled.",
        };
      }
      return {
        key: "compensation_unknown",
        title: "Compensation is still being confirmed",
        body:
          "We have not confirmed whether the seller or buyer will fund the buyer-broker fee yet.",
      };
    case "seller_disclosed_off_mls":
      return {
        key: "seller_disclosed_confirmed",
        title: "Seller-paid compensation was disclosed",
        body: `The listing side disclosed $${input.snapshot.sellerPaidAmount.toFixed(2)} in seller-paid buyer-broker compensation.`,
      };
    case "negotiated_in_offer":
      return {
        key: "offer_terms_recorded",
        title: "Offer terms now drive the closing credit",
        body: `We are projecting a $${input.snapshot.projectedClosingCredit.toFixed(2)} closing credit from the negotiated offer terms.`,
      };
    case "buyer_paid":
      return {
        key: "buyer_payment_required",
        title: "Buyer-paid compensation applies",
        body: `The current ledger projects $${input.snapshot.buyerPaidAmount.toFixed(2)} as buyer-paid compensation before closing credits.`,
      };
  }
}

export function computeCompensationReconciliation(
  entries: CompensationLedgerEntryLike[],
  threshold = DISCREPANCY_THRESHOLD_DOLLARS,
) {
  const snapshot = computeCompensationLedgerSnapshot(entries);
  const expectedTotal = snapshot.projectedClosingCredit;
  const actualTotal = snapshot.actualClosingCredit ?? undefined;

  if (actualTotal === undefined) {
    return {
      expectedTotal,
      actualTotal: undefined,
      discrepancyAmount: undefined,
      discrepancyFlag: false,
      discrepancyDetails: undefined,
    };
  }

  const discrepancyAmount = Math.abs(expectedTotal - actualTotal);
  const discrepancyFlag = discrepancyAmount > threshold;

  return {
    expectedTotal,
    actualTotal,
    discrepancyAmount,
    discrepancyFlag,
    discrepancyDetails: discrepancyFlag
      ? `Expected $${expectedTotal.toFixed(2)}, actual $${actualTotal.toFixed(2)}. Discrepancy: $${discrepancyAmount.toFixed(2)} exceeds $${threshold.toFixed(2)}.`
      : undefined,
  };
}
