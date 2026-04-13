import { describe, it, expect } from "vitest";
import {
  buildDealIndex,
  buildDashboardRow,
  buildSummary,
  categorize,
  urgencyRank,
  TERMINAL_STATUSES,
  URGENCY_ORDER,
  type DealStatus,
  type RawDealRoom,
  type RawProperty,
} from "@/lib/dashboard/deal-index";

const mkDeal = (overrides: Partial<RawDealRoom> = {}): RawDealRoom => ({
  _id: "deal_1",
  propertyId: "prop_1",
  buyerId: "user_1",
  status: "analysis",
  accessLevel: "full",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  ...overrides,
});

const mkProperty = (overrides: Partial<RawProperty> = {}): RawProperty => ({
  _id: "prop_1",
  canonicalId: "canon-1",
  address: {
    street: "123 Main St",
    city: "Miami",
    state: "FL",
    zip: "33131",
    formatted: "123 Main St, Miami, FL 33131",
  },
  listPrice: 650000,
  beds: 2,
  bathsFull: 2,
  bathsHalf: 0,
  sqftLiving: 1200,
  photoUrls: ["https://cdn.example.com/photo1.jpg"],
  ...overrides,
});

describe("categorize", () => {
  it("categorizes terminal statuses as recent", () => {
    expect(categorize("closed")).toBe("recent");
    expect(categorize("withdrawn")).toBe("recent");
  });

  it("categorizes non-terminal statuses as active", () => {
    const nonTerminal: DealStatus[] = [
      "intake",
      "analysis",
      "tour_scheduled",
      "offer_prep",
      "offer_sent",
      "under_contract",
      "closing",
    ];
    for (const status of nonTerminal) {
      expect(categorize(status)).toBe("active");
    }
  });

  it("exposes the exact terminal set", () => {
    expect(TERMINAL_STATUSES).toContain("closed");
    expect(TERMINAL_STATUSES).toContain("withdrawn");
    expect(TERMINAL_STATUSES.length).toBe(2);
  });
});

describe("urgencyRank", () => {
  it("ranks offer_sent as most urgent", () => {
    expect(urgencyRank("offer_sent")).toBe(0);
  });

  it("ranks intake last among active statuses", () => {
    const activeIdx = URGENCY_ORDER.slice(0, URGENCY_ORDER.length - 2);
    expect(activeIdx[activeIdx.length - 1]).toBe("intake");
  });

  it("orders offer_sent > closing > under_contract", () => {
    expect(urgencyRank("offer_sent")).toBeLessThan(urgencyRank("closing"));
    expect(urgencyRank("closing")).toBeLessThan(urgencyRank("under_contract"));
  });

  it("handles unknown status by returning a high rank", () => {
    expect(urgencyRank("not_a_status" as DealStatus)).toBeGreaterThanOrEqual(
      URGENCY_ORDER.length,
    );
  });
});

