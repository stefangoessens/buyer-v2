/**
 * Typed content schema for the public site's pricing, FAQ, legal, and
 * brokerage disclosure surfaces (KIN-773).
 *
 * Every public content surface consumes types from this file so:
 *   1. Content can be updated in one place and flow to every surface
 *      that consumes it (no duplicate copy across route handlers).
 *   2. A `visibility` flag at the item level keeps internal-only
 *      operational copy out of public rendering — the filter helpers
 *      in `publicFilter.ts` strip `internal` entries before any
 *      content reaches the page template.
 *   3. Legal documents track an `effectiveDate` so the footer can
 *      render an automatic "Last updated" stamp.
 */

// MARK: - Visibility

/**
 * Who can see a given content item.
 *
 * - `public` — rendered on the live site to anyone.
 * - `internal` — kept in the content module for ops/legal review but
 *   never rendered on a public surface. `filterPublic` strips these
 *   before content reaches any page template.
 */
export type ContentVisibility = "public" | "internal";

/**
 * Any content item with a `visibility` flag. The filter helpers use
 * this interface generically so the same strip-internal logic works
 * for FAQ entries, disclosures, legal sections, and pricing cards.
 */
export interface HasVisibility {
  visibility: ContentVisibility;
}

// MARK: - FAQ

export type FAQCategory =
  | "getting_started"
  | "pricing"
  | "process"
  | "legal"
  | "technical";

export interface FAQEntry extends HasVisibility {
  id: string;
  category: FAQCategory;
  question: string;
  answer: string;
}

// MARK: - Disclosures

/**
 * A reusable disclosure module that multiple public surfaces can show
 * (e.g. the savings calculator, pricing page, and brokerage disclosure
 * page all need to render the "estimate not a guarantee" clause).
 *
 * Severity drives the visual weight in the template — legal review
 * tags the clause; the UI doesn't decide.
 */
export type DisclosureSeverity = "info" | "emphasis" | "strong";

export interface DisclosureModule extends HasVisibility {
  id: string;
  label: string;
  body: string;
  severity: DisclosureSeverity;
}

// MARK: - Legal documents

export interface LegalSection extends HasVisibility {
  id: string;
  heading: string;
  body: string;
}

export interface LegalDocument {
  id: string;
  slug: string;
  title: string;
  /**
   * ISO-8601 date string (YYYY-MM-DD) — when the document last
   * changed. Drives the "Last updated" stamp on the rendered page.
   */
  effectiveDate: string;
  /**
   * Short intro shown under the title before the numbered sections.
   */
  summary: string;
  sections: LegalSection[];
}

// MARK: - Pricing

/**
 * One content block on the pricing page. The public pricing surface
 * is a single vertical stack of these sections, each with optional
 * call-to-action. Keeps the page composition declarative.
 */
export interface PricingSection extends HasVisibility {
  id: string;
  title: string;
  body: string;
  /** Optional bullet list under the body. */
  bullets?: string[];
  /** Optional CTA rendered as a button or link. */
  cta?: {
    label: string;
    href: string;
  };
}

// MARK: - How it works

/**
 * One step on the /how-it-works page and the homepage `#how-it-works`
 * anchor section. Shared between the two surfaces so the copy and
 * imagery live in a single content module.
 */
export interface HowItWorksStep {
  id: string;
  number: number;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt?: string;
}

/**
 * Full "how it works" content module consumed by both
 * `src/app/(marketing)/page.tsx` (homepage anchor section) and
 * `src/app/(marketing)/how-it-works/page.tsx` (standalone route).
 */
export interface HowItWorksContent {
  eyebrow: string;
  title: string;
  description?: string;
  steps: HowItWorksStep[];
}

// MARK: - Content page meta

/**
 * Metadata consumed by the shared page template + Next.js metadata
 * export. Lets a route define its page once and have both the HTML
 * title and the hero header reuse the same source of truth.
 */
export interface ContentPageMeta {
  slug: string;
  title: string;
  description: string;
  /**
   * Short eyebrow label rendered above the hero title (e.g. "Pricing",
   * "Frequently Asked Questions"). Leave undefined to skip.
   */
  eyebrow?: string;
}
