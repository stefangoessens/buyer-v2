/**
 * Pure content-filtering helpers for the public site (KIN-773).
 *
 * Every page template must route content through `filterPublic` before
 * rendering so internal-only operational copy never leaks onto a live
 * page. The helpers here are deliberately minimal and pure so they're
 * easy to test and reuse across every public surface.
 */

import type {
  DisclosureModule,
  FAQEntry,
  HasVisibility,
  LegalDocument,
  LegalSection,
  PricingSection,
} from "./types";

// MARK: - Generic filter

/**
 * Return only items whose `visibility` is `public`. Generic so the
 * same implementation works for FAQ entries, disclosures, legal
 * sections, and pricing cards.
 */
export function filterPublic<T extends HasVisibility>(items: readonly T[]): T[] {
  return items.filter((item) => item.visibility === "public");
}

// MARK: - Disclosure selector

/**
 * Pick specific disclosure modules from a catalog by id. Used when a
 * page needs to render a curated subset (e.g. the savings calculator
 * shows only the 2–3 clauses legal flagged as "headline").
 *
 * Missing ids are silently dropped — the caller can test returned
 * length vs requested length if it wants to assert presence.
 */
export function selectDisclosures(
  catalog: readonly DisclosureModule[],
  ids: readonly string[]
): DisclosureModule[] {
  const byId = new Map(catalog.map((d) => [d.id, d]));
  return ids
    .map((id) => byId.get(id))
    .filter((d): d is DisclosureModule => d !== undefined)
    .filter((d) => d.visibility === "public");
}

// MARK: - Legal document publication

/**
 * Return a "public view" of a legal document: keep top-level metadata,
 * but strip any internal-only sections from the sections list. Preserves
 * section order.
 *
 * A document with zero public sections is still returned (callers can
 * detect the empty sections list and render an explicit placeholder).
 */
export function publishLegalDocument(doc: LegalDocument): LegalDocument {
  return {
    ...doc,
    sections: filterPublic(doc.sections),
  };
}

// MARK: - Content presence

/**
 * Result type for `validateContent` — a simple pass/fail with the
 * missing content item paths so the template can render an explicit
 * error state rather than silently emitting an empty page.
 */
export type ContentValidation =
  | { ok: true }
  | { ok: false; missing: string[] };

/**
 * Assert that a content bundle has the minimum required items to
 * render. Used by page templates to fail-loud when a content file is
 * misconfigured — the alternative is a blank page with no hint why.
 */
export function validateContent(bundle: {
  faqs?: readonly FAQEntry[];
  disclosures?: readonly DisclosureModule[];
  legal?: LegalDocument | null;
  pricing?: readonly PricingSection[];
}): ContentValidation {
  const missing: string[] = [];

  if (bundle.faqs !== undefined && filterPublic(bundle.faqs).length === 0) {
    missing.push("faqs: no public entries");
  }
  if (
    bundle.disclosures !== undefined &&
    filterPublic(bundle.disclosures).length === 0
  ) {
    missing.push("disclosures: no public entries");
  }
  if (bundle.legal !== undefined) {
    if (!bundle.legal) {
      missing.push("legal: document missing");
    } else if (filterPublic(bundle.legal.sections).length === 0) {
      missing.push(`legal/${bundle.legal.slug}: no public sections`);
    }
  }
  if (
    bundle.pricing !== undefined &&
    filterPublic(bundle.pricing).length === 0
  ) {
    missing.push("pricing: no public sections");
  }

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

// MARK: - Grouping helpers

/**
 * Group FAQ entries by category. Returns categories in the order they
 * first appear in the input list so content authors control the
 * rendering order by ordering the source array.
 */
export function groupFAQsByCategory(
  entries: readonly FAQEntry[]
): Array<{ category: FAQEntry["category"]; entries: FAQEntry[] }> {
  const seen = new Map<FAQEntry["category"], FAQEntry[]>();
  for (const entry of entries) {
    const bucket = seen.get(entry.category) ?? [];
    bucket.push(entry);
    seen.set(entry.category, bucket);
  }
  return Array.from(seen.entries()).map(([category, entries]) => ({
    category,
    entries,
  }));
}

/**
 * Count how many public sections a legal document has. Used by the
 * footer to show "N sections" or by the analytics layer to track
 * content growth.
 */
export function countPublicLegalSections(doc: LegalDocument): number {
  return filterPublic(doc.sections).length;
}

// MARK: - Internal / private helpers

/**
 * Test helper — lists every item in a bundle that is NOT public.
 * Exposed so ops can build a "what's hidden from public" audit report.
 */
export function listInternalItems<T extends HasVisibility>(
  items: readonly T[]
): T[] {
  return items.filter((item) => item.visibility === "internal");
}

// Re-export LegalSection for convenience (callers often work with it)
export type { LegalSection };
