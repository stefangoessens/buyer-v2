import { v } from "convex/values";

// User roles
export const userRole = v.union(
  v.literal("buyer"),
  v.literal("broker"),
  v.literal("admin")
);

// Deal lifecycle
export const dealStatus = v.union(
  v.literal("intake"),
  v.literal("analysis"),
  v.literal("tour_scheduled"),
  v.literal("offer_prep"),
  v.literal("offer_sent"),
  v.literal("under_contract"),
  v.literal("closing"),
  v.literal("closed"),
  v.literal("withdrawn")
);

// Agreement types and statuses
export const agreementType = v.union(
  v.literal("tour_pass"),
  v.literal("full_representation")
);

export const agreementStatus = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("signed"),
  v.literal("canceled"),
  v.literal("replaced")
);

// Offer statuses
export const offerStatus = v.union(
  v.literal("draft"),
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("submitted"),
  v.literal("countered"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("expired")
);

// Tour statuses
export const tourStatus = v.union(
  v.literal("requested"),
  v.literal("confirmed"),
  v.literal("completed"),
  v.literal("canceled"),
  v.literal("no_show")
);

// Property listing status
export const propertyStatus = v.union(
  v.literal("active"),
  v.literal("pending"),
  v.literal("contingent"),
  v.literal("sold"),
  v.literal("withdrawn")
);

// Source platforms
export const sourcePlatform = v.union(
  v.literal("zillow"),
  v.literal("redfin"),
  v.literal("realtor"),
  v.literal("manual")
);

// AI review state
export const aiReviewState = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected")
);

// Financing type (for IPC limits)
export const financingType = v.union(
  v.literal("cash"),
  v.literal("conventional"),
  v.literal("fha"),
  v.literal("va"),
  v.literal("other")
);

// ─── Fee Ledger & Compensation (KIN-814) ────────────────────────────────────

// Compensation status state machine
export const compensationStatus = v.union(
  v.literal("unknown"),
  v.literal("seller_disclosed_off_mls"),
  v.literal("negotiated_in_offer"),
  v.literal("buyer_paid")
);

// Fee ledger entry types
export const feeLedgerEntryType = v.union(
  v.literal("fee_set"),
  v.literal("seller_credit"),
  v.literal("buyer_credit"),
  v.literal("closing_credit_projection"),
  v.literal("actual_closing"),
  v.literal("adjustment")
);

// Fee ledger source
export const feeLedgerSource = v.union(
  v.literal("listing_agent"),
  v.literal("offer_term"),
  v.literal("contract"),
  v.literal("closing_statement"),
  v.literal("manual"),
  v.literal("system")
);

// Reconciliation report type
export const reconciliationReportType = v.union(
  v.literal("post_close"),
  v.literal("monthly")
);

// Reconciliation review status
export const reconciliationReviewStatus = v.union(
  v.literal("pending"),
  v.literal("reviewed"),
  v.literal("resolved")
);

// ─── Agent Coverage & Payouts (KIN-804) ────────────────────────────────────

// Tour assignment routing path
export const routingPath = v.union(
  v.literal("network"),     // assigned from own agent network
  v.literal("showami"),     // fallback to Showami marketplace
  v.literal("manual")       // manual broker queue assignment
);

// Tour assignment status
export const assignmentStatus = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("canceled")
);

// Showing payout status
export const payoutStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("paid")
);
