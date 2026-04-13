import { describe, expect, it } from "vitest";
import {
  addToComparison,
  buildComparisonRows,
  MAX_COMPARISON_SIZE,
  projectRow,
  removeFromComparison,
  reorderComparison,
  resetComparison,
  type ComparisonPropertyInput,
  type ComparisonRecord,
  type ComparisonState,
} from "@/lib/dashboard/comparison";

const NOW = "2026-04-12T00:00:00.000Z";
const LATER = "2026-04-13T00:00:00.000Z";

const mkRecord = (
  propertyId: string,
  dealRoomId?: string,
): ComparisonRecord => ({
  propertyId,
  dealRoomId,
});

const mkState = (
  records: ComparisonRecord[] = [],
  overrides: Partial<ComparisonState> = {},
): ComparisonState => ({
  buyerId: "user_1",
  records,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const mkProperty = (
  overrides: Partial<ComparisonPropertyInput> = {},
): ComparisonPropertyInput => ({
  _id: "prop_1",
  canonicalId: "canon-1",
  address: {
    street: "123 Main St",
    city: "Miami",
    state: "FL",
    zip: "33131",
    formatted: "123 Main St, Miami, FL 33131",
  },
  listPrice: 500000,
  beds: 2,
  bathsFull: 2,
  bathsHalf: 0,
  sqftLiving: 1000,
  lotSize: 5000,
  yearBuilt: 2018,
  photoUrls: ["https://cdn.example.com/1.jpg"],
  propertyType: "condo",
  hoaFee: 400,
  pool: true,
  waterfrontType: "none",
  ...overrides,
});

describe("MAX_COMPARISON_SIZE", () => {
  it("is exported and sane", () => {
    expect(MAX_COMPARISON_SIZE).toBeGreaterThan(0);
    expect(MAX_COMPARISON_SIZE).toBeLessThanOrEqual(10);
  });
});

describe("addToComparison", () => {
  it("adds to an empty comparison", () => {
    const result = addToComparison(mkState([]), mkRecord("prop_1"), LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.records).toEqual([mkRecord("prop_1")]);
      expect(result.state.updatedAt).toBe(LATER);
    }
  });

  it("preserves deal-room context on insert", () => {
    const result = addToComparison(
      mkState([]),
      mkRecord("prop_1", "deal_1"),
      LATER,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.records[0]).toEqual(mkRecord("prop_1", "deal_1"));
    }
  });

  it("appends to the end by default", () => {
    const state = mkState([mkRecord("prop_1"), mkRecord("prop_2")]);
    const result = addToComparison(state, mkRecord("prop_3"), LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.records).toEqual([
        mkRecord("prop_1"),
        mkRecord("prop_2"),
        mkRecord("prop_3"),
      ]);
    }
  });

  it("inserts at a specific position when given", () => {
    const state = mkState([mkRecord("prop_1"), mkRecord("prop_3")]);
    const result = addToComparison(state, mkRecord("prop_2"), LATER, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.records).toEqual([
        mkRecord("prop_1"),
        mkRecord("prop_2"),
        mkRecord("prop_3"),
      ]);
    }
  });

  it("rejects duplicate property additions even with different deal-room context", () => {
    const state = mkState([mkRecord("prop_1", "deal_1")]);
    const result = addToComparison(state, mkRecord("prop_1", "deal_2"), LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("already_in_comparison");
    }
  });

  it("rejects additions that would exceed MAX_COMPARISON_SIZE", () => {
    const full = Array.from({ length: MAX_COMPARISON_SIZE }, (_, i) =>
      mkRecord(`prop_${i}`),
    );
    const state = mkState(full);
    const result = addToComparison(state, mkRecord("new_prop"), LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("comparison_full");
    }
  });

  it("rejects invalid insertion positions", () => {
    const state = mkState([mkRecord("prop_1"), mkRecord("prop_2")]);
    const result = addToComparison(state, mkRecord("prop_3"), LATER, 99);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_position");
    }
  });

  it("allows insertion at position === length", () => {
    const state = mkState([mkRecord("prop_1"), mkRecord("prop_2")]);
    const result = addToComparison(state, mkRecord("prop_3"), LATER, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.records).toEqual([
        mkRecord("prop_1"),
        mkRecord("prop_2"),
        mkRecord("prop_3"),
      ]);
    }
  });

  it("does not mutate the input state", () => {
    const state = mkState([mkRecord("prop_1")]);
    addToComparison(state, mkRecord("prop_2"), LATER);
    expect(state.records).toEqual([mkRecord("prop_1")]);
    expect(state.updatedAt).toBe(NOW);
  });
});

