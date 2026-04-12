/**
 * Typed trust-proof and case-study model for buyer-v2 (KIN-825).
 *
 * buyer-v2 operates in two phases:
 *   - **pre-revenue**: no closed transactions yet. Trust surfaces
 *     display illustrative case studies and demo proof blocks with
 *     explicit "illustrative" labels.
 *   - **post-revenue**: live transaction-derived records generated
 *     from actual closings with real savings totals and buyer
 *     consent for public display.
 *
 * **Hard rule**: illustrative/demo content must NEVER render on a
 * public surface without an "Illustrative example" label. The
 * `ProofLabelingPolicy` in `policy.ts` enforces this at the render
 * boundary — any helper that returns a proof record to the UI has
 * to pass it through `ensureLabeled`.
 */

// MARK: - Source classification

/**
 * Where a proof record came from — drives the labeling policy and
 * what the UI can render.
 *
 * - `illustrative` — demo content authored by marketing/legal for
 *                    pre-revenue surfaces. MUST be labeled.
 * - `liveTransaction` — derived from a closed buyer-v2 transaction.
 *                       Only usable if the buyer consented to public
 *                       display AND the record passes validation.
 */
export type ProofSource = "illustrative" | "liveTransaction";

// MARK: - Case studies

/**
 * A full case study — narrative text + outcome numbers + buyer
 * context. Used on the homepage, pricing page, and campaign landing
 * pages. Illustrative case studies are fine to publish with a label;
 * live-transaction case studies require explicit consent.
 */
export interface CaseStudy {
  /** Stable id. */
  id: string;
  /** URL slug (kebab-case). */
  slug: string;
  source: ProofSource;

  /** Headline ("Saved $18,000 on a first home in Tampa"). */
  headline: string;

  /** Short narrative paragraph shown on the card. */
  summary: string;

  /** Full narrative body — rendered on the case-study detail page. */
  body: string;

  /** Outcome figures surfaced in the card. */
  outcomes: {
    /** Purchase price in USD. */
    purchasePrice: number;
    /** Buyer credit / savings in USD. */
    buyerSavings: number;
    /** Days from link paste to closing. */
    daysToClose?: number;
    /** Effective commission percent the buyer paid. */
    effectiveCommissionPct?: number;
  };

  /** Buyer display context — NO PII beyond what's explicitly consented. */
  buyer: {
    /** "Maria G.", "James C." — never a full surname without consent. */
    displayName: string;
    /** "First-time buyer, Tampa" — city + category only. */
    location: string;
  };

  /**
   * Verification metadata for live-transaction sources only.
   * Illustrative sources leave this undefined.
   */
  verification?: {
    /** ISO-8601 closing date. */
    closingDate: string;
    /** Opaque reference id — NOT the customer's name/email. */
    transactionRef: string;
    /** Buyer consented to public display of this case study. */
    buyerConsent: true;
  };

  /** Visibility flag — draft case studies stay in source but don't render. */
  visibility: "public" | "internal";
}

// MARK: - Proof blocks

/**
 * A compact proof metric — one big number + label pair used on the
 * homepage trust bar and pricing page. E.g. "$2.1M — Total savings"
 * or "500+ — Buyers served".
 *
 * Aggregate blocks (like "total savings across all transactions")
 * must be labeled as `illustrative` until the live aggregator
 * is wired up and verified.
 */
export interface ProofBlock {
  id: string;
  source: ProofSource;
  /** Big display value ("$2.1M", "500+", "<5s"). */
  value: string;
  /** Short label under the value ("Total savings", "Buyers served"). */
  label: string;
  /** Optional longer explanation for the accessible description. */
  description?: string;
  visibility: "public" | "internal";
}

// MARK: - Labeling policy

/**
 * The labeling policy applied to proof records before render.
 * Illustrative sources always get a visible label; live-transaction
 * sources render without any qualifier.
 */
export interface LabelingPolicy {
  /** Label text shown with illustrative proof ("Illustrative example"). */
  illustrativeLabel: string;
  /** Aria description for illustrative proof. */
  illustrativeAria: string;
  /** Optional extra copy shown on case-study detail pages. */
  illustrativeDetailNote: string;
}

// MARK: - Labeled render payload

/**
 * A case study prepared for render. The UI consumes this type and
 * NEVER the raw `CaseStudy` — this is how the labeling policy is
 * enforced at the type level.
 */
export interface LabeledCaseStudy {
  case: CaseStudy;
  /** Label text to display prominently near the outcome numbers. */
  label: string | null;
  /** Aria description. */
  ariaLabel: string | null;
  /** True if this record is subject to the illustrative label. */
  isIllustrative: boolean;
}

/**
 * Same as `LabeledCaseStudy` but for `ProofBlock`.
 */
export interface LabeledProofBlock {
  block: ProofBlock;
  label: string | null;
  ariaLabel: string | null;
  isIllustrative: boolean;
}

// MARK: - Catalog shape

/**
 * The full trust-proof catalog that content authors maintain. This
 * is the single source of truth — selectors in `selectors.ts`
 * filter and label before returning to the UI.
 */
export interface TrustProofCatalog {
  caseStudies: CaseStudy[];
  proofBlocks: ProofBlock[];
}
