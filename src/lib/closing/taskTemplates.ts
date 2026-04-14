/**
 * Closing command center task templates (KIN-1080).
 *
 * Pure TypeScript. No Convex imports — this module is shared between the
 * Convex backend (seedDefaultTasks) and client code that renders the
 * closing command center. All functions are deterministic and side-effect
 * free.
 *
 * Template keys are STABLE. Once shipped, never rename a templateKey — the
 * seed mutation relies on it for idempotency (reseed won't create duplicates
 * when the existing row has a matching templateKey).
 */

import type { CloseTaskCategory, CloseTaskOwnerRole } from "../dealroom/close-tasks";

// ─── Tabs ────────────────────────────────────────────────────────────────

export type ClosingTab =
  | "title"
  | "financing"
  | "inspections"
  | "insurance"
  | "moving_in"
  | "addendums";

export const TAB_ORDER: readonly ClosingTab[] = [
  "title",
  "financing",
  "inspections",
  "insurance",
  "moving_in",
  "addendums",
] as const;

export const TAB_LABELS: Record<ClosingTab, string> = {
  title: "Title",
  financing: "Financing",
  inspections: "Inspections",
  insurance: "Insurance",
  moving_in: "Moving in",
  addendums: "Additional addendums",
};

// ─── Waiting-on roles ────────────────────────────────────────────────────

export type ClosingWaitingOnRole =
  | "buyer"
  | "broker"
  | "title_company"
  | "lender"
  | "inspector"
  | "insurance_agent"
  | "hoa"
  | "seller_side"
  | "moving_company"
  | "other";

// ─── Visibility / template owner role mirrors closeTasks ─────────────────

export type ClosingTemplateVisibility = "buyer_visible" | "internal_only";

// Template-facing subset of CloseTaskOwnerRole. "shared" is not a real
// closeTasks role — when a template says "shared" we resolve it to "buyer"
// at seed time, since shared tasks still need a primary owner in the DB.
export type ClosingTemplateOwnerRole = "buyer" | "broker" | "shared";

// ─── Due-date resolution strategies ──────────────────────────────────────

export type DueDateStrategy =
  | { kind: "relative_to_closing"; offsetDays: number }
  | { kind: "relative_to_milestone"; milestoneKey: string; offsetDays: number }
  | { kind: "march_1_next_tax_year" }
  | { kind: "none" };

// ─── Template context for include predicates + date resolution ───────────

export interface TemplateMilestoneRef {
  dueDate: number; // epoch ms
  id: string;
}

export interface TemplateContext {
  propertyYearBuilt?: number | null;
  floodZone?: string | null;
  openPermitCount?: number | null;
  closingDate?: number | null; // epoch ms
  milestonesByKey?: Record<string, TemplateMilestoneRef>;
}

// ─── Template shape ──────────────────────────────────────────────────────

export interface ClosingTaskTemplate {
  templateKey: string;
  tab: ClosingTab;
  groupKey: string;
  groupTitle: string;
  title: string;
  description: string;
  category: CloseTaskCategory;
  ownerRole: ClosingTemplateOwnerRole;
  visibility: ClosingTemplateVisibility;
  sortOrder: number;
  waitingOnRole?: ClosingWaitingOnRole;
  dueDateStrategy: DueDateStrategy;
  includeWhen?: (ctx: TemplateContext) => boolean;
  dependsOnTemplateKeys?: readonly string[];
}

// ─── Default template catalog ────────────────────────────────────────────
//
// Ordering within a tab is driven by (groupKey, sortOrder). The seed
// mutation preserves sortOrder on the DB row, so display ordering is
// deterministic regardless of insertion timing.

const FLOOD_ZONES_REQUIRING_POLICY: ReadonlySet<string> = new Set([
  "A",
  "AE",
  "V",
  "VE",
]);