describe("removeFromComparison", () => {
  it("removes an existing property", () => {
    const state = mkState([
      mkRecord("prop_1"),
      mkRecord("prop_2", "deal_2"),
      mkRecord("prop_3"),
    ]);
    const result = removeFromComparison(state, "prop_2", LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.records).toEqual([
        mkRecord("prop_1"),
        mkRecord("prop_3"),
      ]);
    }
  });

  it("rejects removal of a property not in the comparison", () => {
    const state = mkState([mkRecord("prop_1")]);
    const result = removeFromComparison(state, "prop_not_here", LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_in_comparison");
    }
  });

  it("handles removal from a single-item comparison", () => {
    const state = mkState([mkRecord("prop_1", "deal_1")]);
    const result = removeFromComparison(state, "prop_1", LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.records).toEqual([]);
    }
  });
});

describe("reorderComparison", () => {
  it("moves a record from one position to another", () => {
    const state = mkState([
      mkRecord("a"),
      mkRecord("b", "deal_b"),
      mkRecord("c"),
      mkRecord("d"),
    ]);
    const result = reorderComparison(state, 0, 2, LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.records).toEqual([
        mkRecord("b", "deal_b"),
        mkRecord("c"),
        mkRecord("a"),
        mkRecord("d"),
      ]);
    }
  });

  it("no-ops when from and to positions are equal", () => {
    const state = mkState([mkRecord("a"), mkRecord("b"), mkRecord("c")]);
    const result = reorderComparison(state, 1, 1, LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.records).toEqual([
        mkRecord("a"),
        mkRecord("b"),
        mkRecord("c"),
      ]);
    }
  });

  it("rejects out-of-range positions", () => {
    const state = mkState([mkRecord("a"), mkRecord("b")]);
    expect(reorderComparison(state, 5, 0, LATER).ok).toBe(false);
    expect(reorderComparison(state, 0, 10, LATER).ok).toBe(false);
    expect(reorderComparison(state, -1, 0, LATER).ok).toBe(false);
    expect(reorderComparison(state, 0, -1, LATER).ok).toBe(false);
  });
});

describe("resetComparison", () => {
  it("clears the record list", () => {
    const state = mkState([mkRecord("prop_1"), mkRecord("prop_2", "deal_2")]);
    const reset = resetComparison(state, LATER);
    expect(reset.records).toEqual([]);
    expect(reset.updatedAt).toBe(LATER);
    expect(reset.createdAt).toBe(NOW);
  });

  it("is a no-op on an already empty comparison", () => {
    const reset = resetComparison(mkState([]), LATER);
    expect(reset.records).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state = mkState([mkRecord("prop_1")]);
    resetComparison(state, LATER);
    expect(state.records).toEqual([mkRecord("prop_1")]);
  });
});

