import { describe, it, expect } from "vitest";
import {
  scoreSimilarity,
  dedupCandidates,
  selectComps,
} from "@/lib/ai/engines/comps";
import type { CompCandidate } from "@/lib/ai/engines/types";

const subject = {
  address: "123 Main St",
  beds: 3,
  baths: 2,
  sqft: 1800,
  yearBuilt: 2020,
  propertyType: "Condo",
  zip: "33301",
  listPrice: 500000,
};

const makeCandidate = (
  overrides: Partial<CompCandidate> = {},
): CompCandidate => ({
  canonicalId: "c1",
  address: "456 Oak Ave",
  soldPrice: 480000,
  soldDate: "2024-12-01",
  beds: 3,
  baths: 2,
  sqft: 1750,
  yearBuilt: 2019,
  propertyType: "Condo",
  zip: "33301",
  sourcePlatform: "zillow",
  ...overrides,
});

describe("scoreSimilarity", () => {
  it("scores identical properties near 1.0", () => {
    const score = scoreSimilarity(
      subject,
      makeCandidate({ beds: 3, baths: 2, sqft: 1800, yearBuilt: 2020 }),
    );
    expect(score).toBeGreaterThan(0.9);
  });

  it("scores dissimilar properties lower", () => {
    const score = scoreSimilarity(
      subject,
      makeCandidate({
        beds: 5,
        sqft: 4000,
        yearBuilt: 1970,
        propertyType: "House",
      }),
    );
    expect(score).toBeLessThan(0.5);
  });
});

describe("dedupCandidates", () => {
  it("removes duplicates by canonicalId + soldPrice + soldDate", () => {
    const dupes = [
      makeCandidate(),
      makeCandidate(),
      makeCandidate({ canonicalId: "c2" }),
    ];
    expect(dedupCandidates(dupes)).toHaveLength(2);
  });
});

describe("selectComps", () => {
  it("returns top N comps sorted by similarity", () => {
    const candidates = [
      makeCandidate({ canonicalId: "c1", sqft: 1750 }),
      makeCandidate({ canonicalId: "c2", sqft: 3500, beds: 5 }),
      makeCandidate({ canonicalId: "c3", sqft: 1820, beds: 3 }),
    ];
    const result = selectComps({ subject, candidates, maxComps: 2 });
    expect(result.comps).toHaveLength(2);
    expect(result.comps[0].similarityScore).toBeGreaterThanOrEqual(
      result.comps[1].similarityScore,
    );
  });

  it("computes aggregates", () => {
    const candidates = [
      makeCandidate({
        canonicalId: "c1",
        soldPrice: 480000,
        sqft: 1800,
        dom: 30,
        listPrice: 500000,
      }),
      makeCandidate({
        canonicalId: "c2",
        soldPrice: 500000,
        sqft: 1900,
        dom: 20,
        listPrice: 510000,
      }),
      makeCandidate({
        canonicalId: "c3",
        soldPrice: 490000,
        sqft: 1850,
        dom: 25,
        listPrice: 500000,
      }),
    ];
    const result = selectComps({ subject, candidates });
    expect(result.aggregates.medianSoldPrice).toBe(490000);
    expect(result.aggregates.medianDom).toBe(25);
    expect(result.aggregates.medianSaleToListRatio).toBeGreaterThan(0.9);
  });

  it("uses subdivision when available", () => {
    const subjectWithSub = { ...subject, subdivision: "Las Olas Isles" };
    const candidates = [
      makeCandidate({ canonicalId: "c1", subdivision: "Las Olas Isles" }),
      makeCandidate({ canonicalId: "c2", subdivision: "Las Olas Isles" }),
      makeCandidate({ canonicalId: "c3", subdivision: "Las Olas Isles" }),
      makeCandidate({ canonicalId: "c4", subdivision: "Other" }),
    ];
    const result = selectComps({ subject: subjectWithSub, candidates });
    expect(result.selectionBasis).toBe("subdivision");
    expect(
      result.comps.every(
        (c) => c.candidate.subdivision === "Las Olas Isles",
      ),
    ).toBe(true);
  });

  it("falls back to zip when subdivision has too few", () => {
    const subjectWithSub = { ...subject, subdivision: "Rare Estate" };
    const candidates = [
      makeCandidate({ canonicalId: "c1", subdivision: "Rare Estate" }),
      makeCandidate({ canonicalId: "c2", subdivision: "Other" }),
      makeCandidate({ canonicalId: "c3", subdivision: "Other" }),
    ];
    const result = selectComps({ subject: subjectWithSub, candidates });
    expect(result.selectionBasis).toBe("zip");
    expect(result.selectionReason).toContain("fell back");
  });
});
