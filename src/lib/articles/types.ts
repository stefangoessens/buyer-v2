/**
 * Typed article / blog content schema for buyer-v2 (KIN-812).
 *
 * Articles are structured, not MDX — the content is a list of typed
 * `ArticleBlock` values, each of which maps to a specific renderer in
 * `ArticleRenderer`. This keeps editorial copy aligned with the
 * design system and lets us embed product CTAs (paste-link,
 * savings calculator, city cross-links) as first-class blocks
 * rather than relying on inline HTML escapes.
 *
 * The typed approach also makes it trivial for the metadata pipeline
 * (KIN-815) to build JSON-LD Article payloads and for the article
 * index page to list articles with correct SEO metadata.
 */

import type { ContentVisibility } from "@/lib/content/types";

// MARK: - Block types

/**
 * A typed content block. Extend this union with new block kinds
 * (add a renderer in ArticleRenderer.tsx in the same commit).
 *
 * Every block has a `kind` discriminator so the renderer can switch
 * exhaustively. The block types intentionally cover only what our
 * editorial voice actually needs — we add kinds when articles need
 * them, not speculatively.
 */
export type ArticleBlock =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | QuoteBlock
  | CalloutBlock
  | ImageBlock
  | SavingsCalculatorCTABlock
  | PasteLinkCTABlock
  | CityCrossLinkBlock;

export interface ParagraphBlock {
  kind: "paragraph";
  text: string;
  /** Optional emphasis for the first sentence — used for lede paragraphs. */
  lede?: boolean;
}

export interface HeadingBlock {
  kind: "heading";
  text: string;
  /** Header level — we only use h2 and h3 in article body to preserve hierarchy. */
  level: 2 | 3;
  /**
   * Optional anchor slug for deep-linking. If omitted, the renderer
   * auto-generates one from the heading text.
   */
  anchor?: string;
}

export interface ListBlock {
  kind: "list";
  style: "bulleted" | "numbered";
  items: string[];
}

export interface QuoteBlock {
  kind: "quote";
  text: string;
  /** Optional attribution ("— Jane Buyer, Tampa"). */
  attribution?: string;
}

/**
 * Callout box with a label tag and body text. Variants map to the
 * severity levels legal uses — `info` is a neutral sidebar, `emphasis`
 * is a brand-colored tip, `strong` is a warning / compliance note.
 */
export interface CalloutBlock {
  kind: "callout";
  variant: "info" | "emphasis" | "strong";
  label: string;
  body: string;
}

export interface ImageBlock {
  kind: "image";
  src: string;
  alt: string;
  /** Optional caption shown under the image. */
  caption?: string;
  /** Optional aspect hint — tall / wide / square. Defaults to wide. */
  aspect?: "wide" | "square" | "tall";
}

/**
 * CTA embed for the savings calculator. Rendered as a branded card
 * that links to `/savings` with optional custom copy.
 */
export interface SavingsCalculatorCTABlock {
  kind: "savings_calculator_cta";
  /** Override for the card headline (default: "See how much you could save"). */
  headline?: string;
  /** Override for the body copy. */
  body?: string;
}

/**
 * CTA embed for the homepage paste-a-link hero pattern.
 */
export interface PasteLinkCTABlock {
  kind: "paste_link_cta";
  headline?: string;
  body?: string;
}

/**
 * Cross-link block pointing at a city or community landing page.
 * Future (KIN-818) will generate programmatic city pages — articles
 * embed these blocks to funnel organic traffic between them.
 */
export interface CityCrossLinkBlock {
  kind: "city_cross_link";
  cityName: string;
  href: string;
  /** Short blurb about the city that sells the click. */
  description: string;
}

// MARK: - Article metadata

/**
 * Author metadata shown in the byline + JSON-LD Article payload.
 */
export interface ArticleAuthor {
  name: string;
  /** Short bio shown under the byline (1–2 sentences). */
  bio?: string;
  /** Optional URL to an avatar image. */
  avatarUrl?: string;
}

/**
 * Top-level article record. Every article has an SEO-ready set of
 * fields plus a body made of typed blocks.
 */
export interface Article {
  /** Stable id — never reused after publication. */
  id: string;
  /** URL slug (kebab-case, lowercase, no leading slash). */
  slug: string;
  /** Page title and H1 headline. */
  title: string;
  /** Meta description + social preview description (150–300 chars). */
  summary: string;
  /** Coarse taxonomy shown on the article index. */
  category: ArticleCategory;
  author: ArticleAuthor;
  /** ISO-8601 date the article was first published. */
  publishedAt: string;
  /** ISO-8601 date of last material update — drives `dateModified`. */
  updatedAt: string;
  /** Reading-time estimate in minutes. */
  readingMinutes: number;
  /** Optional cover image shown above the headline. */
  coverImage?: {
    src: string;
    alt: string;
  };
  /** Typed content blocks — rendered in order. */
  body: ArticleBlock[];
  /** Visibility flag (drives draft vs public indexing). */
  visibility: ContentVisibility;
}

/**
 * Coarse editorial taxonomy. Mirrors our marketing bucket strategy
 * — add categories as editorial needs them.
 */
export type ArticleCategory =
  | "buying_guide"
  | "market_insight"
  | "legal_compliance"
  | "closing_process"
  | "florida_cities";

export const ARTICLE_CATEGORY_LABELS: Record<ArticleCategory, string> = {
  buying_guide: "Buying guide",
  market_insight: "Market insight",
  legal_compliance: "Legal & compliance",
  closing_process: "Closing process",
  florida_cities: "Florida cities",
};
