import { describe, it, expect } from "vitest";
import {
  matchesSearch,
  matchesFilter,
  sortRows,
  type BrokerBoardFilter,
  type BrokerBoardRow,
} from "@/lib/closing/brokerBoardHelpers";

const ONE_DAY_MS = 86_400_000;

function makeRow(overrides: Partial<BrokerBoardRow> = {}): BrokerBoardRow {
  return {
    dealRoomId: "dr_1",
    propertyId: "p_1",
    propertyAddress: "123 Ocean Dr, Miami Beach",
    buyerName: "Jane Doe",
    status: "under_contract",
    closingDate: null,
    totalTasks: 20,
    completedTasks: 5,
    blockedCount: 0,
    overdueCount: 0,
    nextDueDate: null,
    currentWaitingOn: null,
    percentComplete: 25,
    isStuck: false,
    stuckSignals: [],
    ...overrides,
  };
}

function makeFilter(
  overrides: Partial<BrokerBoardFilter> = {},
): BrokerBoardFilter {
  return {
    stuckOnly: false,
    dueThisWeek: false,
    statuses: new Set(),
    searchQuery: "",
    ...overrides,
  };
}

describe("matchesSearch", () => {
  const row = makeRow({
    propertyAddress: "456 Palm Ave, Orlando",
    buyerName: "Carlos Ruiz",
  });

  it("matches every row when the query is empty", () => {
    expect(matchesSearch(row, "")).toBe(true);
  });

  it("matches every row when the query is whitespace", () => {
    expect(matchesSearch(row, "   ")).toBe(true);
  });

  it("matches an exact substring of the address", () => {
    expect(matchesSearch(row, "Palm Ave")).toBe(true);
  });

  it("matches an exact substring of the buyer name", () => {
    expect(matchesSearch(row, "Ruiz")).toBe(true);
  });

  it("is case-insensitive on address", () => {
    expect(matchesSearch(row, "orlando")).toBe(true);
  });

  it("is case-insensitive on buyer name", () => {
    expect(matchesSearch(row, "CARLOS")).toBe(true);
  });

  it("returns false when the query matches neither field", () => {
    expect(matchesSearch(row, "Tallahassee")).toBe(false);
  });
});

describe("matchesFilter", () => {
  const now = 1_700_000_000_000;

  it("excludes non-stuck rows when stuckOnly is on", () => {
    const stuck = makeRow({ isStuck: true });
    const notStuck = makeRow({ isStuck: false });
    const filter = makeFilter({ stuckOnly: true });

    expect(matchesFilter(stuck, filter, now)).toBe(true);
    expect(matchesFilter(notStuck, filter, now)).toBe(false);
  });

  it("excludes rows with no nextDueDate when dueThisWeek is on", () => {
    const row = makeRow({ nextDueDate: null });
    const filter = makeFilter({ dueThisWeek: true });

    expect(matchesFilter(row, filter, now)).toBe(false);
  });

  it("includes rows with nextDueDate inside the week boundary", () => {
    const inWindow = makeRow({ nextDueDate: now + 3 * ONE_DAY_MS });
    const filter = makeFilter({ dueThisWeek: true });

    expect(matchesFilter(inWindow, filter, now)).toBe(true);
  });

  it("includes rows exactly at the 7-day boundary", () => {
    const atBoundary = makeRow({ nextDueDate: now + 7 * ONE_DAY_MS });
    const filter = makeFilter({ dueThisWeek: true });

    expect(matchesFilter(atBoundary, filter, now)).toBe(true);
  });

  it("excludes rows one millisecond past the week boundary", () => {
    const past = makeRow({ nextDueDate: now + 7 * ONE_DAY_MS + 1 });
    const filter = makeFilter({ dueThisWeek: true });

    expect(matchesFilter(past, filter, now)).toBe(false);
  });

  it("matches every status when the status set is empty", () => {
    const row = makeRow({ status: "closing" });
    const filter = makeFilter({ statuses: new Set() });

    expect(matchesFilter(row, filter, now)).toBe(true);
  });

  it("filters by an explicit status set", () => {
    const underContract = makeRow({ status: "under_contract" });
    const closing = makeRow({ status: "closing" });
    const filter = makeFilter({ statuses: new Set(["closing"]) });

    expect(matchesFilter(underContract, filter, now)).toBe(false);
    expect(matchesFilter(closing, filter, now)).toBe(true);
  });

  it("combines filter chips with AND semantics", () => {
    const row = makeRow({
      isStuck: true,
      status: "closing",
      nextDueDate: now + 2 * ONE_DAY_MS,
      propertyAddress: "88 Key Biscayne Rd",
      buyerName: "Alex",
    });
    const filter = makeFilter({
      stuckOnly: true,
      dueThisWeek: true,
      statuses: new Set(["closing"]),
      searchQuery: "Biscayne",
    });

    expect(matchesFilter(row, filter, now)).toBe(true);
  });

  it("rejects when any single filter fails (search)", () => {
    const row = makeRow({
      isStuck: true,
      propertyAddress: "1 Main St",
      buyerName: "Alex",
    });
    const filter = makeFilter({
      stuckOnly: true,
      searchQuery: "Nowhere",
    });

    expect(matchesFilter(row, filter, now)).toBe(false);
  });
});

describe("sortRows", () => {
  const base = 1_700_000_000_000;

  it("sorts by closingDate ascending with nulls last", () => {
    const rows = [
      makeRow({ dealRoomId: "a", closingDate: base + 3 * ONE_DAY_MS }),
      makeRow({ dealRoomId: "b", closingDate: null }),
      makeRow({ dealRoomId: "c", closingDate: base + 1 * ONE_DAY_MS }),
    ];
    const sorted = sortRows(rows, "closingDate");
    expect(sorted.map((r) => r.dealRoomId)).toEqual(["c", "a", "b"]);
  });

  it("sorts by percentComplete descending", () => {
    const rows = [
      makeRow({ dealRoomId: "a", percentComplete: 10 }),
      makeRow({ dealRoomId: "b", percentComplete: 90 }),
      makeRow({ dealRoomId: "c", percentComplete: 50 }),
    ];
    const sorted = sortRows(rows, "percentComplete");
    expect(sorted.map((r) => r.dealRoomId)).toEqual(["b", "c", "a"]);
  });

  it("sorts by blockedCount ascending", () => {
    const rows = [
      makeRow({ dealRoomId: "a", blockedCount: 4 }),
      makeRow({ dealRoomId: "b", blockedCount: 0 }),
      makeRow({ dealRoomId: "c", blockedCount: 2 }),
    ];
    const sorted = sortRows(rows, "blockedCount");
    expect(sorted.map((r) => r.dealRoomId)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      makeRow({ dealRoomId: "a", percentComplete: 10 }),
      makeRow({ dealRoomId: "b", percentComplete: 90 }),
    ];
    const originalOrder = rows.map((r) => r.dealRoomId);
    sortRows(rows, "percentComplete");
    expect(rows.map((r) => r.dealRoomId)).toEqual(originalOrder);
  });
});
