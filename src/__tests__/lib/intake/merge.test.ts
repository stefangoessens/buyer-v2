import { describe, it, expect } from "vitest";
import { mergeSourceRecords } from "@/lib/intake/merge";
import type { SourceRecord } from "@/lib/intake/types";

describe("mergeSourceRecords", () => {
  it("merges single source without conflicts", () => {
    const sources: SourceRecord[] = [
      {
        sourcePlatform: "zillow",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { beds: 3, baths: 2, sqft: 1800, listPrice: 500000 },
      },
    ];
    const result = mergeSourceRecords(sources);
    expect(result.mergedFields.beds).toBe(3);
    expect(result.conflicts).toHaveLength(0);
    expect(result.sourceCount).toBe(1);
  });

  it("merges agreeing sources without conflicts", () => {
    const sources: SourceRecord[] = [
      {
        sourcePlatform: "zillow",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { beds: 3, listPrice: 500000 },
      },
      {
        sourcePlatform: "redfin",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { beds: 3, listPrice: 500000 },
      },
    ];
    const result = mergeSourceRecords(sources);
    expect(result.conflicts).toHaveLength(0);
    expect(result.provenance.beds.conflictFlag).toBe(false);
  });

  it("resolves conflicts by source priority", () => {
    const sources: SourceRecord[] = [
      {
        sourcePlatform: "realtor",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { sqft: 1900 },
      },
      {
        sourcePlatform: "zillow",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { sqft: 1800 },
      },
    ];
    const result = mergeSourceRecords(sources);
    expect(result.mergedFields.sqft).toBe(1800); // zillow wins
    expect(result.conflicts).toHaveLength(1);
    expect(result.provenance.sqft.conflictFlag).toBe(true);
    expect(result.provenance.sqft.confidence).toBeLessThan(0.9);
  });

  it("prefers county records for tax fields", () => {
    const sources: SourceRecord[] = [
      {
        sourcePlatform: "zillow",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { taxAnnual: 8000 },
      },
      {
        sourcePlatform: "county",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { taxAnnual: 8500 },
      },
    ];
    const result = mergeSourceRecords(sources);
    expect(result.mergedFields.taxAnnual).toBe(8500); // county wins for tax
  });

  it("keeps portal estimates separate", () => {
    const sources: SourceRecord[] = [
      {
        sourcePlatform: "zillow",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { zestimate: 490000, beds: 3 },
      },
      {
        sourcePlatform: "redfin",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { redfinEstimate: 510000, beds: 3 },
      },
    ];
    const result = mergeSourceRecords(sources);
    expect(result.mergedFields.zestimate).toBe(490000);
    expect(result.mergedFields.redfinEstimate).toBe(510000);
  });

  it("skips null/undefined/empty values", () => {
    const sources: SourceRecord[] = [
      {
        sourcePlatform: "zillow",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { beds: 3, pool: null, description: "" },
      },
    ];
    const result = mergeSourceRecords(sources);
    expect(result.mergedFields.beds).toBe(3);
    expect(result.mergedFields.pool).toBeUndefined();
    expect(result.mergedFields.description).toBeUndefined();
  });

  it("handles partial data from each source", () => {
    const sources: SourceRecord[] = [
      {
        sourcePlatform: "zillow",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { beds: 3, pool: true },
      },
      {
        sourcePlatform: "redfin",
        fetchedAt: "2024-12-01T00:00:00Z",
        data: { baths: 2, yearBuilt: 2020 },
      },
    ];
    const result = mergeSourceRecords(sources);
    expect(result.mergedFields.beds).toBe(3);
    expect(result.mergedFields.baths).toBe(2);
    expect(result.mergedFields.pool).toBe(true);
    expect(result.mergedFields.yearBuilt).toBe(2020);
  });
});
