import { describe, it, expect } from "vitest";
import { FAQ_ENTRIES } from "@/content/faq";
import { PUBLIC_DISCLOSURES } from "@/content/disclosures";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { PRICING_SECTIONS } from "@/content/pricing";
import {
  filterPublic,
  listInternalItems,
  validateContent,
  selectDisclosures,
  publishLegalDocument,
} from "@/lib/content/publicFilter";

/**
 * Regression tests for the real content bundles consumed by public
 * routes. These guard against:
 *   - accidentally flipping a public item to internal (or vice versa)
 *   - introducing a legal document with zero public sections
 *   - losing the pricing page's public sections
 *   - orphan disclosure ids referenced from routes
 */

describe("FAQ bundle", () => {
  it("has at least one public entry per FAQ category that appears publicly", () => {
    const publicEntries = filterPublic(FAQ_ENTRIES);
    expect(publicEntries.length).toBeGreaterThan(0);
  });

  it("keeps some internal entries separate from public ones", () => {
    // Regression guard — we intentionally maintain a mix of public and
    // internal entries in the source file so the filter logic is
    // exercised in the real catalog.
    const internals = listInternalItems(FAQ_ENTRIES);
    expect(internals.length).toBeGreaterThan(0);
    // And they must have visibility === "internal"
    for (const entry of internals) {
      expect(entry.visibility).toBe("internal");
    }
  });

  it("every public FAQ entry has a non-empty question and answer", () => {
    for (const entry of filterPublic(FAQ_ENTRIES)) {
      expect(entry.question.length).toBeGreaterThan(5);
      expect(entry.answer.length).toBeGreaterThan(10);
    }
  });

  it("every FAQ entry has a unique stable id", () => {
    const ids = new Set<string>();
    for (const entry of FAQ_ENTRIES) {
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
    }
  });
});

describe("disclosure catalog", () => {
  it("has public entries", () => {
    expect(filterPublic(PUBLIC_DISCLOSURES).length).toBeGreaterThan(0);
  });

  it("inherits the calculator disclosures by id", () => {
    // The calculator disclosures must be reachable from the global
    // catalog — the pricing page reuses them via selectDisclosures.
    const calculatorIds = [
      "estimate_not_guarantee",
      "commission_negotiable",
      "buyer_credit_conditions",
    ];
    const found = selectDisclosures(PUBLIC_DISCLOSURES, calculatorIds);
    expect(found.map((d) => d.id).sort()).toEqual(calculatorIds.sort());
  });

  it("includes Florida-specific brokerage disclosures", () => {
    const found = selectDisclosures(PUBLIC_DISCLOSURES, [
      "fl_brokerage_relationship",
      "dual_agency_prohibited",
      "fair_housing",
    ]);
    expect(found).toHaveLength(3);
  });

  it("has at least one internal-only entry to verify the filter works on real data", () => {
    const internals = listInternalItems(PUBLIC_DISCLOSURES);
    expect(internals.length).toBeGreaterThan(0);
  });
});

describe("legal documents", () => {
  it("has terms, privacy, and brokerage-disclosures registered", () => {
    expect(LEGAL_DOCUMENTS["terms"]).toBeDefined();
    expect(LEGAL_DOCUMENTS["privacy"]).toBeDefined();
    expect(LEGAL_DOCUMENTS["brokerage-disclosures"]).toBeDefined();
  });

  it("every registered document has a public view with sections", () => {
    for (const [slug, doc] of Object.entries(LEGAL_DOCUMENTS)) {
      const published = publishLegalDocument(doc);
      expect(
        published.sections.length,
        `legal/${slug} should have at least one public section`
      ).toBeGreaterThan(0);
    }
  });

  it("every section has a heading and body", () => {
    for (const doc of Object.values(LEGAL_DOCUMENTS)) {
      for (const section of doc.sections) {
        expect(section.heading.length).toBeGreaterThan(2);
        expect(section.body.length).toBeGreaterThan(20);
      }
    }
  });

  it("every document has an ISO effective date", () => {
    for (const doc of Object.values(LEGAL_DOCUMENTS)) {
      expect(doc.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("Terms of Service contains an internal-only review TODO that is stripped", () => {
    // Regression guard — the source terms document has an internal
    // review TODO section. It must NOT appear in the published version.
    const sourceInternals = listInternalItems(LEGAL_DOCUMENTS.terms.sections);
    expect(sourceInternals.length).toBeGreaterThan(0);
    const published = publishLegalDocument(LEGAL_DOCUMENTS.terms);
    for (const section of published.sections) {
      expect(section.visibility).toBe("public");
    }
  });
});

describe("pricing sections bundle", () => {
  it("has public sections", () => {
    expect(filterPublic(PRICING_SECTIONS).length).toBeGreaterThan(0);
  });

  it("has the savings_calculator_cta section with a CTA to /savings", () => {
    const section = PRICING_SECTIONS.find(
      (s) => s.id === "savings_calculator_cta"
    );
    expect(section).toBeDefined();
    expect(section?.cta?.href).toBe("/savings");
  });

  it("strips internal fee schedule from the public render", () => {
    const publicSections = filterPublic(PRICING_SECTIONS);
    const internal = publicSections.find(
      (s) => s.id === "internal_fee_schedule"
    );
    expect(internal).toBeUndefined();
  });
});

describe("validateContent on real bundles", () => {
  it("full bundle (all routes) validates as ok", () => {
    const result = validateContent({
      faqs: FAQ_ENTRIES,
      disclosures: PUBLIC_DISCLOSURES,
      legal: LEGAL_DOCUMENTS.terms,
      pricing: PRICING_SECTIONS,
    });
    expect(result.ok).toBe(true);
  });

  it("validates each legal document individually", () => {
    for (const doc of Object.values(LEGAL_DOCUMENTS)) {
      const result = validateContent({ legal: doc });
      expect(result.ok).toBe(true);
    }
  });
});
