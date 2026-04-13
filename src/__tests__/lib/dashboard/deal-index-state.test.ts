import { describe, expect, it } from "vitest";
import {
  buildDealIndex,
  type RawDealRoom,
  type RawProperty,
} from "@/lib/dashboard/deal-index";
import { resolveBuyerDashboardState } from "@/lib/dashboard/deal-index-state";

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

describe("resolveBuyerDashboardState", () => {
  it("returns loading while the query is unresolved", () => {
    const state = resolveBuyerDashboardState(undefined);

    expect(state.kind).toBe("loading");
    expect(state.activeDeals).toEqual([]);
    expect(state.recentDeals).toEqual([]);
    expect(state.summaryBadges).toEqual([]);
  });

  it("returns empty when the buyer has no deals", () => {
    const index = buildDealIndex([], new Map());
    const state = resolveBuyerDashboardState(index);

    expect(state.kind).toBe("empty");
    expect(state.summaryBadges).toHaveLength(4);
  });

  it("returns ready with distinct active and recent rows", () => {
    const index = buildDealIndex(
      [
        mkDeal({ _id: "active-1", status: "analysis" }),
        mkDeal({ _id: "recent-1", status: "closed", propertyId: "prop_2" }),
      ],
      new Map([
        ["prop_1", mkProperty()],
        ["prop_2", mkProperty({ _id: "prop_2" })],
      ]),
    );
    const state = resolveBuyerDashboardState(index);

    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") throw new Error("expected ready state");
    expect(state.activeDeals.map((row) => row.dealRoomId)).toEqual(["active-1"]);
    expect(state.recentDeals.map((row) => row.dealRoomId)).toEqual(["recent-1"]);
  });

  it("surfaces partial rows explicitly in ready state", () => {
    const index = buildDealIndex(
      [
        mkDeal({ _id: "active-1", status: "offer_sent", propertyId: "missing" }),
      ],
      new Map(),
    );
    const state = resolveBuyerDashboardState(index);

    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") throw new Error("expected ready state");
    expect(state.hasPartialDeals).toBe(true);
    expect(state.activeDeals[0]?.detailState).toBe("loading");
  });
});
