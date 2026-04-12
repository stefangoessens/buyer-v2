import { describe, it, expect } from "vitest";
import {
  addToComparison,
  removeFromComparison,
  reorderComparison,
  resetComparison,
  buildComparisonRows,
  projectRow,
  MAX_COMPARISON_SIZE,
  type ComparisonState,
  type ComparisonPropertyInput,
} from "@/lib/dashboard/comparison";

const NOW = "2026-04-12T00:00:00.000Z";
const LATER = "2026-04-13T00:00:00.000Z";

const mkState = (
  propertyIds: string[] = [],
  overrides: Partial<ComparisonState> = {},
): ComparisonState => ({
  buyerId: "user_1",
  propertyIds,
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
    const result = addToComparison(mkState([]), "prop_1", LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.propertyIds).toEqual(["prop_1"]);
      expect(result.state.updatedAt).toBe(LATER);
    }
  });

  it("appends to the end by default", () => {
    const state = mkState(["prop_1", "prop_2"]);
    const result = addToComparison(state, "prop_3", LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.propertyIds).toEqual(["prop_1", "prop_2", "prop_3"]);
    }
  });

  it("inserts at a specific position when given", () => {
    const state = mkState(["prop_1", "prop_3"]);
    const result = addToComparison(state, "prop_2", LATER, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.propertyIds).toEqual(["prop_1", "prop_2", "prop_3"]);
    }
  });

  it("rejects duplicate property additions", () => {
    const state = mkState(["prop_1"]);
    const result = addToComparison(state, "prop_1", LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("already_in_comparison");
    }
  });

  it("rejects additions that would exceed MAX_COMPARISON_SIZE", () => {
    const full = Array.from({ length: MAX_COMPARISON_SIZE }, (_, i) => `prop_${i}`);
    const state = mkState(full);
    const result = addToComparison(state, "new_prop", LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("comparison_full");
    }
  });

  it("rejects invalid insertion positions", () => {
    const state = mkState(["prop_1", "prop_2"]);
    const result = addToComparison(state, "prop_3", LATER, 99);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_position");
    }
  });

  it("allows insertion at position === length (append via explicit index)", () => {
    const state = mkState(["prop_1", "prop_2"]);
    const result = addToComparison(state, "prop_3", LATER, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.propertyIds).toEqual(["prop_1", "prop_2", "prop_3"]);
    }
  });

  it("rejects negative positions", () => {
    const state = mkState(["prop_1"]);
    const result = addToComparison(state, "prop_2", LATER, -1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_position");
    }
  });

  it("does not mutate the input state", () => {
    const state = mkState(["prop_1"]);
    addToComparison(state, "prop_2", LATER);
    expect(state.propertyIds).toEqual(["prop_1"]);
    expect(state.updatedAt).toBe(NOW);
  });
});

describe("removeFromComparison", () => {
  it("removes an existing property", () => {
    const state = mkState(["prop_1", "prop_2", "prop_3"]);
    const result = removeFromComparison(state, "prop_2", LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.propertyIds).toEqual(["prop_1", "prop_3"]);
    }
  });

  it("rejects removal of a property not in the comparison", () => {
    const state = mkState(["prop_1"]);
    const result = removeFromComparison(state, "prop_not_here", LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_in_comparison");
    }
  });

  it("handles removal from a single-item comparison", () => {
    const state = mkState(["prop_1"]);
    const result = removeFromComparison(state, "prop_1", LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.propertyIds).toEqual([]);
    }
  });
});

describe("reorderComparison", () => {
  it("moves a property from one position to another", () => {
    const state = mkState(["a", "b", "c", "d"]);
    const result = reorderComparison(state, 0, 2, LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.propertyIds).toEqual(["b", "c", "a", "d"]);
    }
  });

  it("no-ops when from and to positions are equal", () => {
    const state = mkState(["a", "b", "c"]);
    const result = reorderComparison(state, 1, 1, LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.propertyIds).toEqual(["a", "b", "c"]);
    }
  });

  it("rejects out-of-range from position", () => {
    const state = mkState(["a", "b"]);
    const result = reorderComparison(state, 5, 0, LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_position");
    }
  });

  it("rejects out-of-range to position", () => {
    const state = mkState(["a", "b"]);
    const result = reorderComparison(state, 0, 10, LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_position");
    }
  });

  it("rejects negative from or to", () => {
    const state = mkState(["a", "b"]);
    expect(reorderComparison(state, -1, 0, LATER).ok).toBe(false);
    expect(reorderComparison(state, 0, -1, LATER).ok).toBe(false);
  });
});

