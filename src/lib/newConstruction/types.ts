/**
 * Typed content model for new-construction landing pages (KIN-823).
 *
 * New construction is a distinct programmatic SEO surface from the
 * residential city/community pages shipped in KIN-818. Builders
 * (Lennar, D.R. Horton, Pulte, etc.) are the parent entity; each
 * builder owns one or more new-construction communities with their
 * own urgency, phase, and incentive fields that don't apply to
 * resale markets.
 *
 * Integration points:
 *   - `src/lib/seo/builder.ts` (KIN-815) consumes these types via
 *     each route's `generateMetadata` to emit canonical URL + JSON-LD.
 *   - The shared FAQ catalog (KIN-773) supplies reusable FAQ blocks.
 *   - The savings calculator (KIN-772) is reused via a `savings_cta`
 *     block, same pattern as the article + city/community renderers.
 */

// MARK: - Visibility

export type NewConstructionVisibility = "public" | "draft";

// MARK: - Builder

/**
 * A new-construction builder (national or regional). One entry per
 * distinct builder brand — Lennar, D.R. Horton, Pulte, KB Home.
 * Communities reference their builder by slug.
 */
export interface BuilderConfig {
  /** URL slug (kebab-case). */
  slug: string;
  /** Display name — "Lennar", "D.R. Horton". */
  displayName: string;
  /** Short one-line tagline used in hero and card previews. */
  tagline: string;
  /** Meta description (50–300 chars). */
  summary: string;
  /** SEO-optimized page title (< 70 chars). DO NOT append " | buyer-v2". */
  pageTitle: string;
  heroHeadline: string;
  heroSubheadline: string;
  blocks: NewConstructionBlock[];
  /** ISO-8601 date this page was last updated. */
  lastUpdated: string;
  visibility: NewConstructionVisibility;
}

// MARK: - Community

/**
 * A specific new-construction community (one project owned by one
 * builder). Communities carry the urgency/phase/incentive metadata
 * that the template renders prominently; the builder page renders
 * the same block types against a broader brand context.
 */
export interface CommunityConfig {
  /** URL slug (kebab-case). */
  slug: string;
  /** Display name — "Villages at Town Square". */
  displayName: string;
  /** Parent builder slug — must resolve to a BuilderConfig. */
  builderSlug: string;
  /** City (free-text — these are not KIN-818 cities). */
  cityName: string;
  /** State abbreviation. */
  state: string;
  pageTitle: string;
  summary: string;
  heroHeadline: string;
  heroSubheadline: string;
  blocks: NewConstructionBlock[];
  lastUpdated: string;
  visibility: NewConstructionVisibility;
}

// MARK: - Content blocks

/**
 * Reusable block types for new-construction landing pages. Renderer
 * is exhaustive — adding a new kind requires a new type member here
 * and a new case in the renderer switch.
 */
export type NewConstructionBlock =
  | HeroParagraphBlock
  | UrgencyBlock
  | SavingsProjectionBlock
  | BuilderFactsBlock
  | PhaseListBlock
  | FAQRefBlock
  | CTABlock;

export interface HeroParagraphBlock {
  kind: "hero_paragraph";
  text: string;
}

/**
 * Urgency block — quarter/phase deadline, remaining inventory, or
 * a time-boxed incentive. The content author is responsible for
 * accuracy; nothing here is dynamically queried.
 */
export interface UrgencyBlock {
  kind: "urgency";
  /** Short headline — "Phase III closing Q2 2026". */
  headline: string;
  /** Detail copy — what the deadline means for buyers. */
  body: string;
  /** Optional ISO-8601 deadline date. */
  deadline?: string;
  /**
   * Optional "Only N homes remaining" signal. Rendered verbatim so
   * marketing can phrase it however fits the current phase.
   */
  scarcitySignal?: string;
}

/**
 * Savings projection block — breaks down the estimated buyer-v2
 * rebate + builder incentives into a 2-column layout.
 */
export interface SavingsProjectionBlock {
  kind: "savings_projection";
  headline: string;
  /**
   * Row-by-row savings itemization. Free-text label/value pairs so
   * marketing can tune the framing per community.
   */
  rows: Array<{
    label: string;
    value: string;
    /** Optional one-line disclaimer row. */
    note?: string;
  }>;
  /** Short copy directing the reader to the savings calculator. */
  footnote?: string;
}

/**
 * Builder facts block — key brand facts surfaced on the builder
 * landing page (year founded, communities built, warranty program,
 * etc.).
 */
export interface BuilderFactsBlock {
  kind: "builder_facts";
  facts: Array<{
    label: string;
    value: string;
  }>;
}

/**
 * Phase list block — construction phases of a community with
 * release timing and status. One entry per phase.
 */
export interface PhaseListBlock {
  kind: "phase_list";
  heading: string;
  phases: Array<{
    label: string;
    /** "sold_out" | "closing_soon" | "available" | "coming_soon" — human copy only, no lifecycle enforcement. */
    status: "sold_out" | "closing_soon" | "available" | "coming_soon";
    description: string;
  }>;
}

/**
 * FAQ block referencing shared FAQ ids (KIN-773). Same pattern as
 * KIN-818 — content authors maintain one canonical FAQ catalog and
 * every page references entries by id.
 */
export interface FAQRefBlock {
  kind: "faq_ref";
  heading: string;
  entryIds: string[];
}

/**
 * CTA block — same three variants as KIN-818.
 */
export interface CTABlock {
  kind: "cta";
  variant: "paste_link" | "savings_calculator" | "custom";
  headline?: string;
  body?: string;
  href?: string;
  label?: string;
}

// MARK: - Validation

export type NewConstructionValidationError =
  | {
      kind: "duplicateSlug";
      slug: string;
      entityKind: "builder" | "community";
    }
  | { kind: "invalidSlug"; slug: string }
  | {
      kind: "missingBuilderForCommunity";
      builderSlug: string;
      communitySlug: string;
    }
  | { kind: "emptyBlocks"; slug: string }
  | { kind: "summaryTooShort"; slug: string; length: number }
  | { kind: "summaryTooLong"; slug: string; length: number }
  | { kind: "pageTitleTooLong"; slug: string; length: number }
  | { kind: "titleIncludesSiteSuffix"; slug: string };

export type NewConstructionValidation =
  | { ok: true }
  | { ok: false; errors: NewConstructionValidationError[] };

// MARK: - Catalog

/**
 * The full new-construction catalog. Content authors maintain this;
 * selectors filter to public records and validate cross-references
 * before content reaches the render pipeline.
 */
export interface NewConstructionCatalog {
  builders: BuilderConfig[];
  communities: CommunityConfig[];
}