describe("buildDashboardRow — hydrated path", () => {
  it("builds a full row when property is present", () => {
    const deal = mkDeal();
    const property = mkProperty();
    const row = buildDashboardRow(deal, property);

    expect(row.dealRoomId).toBe("deal_1");
    expect(row.propertyId).toBe("prop_1");
    expect(row.status).toBe("analysis");
    expect(row.category).toBe("active");
    expect(row.detailState).toBe("complete");
    expect(row.missingFields).toEqual([]);
    expect(row.addressLine).toBe("123 Main St, Miami, FL 33131");
    expect(row.listPrice).toBe(650000);
    expect(row.beds).toBe(2);
    expect(row.baths).toBe(2);
    expect(row.sqft).toBe(1200);
    expect(row.primaryPhotoUrl).toBe("https://cdn.example.com/photo1.jpg");
  });

  it("combines full + half baths correctly", () => {
    const row = buildDashboardRow(
      mkDeal(),
      mkProperty({ bathsFull: 2, bathsHalf: 1 }),
    );
    expect(row.baths).toBe(2.5);
  });

  it("handles missing baths fields", () => {
    const row = buildDashboardRow(
      mkDeal(),
      mkProperty({ bathsFull: undefined, bathsHalf: undefined }),
    );
    expect(row.baths).toBe(null);
  });

  it("falls back to formatting when address.formatted is missing", () => {
    const row = buildDashboardRow(
      mkDeal(),
      mkProperty({
        address: {
          street: "500 Brickell Ave",
          city: "Miami",
          state: "FL",
          zip: "33131",
        },
      }),
    );
    expect(row.addressLine).toBe("500 Brickell Ave, Miami, FL 33131");
  });

  it("includes unit when present", () => {
    const row = buildDashboardRow(
      mkDeal(),
      mkProperty({
        address: {
          street: "500 Brickell Ave",
          unit: "4B",
          city: "Miami",
          state: "FL",
          zip: "33131",
        },
      }),
    );
    expect(row.addressLine).toContain("Unit 4B");
  });

  it("returns null for primaryPhotoUrl when no photos", () => {
    const row = buildDashboardRow(mkDeal(), mkProperty({ photoUrls: [] }));
    expect(row.primaryPhotoUrl).toBe(null);
    expect(row.detailState).toBe("partial");
    expect(row.missingFields).toContain("primaryPhoto");
  });

  it("returns null for primaryPhotoUrl when photos undefined", () => {
    const row = buildDashboardRow(
      mkDeal(),
      mkProperty({ photoUrls: undefined }),
    );
    expect(row.primaryPhotoUrl).toBe(null);
    expect(row.detailState).toBe("partial");
    expect(row.missingFields).toContain("primaryPhoto");
  });
});

describe("buildDashboardRow — partial hydration", () => {
  it("builds a row with placeholder fields when property is missing", () => {
    const deal = mkDeal();
    const row = buildDashboardRow(deal, undefined);

    expect(row.detailState).toBe("loading");
    expect(row.missingFields).toEqual([
      "listPrice",
      "beds",
      "baths",
      "sqft",
      "primaryPhoto",
    ]);
    expect(row.addressLine).toBe("Property details loading…");
    expect(row.listPrice).toBe(null);
    expect(row.beds).toBe(null);
    expect(row.baths).toBe(null);
    expect(row.sqft).toBe(null);
    expect(row.primaryPhotoUrl).toBe(null);
  });

  it("preserves deal-level fields even when property is missing", () => {
    const deal = mkDeal({ status: "offer_sent", accessLevel: "registered" });
    const row = buildDashboardRow(deal, undefined);

    expect(row.status).toBe("offer_sent");
    expect(row.accessLevel).toBe("registered");
    expect(row.category).toBe("active");
  });

  it("marks rows partial when the property exists but summary fields are missing", () => {
    const row = buildDashboardRow(
      mkDeal(),
      mkProperty({
        listPrice: undefined,
        beds: undefined,
        bathsFull: undefined,
        bathsHalf: undefined,
        sqftLiving: undefined,
        photoUrls: [],
      }),
    );

    expect(row.detailState).toBe("partial");
    expect(row.missingFields).toEqual([
      "listPrice",
      "beds",
      "baths",
      "sqft",
      "primaryPhoto",
    ]);
    expect(row.addressLine).toBe("123 Main St, Miami, FL 33131");
  });
});