describe("projectRow", () => {
  it("computes price per sqft", () => {
    const row = projectRow(
      mkRecord("prop_1"),
      mkProperty({ listPrice: 500000, sqftLiving: 1000 }),
      0,
    );
    expect(row.pricePerSqft).toBe(500);
  });

  it("sets source and dealRoomId from record context", () => {
    const row = projectRow(
      mkRecord("prop_1", "deal_1"),
      mkProperty(),
      0,
    );
    expect(row.source).toBe("dealRoom");
    expect(row.dealRoomId).toBe("deal_1");
  });

  it("returns a buyer-safe row shape", () => {
    const row = projectRow(mkRecord("prop_1"), mkProperty(), 0);
    expect(Object.keys(row).sort()).toEqual([
      "addressLine",
      "baths",
      "beds",
      "dealRoomId",
      "hasPool",
      "hoaFee",
      "listPrice",
      "lotSize",
      "order",
      "pricePerSqft",
      "primaryPhotoUrl",
      "propertyId",
      "propertyType",
      "source",
      "sqft",
      "waterfront",
      "yearBuilt",
    ]);
  });

  it("returns null for price per sqft when fields missing", () => {
    expect(
      projectRow(mkRecord("prop_1"), mkProperty({ listPrice: undefined }), 0)
        .pricePerSqft,
    ).toBe(null);
    expect(
      projectRow(mkRecord("prop_1"), mkProperty({ sqftLiving: undefined }), 0)
        .pricePerSqft,
    ).toBe(null);
    expect(
      projectRow(mkRecord("prop_1"), mkProperty({ sqftLiving: 0 }), 0)
        .pricePerSqft,
    ).toBe(null);
  });

  it("combines baths correctly", () => {
    expect(
      projectRow(
        mkRecord("prop_1"),
        mkProperty({ bathsFull: 3, bathsHalf: 1 }),
        0,
      ).baths,
    ).toBe(3.5);
    expect(
      projectRow(
        mkRecord("prop_1"),
        mkProperty({ bathsFull: 2, bathsHalf: 0 }),
        0,
      ).baths,
    ).toBe(2);
  });

  it("detects waterfront correctly", () => {
    expect(
      projectRow(
        mkRecord("prop_1"),
        mkProperty({ waterfrontType: "ocean" }),
        0,
      ).waterfront,
    ).toBe(true);
    expect(
      projectRow(
        mkRecord("prop_1"),
        mkProperty({ waterfrontType: "none" }),
        0,
      ).waterfront,
    ).toBe(false);
  });

  it("falls back to formatted address when needed", () => {
    const row = projectRow(
      mkRecord("prop_1"),
      mkProperty({
        address: {
          street: "500 Brickell Ave",
          city: "Miami",
          state: "FL",
          zip: "33131",
        },
      }),
      0,
    );
    expect(row.addressLine).toBe("500 Brickell Ave, Miami, FL 33131");
  });
});

describe("buildComparisonRows", () => {
  it("projects rows in the stored order", () => {
    const state = mkState([
      mkRecord("b", "deal_b"),
      mkRecord("a"),
      mkRecord("c"),
    ]);
    const props = new Map<string, ComparisonPropertyInput>([
      ["a", mkProperty({ _id: "a" })],
      ["b", mkProperty({ _id: "b" })],
      ["c", mkProperty({ _id: "c" })],
    ]);
    const rows = buildComparisonRows(state, props);
    expect(rows.map((row) => row.propertyId)).toEqual(["b", "a", "c"]);
    expect(rows[0]?.dealRoomId).toBe("deal_b");
  });

  it("skips missing properties silently and compacts visible order", () => {
    const state = mkState([
      mkRecord("a"),
      mkRecord("b"),
      mkRecord("c", "deal_c"),
    ]);
    const props = new Map<string, ComparisonPropertyInput>([
      ["a", mkProperty({ _id: "a" })],
      ["c", mkProperty({ _id: "c" })],
    ]);
    const rows = buildComparisonRows(state, props);
    expect(rows.map((row) => row.propertyId)).toEqual(["a", "c"]);
    expect(rows.map((row) => row.order)).toEqual([0, 1]);
  });

  it("returns empty array for empty comparison state", () => {
    expect(buildComparisonRows(mkState([]), new Map())).toEqual([]);
  });
});