describe("resetComparison", () => {
  it("clears the property list", () => {
    const state = mkState(["prop_1", "prop_2"]);
    const reset = resetComparison(state, LATER);
    expect(reset.propertyIds).toEqual([]);
    expect(reset.updatedAt).toBe(LATER);
    expect(reset.createdAt).toBe(NOW); // preserved
  });

  it("is a no-op on an already empty comparison", () => {
    const state = mkState([]);
    const reset = resetComparison(state, LATER);
    expect(reset.propertyIds).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state = mkState(["prop_1"]);
    resetComparison(state, LATER);
    expect(state.propertyIds).toEqual(["prop_1"]);
  });
});

describe("projectRow", () => {
  it("computes price per sqft", () => {
    const row = projectRow(
      mkProperty({ listPrice: 500000, sqftLiving: 1000 }),
      0,
    );
    expect(row.pricePerSqft).toBe(500);
  });

  it("returns null for price per sqft when fields missing", () => {
    expect(projectRow(mkProperty({ listPrice: undefined }), 0).pricePerSqft).toBe(null);
    expect(projectRow(mkProperty({ sqftLiving: undefined }), 0).pricePerSqft).toBe(null);
    expect(projectRow(mkProperty({ sqftLiving: 0 }), 0).pricePerSqft).toBe(null);
  });

  it("combines baths correctly", () => {
    expect(projectRow(mkProperty({ bathsFull: 3, bathsHalf: 1 }), 0).baths).toBe(3.5);
    expect(projectRow(mkProperty({ bathsFull: 2, bathsHalf: 0 }), 0).baths).toBe(2);
  });

  it("detects waterfront correctly", () => {
    expect(projectRow(mkProperty({ waterfrontType: "ocean" }), 0).waterfront).toBe(true);
    expect(projectRow(mkProperty({ waterfrontType: "canal" }), 0).waterfront).toBe(true);
    expect(projectRow(mkProperty({ waterfrontType: "none" }), 0).waterfront).toBe(false);
    expect(projectRow(mkProperty({ waterfrontType: "" }), 0).waterfront).toBe(false);
    expect(projectRow(mkProperty({ waterfrontType: undefined }), 0).waterfront).toBe(false);
  });

  it("preserves order index", () => {
    const row = projectRow(mkProperty(), 4);
    expect(row.order).toBe(4);
  });

  it("handles missing photo arrays", () => {
    expect(projectRow(mkProperty({ photoUrls: [] }), 0).primaryPhotoUrl).toBe(null);
    expect(projectRow(mkProperty({ photoUrls: undefined }), 0).primaryPhotoUrl).toBe(null);
  });

  it("falls back to formatted address when provided", () => {
    const row = projectRow(
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
    const state = mkState(["b", "a", "c"]);
    const props = new Map<string, ComparisonPropertyInput>([
      ["a", mkProperty({ _id: "a" })],
      ["b", mkProperty({ _id: "b" })],
      ["c", mkProperty({ _id: "c" })],
    ]);
    const rows = buildComparisonRows(state, props);
    expect(rows.map((r) => r.propertyId)).toEqual(["b", "a", "c"]);
  });

  it("skips missing properties silently (no crash)", () => {
    const state = mkState(["a", "b", "c"]);
    const props = new Map<string, ComparisonPropertyInput>([
      ["a", mkProperty({ _id: "a" })],
      // b is missing
      ["c", mkProperty({ _id: "c" })],
    ]);
    const rows = buildComparisonRows(state, props);
    expect(rows.map((r) => r.propertyId)).toEqual(["a", "c"]);
  });

  it("returns empty array for empty state", () => {
    const rows = buildComparisonRows(mkState([]), new Map());
    expect(rows).toEqual([]);
  });

  it("assigns order indices based on state position, not skipped count", () => {
    // When property b is missing, rows for a and c still get order 0 and 2
    // (their position in state.propertyIds), not 0 and 1.
    const state = mkState(["a", "b", "c"]);
    const props = new Map<string, ComparisonPropertyInput>([
      ["a", mkProperty({ _id: "a" })],
      ["c", mkProperty({ _id: "c" })],
    ]);
    const rows = buildComparisonRows(state, props);
    expect(rows[0].order).toBe(0); // a at position 0
    expect(rows[1].order).toBe(2); // c at position 2
  });
});