export const DEFAULT_TEMPLATES: readonly ClosingTaskTemplate[] = [
  // ──── Title ────
  {
    templateKey: "title_start_title_process",
    tab: "title",
    groupKey: "start_title_process",
    groupTitle: "Start title process",
    title: "Order title search",
    description:
      "Engage the title company and open a file. They'll pull the public record and surface any clouds on title before we get to the closing table.",
    category: "title",
    ownerRole: "broker",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "title_company",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "title_wire_fraud_verification",
    tab: "title",
    groupKey: "wire_instructions",
    groupTitle: "Wire instructions",
    title: "Verbally verify wire instructions before sending any funds",
    description:
      "Wire fraud is the #1 closing scam. Before you send ANY money, call the title company at a number you already know (not one from an email) and confirm the wire details live.",
    category: "title",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 0,
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "title_title_insurance_policy",
    tab: "title",
    groupKey: "title_protection",
    groupTitle: "Title protection",
    title: "Review owner's title insurance policy",
    description:
      "Owner's title insurance protects you if a past lien or undisclosed heir shows up after closing. Review the commitment and ask about any exceptions.",
    category: "title",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "title_company",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "title_schedule_closing",
    tab: "title",
    groupKey: "schedule_closing",
    groupTitle: "Schedule closing",
    title: "Confirm closing date, time, and location",
    description:
      "Lock in the closing appointment with the title company. Confirm whether it's in-person, remote online notarization, or a mail-away.",
    category: "title",
    ownerRole: "broker",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "title_company",
    dueDateStrategy: { kind: "relative_to_closing", offsetDays: -7 },
  },

  // ──── Financing ────
  {
    templateKey: "financing_loan_application",
    tab: "financing",
    groupKey: "loan_prep",
    groupTitle: "Loan prep",
    title: "Submit full loan application",
    description:
      "Complete your lender's full application package — income docs, bank statements, assets. The clock on the financing contingency starts now.",
    category: "financing",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "buyer",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "financing_lock_rate",
    tab: "financing",
    groupKey: "loan_prep",
    groupTitle: "Loan prep",
    title: "Lock your interest rate",
    description:
      "Ask your loan officer when to lock. Most locks run 30–60 days — long enough to get through closing but short enough to avoid extension fees.",
    category: "financing",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 1,
    waitingOnRole: "lender",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "financing_appraisal_scheduled",
    tab: "financing",
    groupKey: "appraisal",
    groupTitle: "Appraisal",
    title: "Schedule and complete lender appraisal",
    description:
      "The lender orders the appraisal. Most FL appraisals come back within 5–10 days. A low appraisal can trigger renegotiation — we'll walk you through it if it happens.",
    category: "appraisal",
    ownerRole: "broker",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "lender",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "financing_loan_commitment",
    tab: "financing",
    groupKey: "commitment",
    groupTitle: "Loan commitment",
    title: "Receive final loan commitment",
    description:
      "This is the lender's formal 'yes'. Until you have it in writing, financing is not final — avoid opening new credit cards, changing jobs, or making large purchases.",
    category: "financing",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "lender",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "financing_financing_contingency",
    tab: "financing",
    groupKey: "commitment",
    groupTitle: "Loan commitment",
    title: "Financing contingency deadline",
    description:
      "After this date you lose the right to walk away if financing falls through without forfeiting your deposit. Confirm with your lender that you're clear well before this date.",
    category: "financing",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 1,
    waitingOnRole: "lender",
    dueDateStrategy: {
      kind: "relative_to_milestone",
      milestoneKey: "financing_contingency_end",
      offsetDays: 0,
    },
  },
  {
    templateKey: "financing_closing_disclosure_review",
    tab: "financing",
    groupKey: "commitment",
    groupTitle: "Loan commitment",
    title: "Review Closing Disclosure (CD)",
    description:
      "Federal law gives you a 3-business-day review period for the CD before closing. Compare every line to your Loan Estimate — unexplained changes are a red flag.",
    category: "financing",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 2,
    waitingOnRole: "lender",
    dueDateStrategy: { kind: "relative_to_closing", offsetDays: -3 },
  },

  // ──── Inspections ────
  {
    templateKey: "inspections_schedule",
    tab: "inspections",
    groupKey: "home_inspection",
    groupTitle: "Home inspection",
    title: "Schedule home inspection",
    description:
      "Get the general inspection on the calendar immediately — the inspection period runs from the effective date, not from when you schedule it.",
    category: "inspection",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "inspector",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "inspections_inspection_period_end",
    tab: "inspections",
    groupKey: "home_inspection",
    groupTitle: "Home inspection",
    title: "Inspection period deadline",
    description:
      "Deadline to finish inspections AND deliver your objection letter. After this you lose your right to cancel based on inspection findings.",
    category: "inspection",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 1,
    dueDateStrategy: {
      kind: "relative_to_milestone",
      milestoneKey: "inspection_period_end",
      offsetDays: 0,
    },
  },
  {
    templateKey: "inspections_review_report",
    tab: "inspections",
    groupKey: "home_inspection",
    groupTitle: "Home inspection",
    title: "Review inspection report with broker",
    description:
      "Read the report end-to-end. We'll flag material issues vs. cosmetic findings and help you decide what's worth negotiating.",
    category: "inspection",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 2,
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "inspections_negotiate_repairs",
    tab: "inspections",
    groupKey: "home_inspection",
    groupTitle: "Home inspection",
    title: "Negotiate repairs or credits",
    description:
      "Based on the report, we deliver a repair request or credit ask. Must be served before the inspection period deadline.",
    category: "inspection",
    ownerRole: "broker",
    visibility: "buyer_visible",
    sortOrder: 3,
    waitingOnRole: "seller_side",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "inspections_lead_paint_disclosure",
    tab: "inspections",
    groupKey: "specialized",
    groupTitle: "Specialized inspections",
    title: "Review federal lead-based paint disclosure",
    description:
      "Homes built before 1978 require the federal lead-based paint disclosure. You have a 10-day assessment window — unless waived in the contract.",
    category: "disclosure",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 0,
    includeWhen: (ctx) =>
      typeof ctx.propertyYearBuilt === "number" && ctx.propertyYearBuilt < 1978,
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "inspections_permit_violation_followup",
    tab: "inspections",
    groupKey: "specialized",
    groupTitle: "Specialized inspections",
    title: "Follow up on open permits or violations",
    description:
      "Open permits stay with the property. Broker to chase the county/city and the seller's listing agent for resolution before closing.",
    category: "inspection",
    ownerRole: "broker",
    visibility: "internal_only",
    sortOrder: 1,
    waitingOnRole: "seller_side",
    includeWhen: (ctx) =>
      typeof ctx.openPermitCount === "number" && ctx.openPermitCount > 0,
    dueDateStrategy: { kind: "none" },
  },

  // ──── Insurance ────
  {
    templateKey: "insurance_shop_homeowners",
    tab: "insurance",
    groupKey: "homeowners",
    groupTitle: "Homeowners insurance",
    title: "Shop homeowners insurance quotes",
    description:
      "Florida insurance is tight. Get at least three quotes — private carriers, Citizens, and a surplus-line option — so you have a fallback if one denies.",
    category: "insurance",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "insurance_agent",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "insurance_bind_homeowners_policy",
    tab: "insurance",
    groupKey: "homeowners",
    groupTitle: "Homeowners insurance",
    title: "Bind homeowners policy (lender requirement)",
    description:
      "Your lender requires proof of binder before funding. Bind coverage with effective date = closing date and forward the declarations page to your loan officer.",
    category: "insurance",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 1,
    waitingOnRole: "insurance_agent",
    dueDateStrategy: { kind: "relative_to_closing", offsetDays: -10 },
  },
  {
    templateKey: "insurance_windstorm_coverage",
    tab: "insurance",
    groupKey: "homeowners",
    groupTitle: "Homeowners insurance",
    title: "Confirm windstorm / hurricane coverage",
    description:
      "Many FL homeowners policies exclude wind — you'll need a separate windstorm endorsement or policy. Ask your agent to itemize hurricane deductibles.",
    category: "insurance",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 2,
    waitingOnRole: "insurance_agent",
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "insurance_flood_policy",
    tab: "insurance",
    groupKey: "flood",
    groupTitle: "Flood insurance",
    title: "Bind NFIP or private flood policy",
    description:
      "Property is in a high-risk flood zone. Lender will require a flood policy in force at closing. Quotes from NFIP and a private flood carrier (cheaper when available).",
    category: "insurance",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "insurance_agent",
    includeWhen: (ctx) =>
      typeof ctx.floodZone === "string" &&
      FLOOD_ZONES_REQUIRING_POLICY.has(ctx.floodZone.toUpperCase()),
    dueDateStrategy: { kind: "relative_to_closing", offsetDays: -10 },
  },

  // ──── Moving In ────
  {
    templateKey: "moving_in_walk_through",
    tab: "moving_in",
    groupKey: "pre_close",
    groupTitle: "Pre-close",
    title: "Final walk-through",
    description:
      "Walk the property the day before closing. Confirm it's in the agreed condition, repairs were done, and nothing is missing. Take photos.",
    category: "walkthrough",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 0,
    dueDateStrategy: { kind: "relative_to_closing", offsetDays: -1 },
  },
  {
    templateKey: "moving_in_utilities_transfer",
    tab: "moving_in",
    groupKey: "relocate",
    groupTitle: "Relocate",
    title: "Transfer utilities to your name",
    description:
      "Schedule electric, water, internet, and gas (if any) to switch to your name on closing day. Don't let the seller cancel before closing or you'll be in the dark.",
    category: "other",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 0,
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "moving_in_mail_forwarding",
    tab: "moving_in",
    groupKey: "relocate",
    groupTitle: "Relocate",
    title: "Set up mail forwarding with USPS",
    description:
      "File a change-of-address at usps.com or your local post office. Update driver's license, voter registration, and banks too.",
    category: "other",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 1,
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "moving_in_homestead_exemption",
    tab: "moving_in",
    groupKey: "post_close",
    groupTitle: "Post-close",
    title: "File Florida homestead exemption",
    description:
      "If this is your primary residence, file the homestead exemption with your county property appraiser. Deadline is March 1 of the year following closing.",
    category: "other",
    ownerRole: "buyer",
    visibility: "buyer_visible",
    sortOrder: 0,
    dueDateStrategy: { kind: "march_1_next_tax_year" },
  },
  {
    templateKey: "moving_in_welcome_packet",
    tab: "moving_in",
    groupKey: "post_close",
    groupTitle: "Post-close",
    title: "Deliver welcome packet",
    description:
      "Post-close handoff from the brokerage — warranty docs, service provider list, local recommendations, and next-step reminders.",
    category: "other",
    ownerRole: "broker",
    visibility: "buyer_visible",
    sortOrder: 1,
    dueDateStrategy: { kind: "none" },
  },

  // ──── Additional Addendums ────
  {
    templateKey: "addendums_rider_review",
    tab: "addendums",
    groupKey: "contract_riders",
    groupTitle: "Contract riders",
    title: "Review contract riders and addenda",
    description:
      "FR/BAR contracts often attach riders (mold, radon, financing, appraisal). Read each one — a rider can override the base contract in the areas it touches.",
    category: "disclosure",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 0,
    dueDateStrategy: { kind: "none" },
  },
  {
    templateKey: "addendums_hoa_docs_review",
    tab: "addendums",
    groupKey: "hoa",
    groupTitle: "HOA",
    title: "Review HOA documents (if applicable)",
    description:
      "HOA bylaws, rules, financials, and reserve studies. Florida law gives you a short period after receipt to cancel if the documents disclose problems. If no HOA, mark canceled.",
    category: "disclosure",
    ownerRole: "shared",
    visibility: "buyer_visible",
    sortOrder: 0,
    waitingOnRole: "hoa",
    dueDateStrategy: { kind: "none" },
  },
] as const;

