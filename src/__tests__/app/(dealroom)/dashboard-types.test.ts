import { describe, expect, it } from "vitest";
import {
  DASHBOARD_NAV,
  formatDealRoomActivity,
  isEmptyDashboard,
  sortDealRoomsByActivity,
  type DashboardDealRoomTile,
} from "@/lib/dealroom/dashboard-types";

const NOW = "2026-04-12T12:00:00Z";

function tile(
  id: string,
  lastActivityAt: string | null,
  overrides: Partial<DashboardDealRoomTile> = {},
): DashboardDealRoomTile {
  return {
    dealRoomId: id,
    propertyId: `p-${id}`,
    address: "123 Main St",
    city: "Miami",
    state: "FL",
    listPrice: 500_000,
    beds: 3,
    baths: 2,
    sqft: 1800,
    photoUrl: null,
    score: null,
    status: "active",
    lastActivityAt,
    lastActivityLabel: "",
    ...overrides,
  };
}

describe("DASHBOARD_NAV", () => {
  it("exposes the 5 primary nav entries in order", () => {
    expect(DASHBOARD_NAV.map((n) => n.key)).toEqual([
      "home",
      "reports",
      "compare",
      "favourites",
      "profile",
    ]);
  });

  it("every nav item has a label, href, and description", () => {
    for (const item of DASHBOARD_NAV) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });
});

describe("formatDealRoomActivity", () => {
  it("returns 'No activity yet' for null", () => {
    expect(formatDealRoomActivity(null, NOW)).toBe("No activity yet");
  });

  it("returns 'Just now' for <1 minute", () => {
    expect(formatDealRoomActivity("2026-04-12T11:59:45Z", NOW)).toBe(
      "Just now",
    );
  });

  it("returns minutes for <1 hour", () => {
    expect(formatDealRoomActivity("2026-04-12T11:30:00Z", NOW)).toBe(
      "30 minutes ago",
    );
  });

  it("returns hours for <1 day", () => {
    expect(formatDealRoomActivity("2026-04-12T06:00:00Z", NOW)).toBe(
      "6 hours ago",
    );
  });

  it("returns days for <1 month", () => {
    expect(formatDealRoomActivity("2026-04-05T12:00:00Z", NOW)).toBe(
      "7 days ago",
    );
  });

  it("returns months for <1 year", () => {
    expect(formatDealRoomActivity("2026-01-12T12:00:00Z", NOW)).toBe(
      "3 months ago",
    );
  });

  it("returns years for >=1 year", () => {
    expect(formatDealRoomActivity("2024-04-12T12:00:00Z", NOW)).toBe(
      "2 years ago",
    );
  });

  it("handles invalid iso strings with a fallback", () => {
    expect(formatDealRoomActivity("garbage", NOW)).toBe("Recent activity");
  });
});

describe("sortDealRoomsByActivity", () => {
  it("sorts most-recent activity first", () => {
    const sorted = sortDealRoomsByActivity([
      tile("a", "2026-04-10T00:00:00Z"),
      tile("b", "2026-04-12T00:00:00Z"),
      tile("c", "2026-04-11T00:00:00Z"),
    ]);
    expect(sorted.map((t) => t.dealRoomId)).toEqual(["b", "c", "a"]);
  });

  it("places null activity last", () => {
    const sorted = sortDealRoomsByActivity([
      tile("a", null),
      tile("b", "2026-04-12T00:00:00Z"),
    ]);
    expect(sorted.map((t) => t.dealRoomId)).toEqual(["b", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      tile("a", "2026-04-10T00:00:00Z"),
      tile("b", "2026-04-12T00:00:00Z"),
    ];
    const copy = [...input];
    sortDealRoomsByActivity(input);
    expect(input).toEqual(copy);
  });
});

describe("isEmptyDashboard", () => {
  it("returns true for empty list", () => {
    expect(isEmptyDashboard([])).toBe(true);
  });

  it("returns false when tiles exist", () => {
    expect(isEmptyDashboard([tile("a", null)])).toBe(false);
  });
});
