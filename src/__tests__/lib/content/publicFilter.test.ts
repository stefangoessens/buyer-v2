import { describe, it, expect } from "vitest";
import {
  filterPublic,
  selectDisclosures,
  publishLegalDocument,
  validateContent,
  groupFAQsByCategory,
  countPublicLegalSections,
  listInternalItems,
} from "@/lib/content/publicFilter";
import type {
  DisclosureModule,
  FAQEntry,
  LegalDocument,
  PricingSection,
} from "@/lib/content/types";

// MARK: - Fixtures

const publicFAQ: FAQEntry = {
  id: "f1",
  category: "getting_started",
  stage: "pre_offer",
  theme: "how_it_works",
  question: "What is it?",
  answer: "A thing.",
  visibility: "public",
};

const internalFAQ: FAQEntry = {
  id: "f2",
  category: "technical",
  stage: "pre_offer",
  theme: "how_it_works",
  question: "Internal only",
  answer: "Secret",
  visibility: "internal",
};

const publicDisclosure: DisclosureModule = {
  id: "d1",
  label: "Clause 1",
  body: "Body 1",
  severity: "emphasis",
  visibility: "public",
};

const internalDisclosure: DisclosureModule = {
  id: "d2",
  label: "Internal",
  body: "Secret",
  severity: "info",
  visibility: "internal",
};

const sampleLegal: LegalDocument = {
  id: "sample",
  slug: "sample",
  title: "Sample Doc",
  effectiveDate: "2026-04-01",
  summary: "Sample summary.",
  sections: [
    {
      id: "s1",
      heading: "Public section",
      body: "Public body",
      visibility: "public",
    },
    {
      id: "s2",
      heading: "Internal only",
      body: "Private",
      visibility: "internal",
    },
    {
      id: "s3",
      heading: "Another public",
      body: "Public body 2",
      visibility: "public",
    },
  ],
};

const publicPricing: PricingSection = {
  id: "p1",
  title: "Free",
  body: "Free forever.",
  visibility: "public",
};

const internalPricing: PricingSection = {
  id: "p2",
  title: "Internal",
  body: "Hidden",
  visibility: "internal",
};

// MARK: - filterPublic

