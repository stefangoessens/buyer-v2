import { v } from "convex/values";

// User roles
export const userRole = v.union(
  v.literal("buyer"),
  v.literal("broker"),
  v.literal("admin")
);

export const authProvider = v.union(
  v.literal("clerk"),
  v.literal("auth0")
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

export const supersessionReason = v.union(
  v.literal("upgrade_to_full_representation"),
  v.literal("correction"),
  v.literal("amendment"),
  v.literal("renewal"),
  v.literal("replace_expired"),
  v.literal("broker_decision")
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

// ─── Intake Rate Limits & Abuse Controls (KIN-820) ─────────────────────────

/**
 * Typed channel for the intake rate limiter. Each channel has its own
 * config in `src/lib/security/rate-limiter.ts` / `convex/lib/rateLimiter.ts`
 * — adding a new channel here means adding a matching entry to
 * `CHANNEL_CONFIGS`.
 */
export const rateLimitChannel = v.union(
  v.literal("homepage"), // paste-a-link on marketing site
  v.literal("sms"), // text-a-link intake
  v.literal("extension"), // chrome extension intake
  v.literal("share_import"), // iOS share sheet
  v.literal("manual_entry") // manual address entry
);

// ─── Buyer Update Events (KIN-837) ─────────────────────────────────────────

// Buyer update event types — aligned with the analytics taxonomy (KIN-860)
// but not every event fires both a buyer update and an analytics event.
// Keep this union in sync with `BuyerEventType` in `convex/lib/buyerEvents.ts`
// and the mirror at `src/lib/dealroom/buyer-events.ts`.
export const buyerEventType = v.union(
  v.literal("tour_confirmed"),
  v.literal("tour_canceled"),
  v.literal("tour_reminder"),
  v.literal("agent_assigned"),
  v.literal("offer_countered"),
  v.literal("offer_accepted"),
  v.literal("offer_rejected"),
  v.literal("agreement_received"),
  v.literal("agreement_signed_reminder"),
  v.literal("document_ready"),
  v.literal("milestone_upcoming"),
  v.literal("price_changed"),
  v.literal("new_comp_arrived"),
  v.literal("ai_analysis_ready"),
  v.literal("broker_message")
);

// Event lifecycle status:
//   pending    — newly emitted, not yet seen by buyer
//   seen       — buyer has viewed it (but not dismissed)
//   resolved   — dismissed or acted upon
//   superseded — replaced by a newer event on the same dedupeKey
export const buyerEventStatus = v.union(
  v.literal("pending"),
  v.literal("seen"),
  v.literal("resolved"),
  v.literal("superseded")
);

// Event display priority — ordered low → normal → high.
export const buyerEventPriority = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high")
);

// Who resolved the event, for audit provenance.
export const buyerEventResolvedBy = v.union(
  v.literal("buyer"),
  v.literal("system"),
  v.literal("broker")
);

// Typed buyer update event state. This is the backend source of truth;
// channel-specific rendering consumes read models derived from this union.
export const buyerEventState = v.union(
  v.object({
    kind: v.literal("tour_confirmed"),
    referenceId: v.string(),
    scheduledStartAt: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("tour_canceled"),
    referenceId: v.string(),
    canceledAt: v.optional(v.string()),
    reasonCode: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("tour_reminder"),
    referenceId: v.string(),
    scheduledStartAt: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("agent_assigned"),
    referenceId: v.string(),
    agentName: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("offer_countered"),
    referenceId: v.string(),
    amountCents: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("offer_accepted"),
    referenceId: v.string(),
    amountCents: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("offer_rejected"),
    referenceId: v.string(),
    amountCents: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("agreement_received"),
    referenceId: v.string(),
    agreementType: v.optional(
      v.union(v.literal("tour_pass"), v.literal("full_representation")),
    ),
  }),
  v.object({
    kind: v.literal("agreement_signed_reminder"),
    referenceId: v.string(),
    agreementType: v.optional(
      v.union(v.literal("tour_pass"), v.literal("full_representation")),
    ),
    dueAt: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("document_ready"),
    referenceId: v.string(),
    documentType: v.optional(
      v.union(
        v.literal("agreement"),
        v.literal("disclosure"),
        v.literal("closing"),
        v.literal("other"),
      ),
    ),
  }),
  v.object({
    kind: v.literal("milestone_upcoming"),
    referenceId: v.string(),
    milestoneName: v.optional(v.string()),
    dueAt: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("price_changed"),
    referenceId: v.string(),
    previousPriceCents: v.optional(v.number()),
    currentPriceCents: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("new_comp_arrived"),
    referenceId: v.string(),
    compCount: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("ai_analysis_ready"),
    referenceId: v.string(),
    analysisType: v.optional(
      v.union(
        v.literal("pricing"),
        v.literal("leverage"),
        v.literal("offer"),
        v.literal("cost"),
        v.literal("case_synthesis"),
        v.literal("other"),
      ),
    ),
  }),
  v.object({
    kind: v.literal("broker_message"),
    referenceId: v.string(),
    senderRole: v.optional(
      v.union(v.literal("broker"), v.literal("agent"), v.literal("system")),
    ),
  }),
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

// ─── Lead Attribution (KIN-819) ────────────────────────────────────────────

// Lifecycle status for a leadAttribution row:
//   anonymous  — captured pre-registration, only sessionId is known
//   registered — handoff to an authenticated user has completed (userId set)
//   converted  — the registered user has performed a meaningful action,
//                e.g. first deal room creation or first tour request
export const leadAttributionStatus = v.union(
  v.literal("anonymous"),
  v.literal("registered"),
  v.literal("converted")
);

// ─── SMS Intake (KIN-776) ──────────────────────────────────────────────────

// SMS consent status — derived from inbound keyword tracking.
//   opted_in   — user has sent a link or "START"
//   opted_out  — user has sent STOP / CANCEL / QUIT / OPT-OUT / UNSUBSCRIBE
//   suppressed — operator-added hard suppression (spam, abuse, etc.)
//   unknown    — row exists but user hasn't performed an explicit opt action
export const smsConsentStatus = v.union(
  v.literal("opted_in"),
  v.literal("opted_out"),
  v.literal("suppressed"),
  v.literal("unknown")
);

// Outcome of a single inbound SMS processing attempt. Stored on every
// `smsIntakeMessages` row so ops dashboards and tests can bucket
// messages without parsing reply text.
export const smsIntakeOutcome = v.union(
  v.literal("url_processed"),    // happy path: link parsed and source listing created
  v.literal("help_reply"),       // HELP keyword — informational reply sent
  v.literal("stop_received"),    // STOP / CANCEL / QUIT / OPT-OUT / UNSUBSCRIBE
  v.literal("start_received"),   // START / UNSTOP — re-opted in
  v.literal("invalid_url"),      // message has text but no supported URL
  v.literal("unsupported_url"),  // URL is valid but not from a supported portal
  v.literal("suppressed"),       // user is in opted_out or suppressed state
  v.literal("duplicate"),        // messageSid already processed
  v.literal("empty_body")        // no body at all
);
