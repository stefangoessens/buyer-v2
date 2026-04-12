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

// ─── Availability Windows (KIN-836) ────────────────────────────────────────

// Availability window owner type
export const availabilityOwnerType = v.union(
  v.literal("buyer"),
  v.literal("agent"),
  v.literal("tour_request")
);

// Availability window status
export const availabilityStatus = v.union(
  v.literal("available"),
  v.literal("tentative"),
  v.literal("unavailable"),
  v.literal("booked")
);

// ─── Communication Templates (KIN-835) ─────────────────────────────────────

// Communication channel — which delivery surface the template targets.
// "email" and "push" may have a subject; "sms" and "in_app" are body-only.
export const communicationChannel = v.union(
  v.literal("email"),
  v.literal("sms"),
  v.literal("in_app"),
  v.literal("push")
);

// ─── Offer Eligibility State (KIN-822) ─────────────────────────────────────

// Machine-readable blocking reason codes for offer eligibility.
// Persisted alongside a human-readable message on offerEligibilityState, so
// UI layers can branch on a stable code rather than parsing strings.
export const eligibilityBlockingReason = v.union(
  v.literal("no_signed_agreement"),
  v.literal("tour_pass_only_no_full_rep"),
  v.literal("agreement_canceled"),
  v.literal("agreement_replaced_pending_new"),
  v.literal("buyer_not_found"),
  v.literal("not_authenticated")
);

// Eligibility-facing view of the current governing agreement type.
// "none" means no agreement currently grants any level of access.
export const eligibilityAgreementType = v.union(
  v.literal("none"),
  v.literal("tour_pass"),
  v.literal("full_representation")
);

// Action the buyer must take to become eligible to make offers.
export const eligibilityRequiredAction = v.union(
  v.literal("none"),
  v.literal("sign_agreement"),
  v.literal("upgrade_to_full_rep")
);

// ─── Lender Credit Validation (KIN-838) ────────────────────────────────────

// Lender credit validation outcome — tri-state so review_required cases are
// explicit and not conflated with either a pass or a hard failure.
export const lenderValidationOutcome = v.union(
  v.literal("valid"),
  v.literal("invalid"),
  v.literal("review_required")
);

// Machine-readable reason codes for invalid/review states.
// Mirrored in `src/lib/dealroom/lender-credit-validate.ts` and
// `convex/lib/lenderCreditValidate.ts` — keep in sync.
export const lenderValidationReasonCode = v.union(
  v.literal("exceeds_ipc_limit"),
  v.literal("cash_purchase_no_constraint"),
  v.literal("unknown_financing_type"),
  v.literal("missing_ltv_data"),
  v.literal("high_ltv_stricter_limit"),
  v.literal("edge_case_near_limit"),
  v.literal("va_cash_in_at_closing"),
  v.literal("fha_seller_contribution_cap")
);
