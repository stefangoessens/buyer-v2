import { describe, it, expect } from "vitest";

type Row = {
  dealRoomId: string;
  lastActivityAt: string;
  journeyPriority: "high" | "normal" | "low";
  attentionCount: number;
  address: string;
};

type SortKey = "recent" | "priority" | "attention" | "alpha";

function sortJourneys<T extends Row>(rows: readonly T[], sort: SortKey): T[] {
  const copy = [...rows];
  const priorityRank = { high: 0, normal: 1, low: 2 } as const;
  switch (sort) {
    case "recent":
      return copy.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    case "priority":
      return copy.sort(
        (a, b) => priorityRank[a.journeyPriority] - priorityRank[b.journeyPriority],
      );
    case "attention":
      return copy.sort((a, b) => b.attentionCount - a.attentionCount);
    case "alpha":
      return copy.sort((a, b) => a.address.localeCompare(b.address));
  }
}

function filterBySearch<T extends Row>(rows: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) => r.address.toLowerCase().includes(q));
}

const ROWS: Row[] = [
  {
    dealRoomId: "a",
    lastActivityAt: "2026-04-01T00:00:00Z",
    journeyPriority: "normal",
    attentionCount: 0,
    address: "100 Alpha Way",
  },
  {
    dealRoomId: "b",
    lastActivityAt: "2026-04-10T00:00:00Z",
    journeyPriority: "high",
    attentionCount: 2,
    address: "200 Beta Rd",
  },
  {
    dealRoomId: "c",
    lastActivityAt: "2026-04-05T00:00:00Z",
    journeyPriority: "low",
    attentionCount: 5,
    address: "300 Gamma Ln",
  },
];

describe("journeys client filters", () => {
  it("sorts by recent activity desc", () => {
    const sorted = sortJourneys(ROWS, "recent");
    expect(sorted.map((r) => r.dealRoomId)).toEqual(["b", "c", "a"]);
  });

  it("sorts by priority high → low", () => {
    const sorted = sortJourneys(ROWS, "priority");
    expect(sorted.map((r) => r.dealRoomId)).toEqual(["b", "a", "c"]);
  });

  it("sorts by attention count desc", () => {
    const sorted = sortJourneys(ROWS, "attention");
    expect(sorted.map((r) => r.dealRoomId)).toEqual(["c", "b", "a"]);
  });

  it("sorts alphabetically", () => {
    const sorted = sortJourneys(ROWS, "alpha");
    expect(sorted.map((r) => r.dealRoomId)).toEqual(["a", "b", "c"]);
  });

  it("returns all rows on empty search", () => {
    expect(filterBySearch(ROWS, "").length).toBe(3);
  });

  it("filters rows case-insensitively on address", () => {
    const filtered = filterBySearch(ROWS, "beta");
    expect(filtered.map((r) => r.dealRoomId)).toEqual(["b"]);
  });

  it("does not mutate input when sorting", () => {
    const before = ROWS.map((r) => r.dealRoomId);
    sortJourneys(ROWS, "attention");
    expect(ROWS.map((r) => r.dealRoomId)).toEqual(before);
  });
});