// ─── Due-date resolver ───────────────────────────────────────────────────

const ONE_DAY_MS = 86_400_000;

/**
 * Resolve a template's due date against the current template context.
 * Returns epoch ms or null when the strategy cannot produce a concrete
 * date (missing milestone, strategy=none, missing closing date).
 */
export function resolveTaskDueDate(
  template: ClosingTaskTemplate,
  ctx: TemplateContext,
): number | null {
  const strategy = template.dueDateStrategy;
  switch (strategy.kind) {
    case "none":
      return null;
    case "relative_to_closing": {
      if (typeof ctx.closingDate !== "number") return null;
      return ctx.closingDate + strategy.offsetDays * ONE_DAY_MS;
    }
    case "relative_to_milestone": {
      const milestone = ctx.milestonesByKey?.[strategy.milestoneKey];
      if (!milestone) return null;
      return milestone.dueDate + strategy.offsetDays * ONE_DAY_MS;
    }
    case "march_1_next_tax_year": {
      if (typeof ctx.closingDate !== "number") return null;
      const closingYear = new Date(ctx.closingDate).getUTCFullYear();
      // March 1, next calendar year, at 00:00 UTC.
      return Date.UTC(closingYear + 1, 2, 1);
    }
    default: {
      const _exhaustive: never = strategy;
      void _exhaustive;
      return null;
    }
  }
}

// ─── Predicate helpers ───────────────────────────────────────────────────

/**
 * Filter templates to those that should be seeded given the template
 * context. Templates without an `includeWhen` predicate are always
 * included. Templates with a predicate are included only when it
 * returns true.
 */
export function selectApplicableTemplates(
  templates: readonly ClosingTaskTemplate[],
  ctx: TemplateContext,
): ClosingTaskTemplate[] {
  return templates.filter((t) => (t.includeWhen ? t.includeWhen(ctx) : true));
}

/**
 * Resolve the template owner role to a concrete closeTasks owner role.
 * "shared" templates need a primary owner for the DB row — we default
 * them to buyer (buyer-facing surface). Callers can override downstream.
 */
export function resolveOwnerRole(
  templateOwnerRole: ClosingTemplateOwnerRole,
): CloseTaskOwnerRole {
  if (templateOwnerRole === "shared") return "buyer";
  return templateOwnerRole;
}