describe("buildDealIndex — happy path", () => {
  it("splits active and recent deals", () => {
    const deals: RawDealRoom[] = [
      mkDeal({ _id: "d1", status: "analysis" }),
      mkDeal({ _id: "d2", status: "offer_sent", propertyId: "p2" }),
      mkDeal({ _id: "d3", status: "closed", propertyId: "p3" }),
      mkDeal({ _id: "d4", status: "withdrawn", propertyId: "p4" }),
    ];
    const props = new Map<string, RawProperty>([
      ["prop_1", mkProperty()],
      ["p2", mkProperty({ _id: "p2" })],
      ["p3", mkProperty({ _id: "p3" })],
      ["p4", mkProperty({ _id: "p4" })],
    ]);

    const result = buildDealIndex(deals, props);
    expect(result.active.length).toBe(2);
    expect(result.recent.length).toBe(2);
    expect(result.active.map((r) => r.dealRoomId).sort()).toEqual(["d1", "d2"]);
    expect(result.recent.map((r) => r.dealRoomId).sort()).toEqual(["d3", "d4"]);
  });

  it("sorts active by urgency rank ascending", () => {
    const deals: RawDealRoom[] = [
      mkDeal({ _id: "d1", status: "intake" }),
      mkDeal({ _id: "d2", status: "offer_sent", propertyId: "p2" }),
      mkDeal({ _id: "d3", status: "tour_scheduled", propertyId: "p3" }),
    ];
    const props = new Map<string, RawProperty>([
      ["prop_1", mkProperty()],
      ["p2", mkProperty({ _id: "p2" })],
      ["p3", mkProperty({ _id: "p3" })],
    ]);

    const result = buildDealIndex(deals, props);
    expect(result.active[0].dealRoomId).toBe("d2"); // offer_sent most urgent
    expect(result.active[result.active.length - 1].dealRoomId).toBe("d1"); // intake least
  });

  it("sorts active by updatedAt desc within same urgency tier", () => {
    const deals: RawDealRoom[] = [
      mkDeal({
        _id: "d1",
        status: "analysis",
        updatedAt: "2026-04-01T00:00:00.000Z",
      }),
      mkDeal({
        _id: "d2",
        status: "analysis",
        updatedAt: "2026-04-05T00:00:00.000Z",
        propertyId: "p2",
      }),
    ];
    const props = new Map<string, RawProperty>([
      ["prop_1", mkProperty()],
      ["p2", mkProperty({ _id: "p2" })],
    ]);

    const result = buildDealIndex(deals, props);
    expect(result.active[0].dealRoomId).toBe("d2"); // more recent
    expect(result.active[1].dealRoomId).toBe("d1");
  });

  it("sorts recent by updatedAt desc", () => {
    const deals: RawDealRoom[] = [
      mkDeal({
        _id: "d1",
        status: "closed",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
      mkDeal({
        _id: "d2",
        status: "closed",
        updatedAt: "2026-03-15T00:00:00.000Z",
        propertyId: "p2",
      }),
      mkDeal({
        _id: "d3",
        status: "withdrawn",
        updatedAt: "2026-03-10T00:00:00.000Z",
        propertyId: "p3",
      }),
    ];
    const props = new Map<string, RawProperty>([
      ["prop_1", mkProperty()],
      ["p2", mkProperty({ _id: "p2" })],
      ["p3", mkProperty({ _id: "p3" })],
    ]);

    const result = buildDealIndex(deals, props);
    expect(result.recent.map((r) => r.dealRoomId)).toEqual(["d2", "d3", "d1"]);
  });
});

describe("buildDealIndex — edge cases", () => {
  it("returns empty arrays and zero counts when no deals", () => {
    const result = buildDealIndex([], new Map());
    expect(result.active).toEqual([]);
    expect(result.recent).toEqual([]);
    expect(result.summary.activeCount).toBe(0);
    expect(result.summary.recentCount).toBe(0);
    expect(result.summary.hasAnyDeals).toBe(false);
    expect(result.summary.mostUrgentStatus).toBe(null);
    expect(result.summary.oldestActiveDays).toBe(null);
  });

  it("handles partially-hydrated deals gracefully", () => {
    const deals: RawDealRoom[] = [
      mkDeal({ _id: "d1", status: "analysis", propertyId: "p1" }),
      mkDeal({ _id: "d2", status: "offer_sent", propertyId: "missing" }),
    ];
    const props = new Map<string, RawProperty>([
      ["p1", mkProperty({ _id: "p1" })],
    ]);

    const result = buildDealIndex(deals, props);
    expect(result.active.length).toBe(2);
    const d2Row = result.active.find((r) => r.dealRoomId === "d2");
    expect(d2Row?.detailState).toBe("loading");
    expect(d2Row?.listPrice).toBe(null);
    const d1Row = result.active.find((r) => r.dealRoomId === "d1");
    expect(d1Row?.detailState).toBe("complete");
  });

  it("orders partial rows by urgency same as hydrated rows", () => {
    const deals: RawDealRoom[] = [
      mkDeal({ _id: "d1", status: "analysis", propertyId: "p1" }),
      mkDeal({ _id: "d2", status: "offer_sent", propertyId: "missing" }),
    ];
    const props = new Map<string, RawProperty>([
      ["p1", mkProperty({ _id: "p1" })],
    ]);

    const result = buildDealIndex(deals, props);
    // d2 (offer_sent) wins urgency even without hydration
    expect(result.active[0].dealRoomId).toBe("d2");
  });
});

describe("buildSummary", () => {
  it("returns all-zero summary for empty rows", () => {
    const summary = buildSummary([]);
    expect(summary.activeCount).toBe(0);
    expect(summary.recentCount).toBe(0);
    expect(summary.mostUrgentStatus).toBe(null);
    expect(summary.oldestActiveDays).toBe(null);
    expect(summary.hasAnyDeals).toBe(false);
    expect(summary.hasPartialDeals).toBe(false);
    expect(summary.badges.map((badge) => badge.kind)).toEqual([
      "active_count",
      "recent_count",
      "most_urgent",
      "oldest_active",
    ]);
  });

  it("counts active and recent separately", () => {
    const rows = buildDealIndex(
      [
        mkDeal({ _id: "d1", status: "analysis" }),
        mkDeal({ _id: "d2", status: "offer_sent", propertyId: "p2" }),
        mkDeal({ _id: "d3", status: "closed", propertyId: "p3" }),
      ],
      new Map([
        ["prop_1", mkProperty()],
        ["p2", mkProperty({ _id: "p2" })],
        ["p3", mkProperty({ _id: "p3" })],
      ]),
    );

    expect(rows.summary.activeCount).toBe(2);
    expect(rows.summary.recentCount).toBe(1);
    expect(rows.summary.hasAnyDeals).toBe(true);
    expect(rows.summary.hasPartialDeals).toBe(false);
  });

  it("reports the most urgent active status", () => {
    const rows = buildDealIndex(
      [
        mkDeal({ _id: "d1", status: "analysis" }),
        mkDeal({ _id: "d2", status: "offer_sent", propertyId: "p2" }),
      ],
      new Map([
        ["prop_1", mkProperty()],
        ["p2", mkProperty({ _id: "p2" })],
      ]),
    );
    expect(rows.summary.mostUrgentStatus).toBe("offer_sent");
  });

  it("computes oldestActiveDays from the oldest updatedAt", () => {
    const tenDaysAgo = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const rows = buildDealIndex(
      [
        mkDeal({ _id: "d1", status: "analysis", updatedAt: tenDaysAgo }),
      ],
      new Map([["prop_1", mkProperty()]]),
    );
    expect(rows.summary.oldestActiveDays).toBeGreaterThanOrEqual(9);
    expect(rows.summary.oldestActiveDays).toBeLessThanOrEqual(11);
  });

  it("excludes recent (terminal) deals from oldestActiveDays computation", () => {
    // All deals are terminal → no active, so oldestActiveDays is null.
    const rows = buildDealIndex(
      [
        mkDeal({ _id: "d1", status: "closed" }),
        mkDeal({ _id: "d2", status: "withdrawn", propertyId: "p2" }),
      ],
      new Map([
        ["prop_1", mkProperty()],
        ["p2", mkProperty({ _id: "p2" })],
      ]),
    );
    expect(rows.summary.oldestActiveDays).toBe(null);
    expect(rows.summary.mostUrgentStatus).toBe(null);
  });

  it("reports partial summary state when any row is incomplete", () => {
    const rows = buildDealIndex(
      [
        mkDeal({ _id: "d1", status: "analysis", propertyId: "p1" }),
        mkDeal({ _id: "d2", status: "offer_sent", propertyId: "missing" }),
      ],
      new Map([["p1", mkProperty({ _id: "p1" })]]),
    );

    expect(rows.summary.hasPartialDeals).toBe(true);
    expect(
      rows.summary.badges.find((badge) => badge.kind === "most_urgent")?.value,
    ).toBe("Offer sent");
  });
});