describe("filterPublic", () => {
  it("returns only public items for FAQs", () => {
    const result = filterPublic([publicFAQ, internalFAQ]);
    expect(result.map((f) => f.id)).toEqual(["f1"]);
  });

  it("returns only public items for disclosures", () => {
    const result = filterPublic([publicDisclosure, internalDisclosure]);
    expect(result.map((d) => d.id)).toEqual(["d1"]);
  });

  it("returns only public items for pricing sections", () => {
    const result = filterPublic([publicPricing, internalPricing]);
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });

  it("returns an empty array when all items are internal", () => {
    expect(filterPublic([internalFAQ])).toEqual([]);
  });

  it("returns the same order as the input", () => {
    const ordered: FAQEntry[] = [
      { ...publicFAQ, id: "a" },
      { ...publicFAQ, id: "b" },
      { ...publicFAQ, id: "c" },
    ];
    expect(filterPublic(ordered).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});

// MARK: - selectDisclosures

describe("selectDisclosures", () => {
  const catalog: DisclosureModule[] = [
    { ...publicDisclosure, id: "d1" },
    { ...publicDisclosure, id: "d2", label: "Clause 2" },
    { ...publicDisclosure, id: "d3", label: "Clause 3" },
    internalDisclosure,
  ];

  it("returns disclosures in requested id order", () => {
    expect(
      selectDisclosures(catalog, ["d3", "d1"]).map((d) => d.id)
    ).toEqual(["d3", "d1"]);
  });

  it("silently drops unknown ids", () => {
    expect(
      selectDisclosures(catalog, ["d1", "nope"]).map((d) => d.id)
    ).toEqual(["d1"]);
  });

  it("silently drops internal disclosures even if id is in the request", () => {
    expect(
      selectDisclosures(catalog, [internalDisclosure.id, "d1"]).map(
        (d) => d.id
      )
    ).toEqual(["d1"]);
  });

  it("returns empty for an empty id list", () => {
    expect(selectDisclosures(catalog, [])).toEqual([]);
  });
});

// MARK: - publishLegalDocument

describe("publishLegalDocument", () => {
  it("strips internal sections from the sections list", () => {
    const published = publishLegalDocument(sampleLegal);
    expect(published.sections.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("preserves the top-level metadata fields unchanged", () => {
    const published = publishLegalDocument(sampleLegal);
    expect(published.title).toBe(sampleLegal.title);
    expect(published.slug).toBe(sampleLegal.slug);
    expect(published.effectiveDate).toBe(sampleLegal.effectiveDate);
    expect(published.summary).toBe(sampleLegal.summary);
  });

  it("returns a doc with empty sections when all are internal", () => {
    const allInternal: LegalDocument = {
      ...sampleLegal,
      sections: [
        {
          id: "x",
          heading: "x",
          body: "x",
          visibility: "internal",
        },
      ],
    };
    expect(publishLegalDocument(allInternal).sections).toEqual([]);
  });
});

// MARK: - validateContent

describe("validateContent", () => {
  it("returns ok when every bundle has public content", () => {
    const result = validateContent({
      faqs: [publicFAQ],
      disclosures: [publicDisclosure],
      legal: sampleLegal,
      pricing: [publicPricing],
    });
    expect(result.ok).toBe(true);
  });

  it("reports faqs as missing when all entries are internal", () => {
    const result = validateContent({ faqs: [internalFAQ] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("faqs: no public entries");
    }
  });

  it("reports disclosures as missing when all entries are internal", () => {
    const result = validateContent({ disclosures: [internalDisclosure] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("disclosures: no public entries");
    }
  });

  it("reports legal as missing when document is null", () => {
    const result = validateContent({ legal: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("legal: document missing");
    }
  });

  it("reports legal as missing when all sections are internal", () => {
    const internalLegal: LegalDocument = {
      ...sampleLegal,
      sections: [
        {
          id: "x",
          heading: "x",
          body: "x",
          visibility: "internal",
        },
      ],
    };
    const result = validateContent({ legal: internalLegal });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain(
        `legal/${internalLegal.slug}: no public sections`
      );
    }
  });

  it("reports pricing as missing when all sections are internal", () => {
    const result = validateContent({ pricing: [internalPricing] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("pricing: no public sections");
    }
  });

  it("reports multiple missing sections at once", () => {
    const result = validateContent({
      faqs: [internalFAQ],
      pricing: [internalPricing],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toHaveLength(2);
    }
  });

  it("ignores undefined bundle fields (partial validation)", () => {
    const result = validateContent({ faqs: [publicFAQ] });
    expect(result.ok).toBe(true);
  });
});

// MARK: - groupFAQsByCategory

describe("groupFAQsByCategory", () => {
  it("groups entries by category preserving first-seen order", () => {
    const entries: FAQEntry[] = [
      { ...publicFAQ, id: "a", category: "pricing" },
      { ...publicFAQ, id: "b", category: "legal" },
      { ...publicFAQ, id: "c", category: "pricing" },
      { ...publicFAQ, id: "d", category: "legal" },
    ];
    const groups = groupFAQsByCategory(entries);
    expect(groups.map((g) => g.category)).toEqual(["pricing", "legal"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["a", "c"]);
    expect(groups[1].entries.map((e) => e.id)).toEqual(["b", "d"]);
  });

  it("handles a single-category list", () => {
    const groups = groupFAQsByCategory([publicFAQ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("getting_started");
  });

  it("returns empty array for empty input", () => {
    expect(groupFAQsByCategory([])).toEqual([]);
  });
});

// MARK: - countPublicLegalSections + listInternalItems

describe("countPublicLegalSections", () => {
  it("counts only public sections", () => {
    expect(countPublicLegalSections(sampleLegal)).toBe(2);
  });
});

describe("listInternalItems", () => {
  it("returns only internal items (opposite of filterPublic)", () => {
    expect(
      listInternalItems([publicFAQ, internalFAQ]).map((f) => f.id)
    ).toEqual(["f2"]);
  });

  it("partitions a mixed list correctly", () => {
    const all: FAQEntry[] = [
      publicFAQ,
      internalFAQ,
      { ...publicFAQ, id: "extra" },
    ];
    const pub = filterPublic(all);
    const priv = listInternalItems(all);
    expect(pub.length + priv.length).toBe(all.length);
  });
});

// MARK: - Shared-module reuse across pages

describe("shared disclosure module reuse", () => {
  const catalog: DisclosureModule[] = [
    { ...publicDisclosure, id: "estimate", label: "Estimate" },
    { ...publicDisclosure, id: "negotiable", label: "Negotiable" },
    { ...publicDisclosure, id: "license", label: "License" },
  ];

  it("two pages can render the same disclosure from the same catalog", () => {
    const calculatorSubset = selectDisclosures(catalog, [
      "estimate",
      "negotiable",
    ]);
    const pricingSubset = selectDisclosures(catalog, [
      "estimate",
      "license",
    ]);

    // Both pages reference the same "estimate" clause by id
    expect(calculatorSubset[0].id).toBe("estimate");
    expect(pricingSubset[0].id).toBe("estimate");
    // And the body text is identical — changing the catalog once updates both
    expect(calculatorSubset[0].body).toBe(pricingSubset[0].body);
  });
});
