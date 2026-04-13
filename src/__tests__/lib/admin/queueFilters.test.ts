import { describe, expect, it } from "vitest";
import {
  AGE_BUCKETS,
  DEFAULT_FILTER_STATE,
  filterQueueItems,
  filterToSearchParams,
  groupByQueueKey,
  isAgeBucket,
  isInAgeBucket,
  matchesFilter,
  parseFilterFromSearchParams,
  shortAge,
  sortQueueItemsForTriage,
  type QueueItemLike,
} from "@/lib/admin/queueFilters";

const NOW = new Date("2026-04-12T18:00:00.000Z");

function mkItem(overrides: Partial<QueueItemLike> = {}): QueueItemLike {
  return {
    queueKey: "intake_review",
    status: "open",
    priority: "normal",
    openedAt: "2026-04-12T17:00:00.000Z",
    ...overrides,
  };
}

describe("admin/queueFilters", () => {
  describe("AGE_BUCKETS / isAgeBucket", () => {
    it("contains the expected buckets", () => {
      expect(AGE_BUCKETS).toEqual([
        "all",
        "last_hour",
        "last_24h",
        "last_week",
        "older_than_week",
      ]);
    });

    it("accepts all declared buckets", () => {
      for (const bucket of AGE_BUCKETS) expect(isAgeBucket(bucket)).toBe(true);
    });

    it("rejects foreign values", () => {
      expect(isAgeBucket("forever")).toBe(false);
      expect(isAgeBucket("")).toBe(false);
    });
  });

  describe("isInAgeBucket", () => {
    it("'all' always matches", () => {
      expect(isInAgeBucket("2026-04-12T17:00:00.000Z", "all", NOW)).toBe(true);
      expect(isInAgeBucket("1970-01-01T00:00:00.000Z", "all", NOW)).toBe(true);
    });

    it("'last_hour' matches items within 60 minutes", () => {
      expect(isInAgeBucket("2026-04-12T17:30:00.000Z", "last_hour", NOW)).toBe(true);
      expect(isInAgeBucket("2026-04-12T16:30:00.000Z", "last_hour", NOW)).toBe(false);
    });

    it("'last_24h' matches items within 24 hours", () => {
      expect(isInAgeBucket("2026-04-11T19:00:00.000Z", "last_24h", NOW)).toBe(true);
      expect(isInAgeBucket("2026-04-11T17:00:00.000Z", "last_24h", NOW)).toBe(false);
    });

    it("'last_week' matches items within 7 days", () => {
      expect(isInAgeBucket("2026-04-06T17:00:00.000Z", "last_week", NOW)).toBe(true);
      expect(isInAgeBucket("2026-04-04T17:00:00.000Z", "last_week", NOW)).toBe(false);
    });

    it("'older_than_week' matches items older than 7 days", () => {
      expect(isInAgeBucket("2026-04-04T17:00:00.000Z", "older_than_week", NOW)).toBe(true);
      expect(isInAgeBucket("2026-04-06T17:00:00.000Z", "older_than_week", NOW)).toBe(false);
    });

    it("rejects future timestamps", () => {
      expect(isInAgeBucket("2030-01-01T00:00:00.000Z", "last_hour", NOW)).toBe(false);
    });

    it("rejects invalid timestamps", () => {
      expect(isInAgeBucket("not-a-date", "last_hour", NOW)).toBe(false);
    });
  });

  describe("matchesFilter", () => {
    it("keeps matching rows", () => {
      const item = mkItem({ queueKey: "offer_review", priority: "urgent" });
      expect(
        matchesFilter(
          item,
          { queueKey: "offer_review", status: "open", priority: "urgent", age: "all" },
          NOW,
        ),
      ).toBe(true);
    });

    it("drops rows on queueKey mismatch", () => {
      expect(
        matchesFilter(
          mkItem({ queueKey: "offer_review" }),
          { queueKey: "intake_review", status: "all", priority: "all", age: "all" },
          NOW,
        ),
      ).toBe(false);
    });

    it("drops rows on status mismatch unless 'all'", () => {
      expect(
        matchesFilter(
          mkItem({ status: "resolved" }),
          { queueKey: "all", status: "open", priority: "all", age: "all" },
          NOW,
        ),
      ).toBe(false);
      expect(
        matchesFilter(
          mkItem({ status: "resolved" }),
          { queueKey: "all", status: "all", priority: "all", age: "all" },
          NOW,
        ),
      ).toBe(true);
    });

    it("drops rows on priority mismatch", () => {
      expect(
        matchesFilter(
          mkItem({ priority: "low" }),
          { queueKey: "all", status: "all", priority: "urgent", age: "all" },
          NOW,
        ),
      ).toBe(false);
    });

    it("drops rows outside the age bucket", () => {
      expect(
        matchesFilter(
          mkItem({ openedAt: "2020-01-01T00:00:00.000Z" }),
          { queueKey: "all", status: "all", priority: "all", age: "last_hour" },
          NOW,
        ),
      ).toBe(false);
    });
  });

  describe("filterQueueItems", () => {
    it("filters multi-item arrays", () => {
      const rows = [
        mkItem({ priority: "urgent" }),
        mkItem({ priority: "high" }),
        mkItem({ priority: "low" }),
      ];
      const result = filterQueueItems(rows, {
        queueKey: "all",
        status: "all",
        priority: "urgent",
        age: "all",
      }, NOW);
      expect(result).toHaveLength(1);
      expect(result[0]!.priority).toBe("urgent");
    });

    it("returns empty when nothing matches", () => {
      const rows = [mkItem({ status: "resolved" })];
      const result = filterQueueItems(rows, DEFAULT_FILTER_STATE, NOW);
      expect(result).toHaveLength(0);
    });

    it("preserves input order for matching rows", () => {
      const rows = [
        mkItem({ priority: "normal", openedAt: "2026-04-12T10:00:00.000Z" }),
        mkItem({ priority: "normal", openedAt: "2026-04-12T09:00:00.000Z" }),
      ];
      const result = filterQueueItems(rows, DEFAULT_FILTER_STATE, NOW);
      expect(result.map((r) => r.openedAt)).toEqual([
        "2026-04-12T10:00:00.000Z",
        "2026-04-12T09:00:00.000Z",
      ]);
    });
  });

  describe("sortQueueItemsForTriage", () => {
    it("places urgent ahead of low", () => {
      const rows = [
        mkItem({ priority: "low" }),
        mkItem({ priority: "urgent" }),
        mkItem({ priority: "normal" }),
        mkItem({ priority: "high" }),
      ];
      const sorted = sortQueueItemsForTriage(rows);
      expect(sorted.map((r) => r.priority)).toEqual([
        "urgent",
        "high",
        "normal",
        "low",
      ]);
    });

    it("within a priority, oldest first", () => {
      const rows = [
        mkItem({ priority: "urgent", openedAt: "2026-04-12T12:00:00.000Z" }),
        mkItem({ priority: "urgent", openedAt: "2026-04-12T09:00:00.000Z" }),
        mkItem({ priority: "urgent", openedAt: "2026-04-12T11:00:00.000Z" }),
      ];
      const sorted = sortQueueItemsForTriage(rows);
      expect(sorted.map((r) => r.openedAt)).toEqual([
        "2026-04-12T09:00:00.000Z",
        "2026-04-12T11:00:00.000Z",
        "2026-04-12T12:00:00.000Z",
      ]);
    });

    it("pushes rows with unparseable timestamps to the end", () => {
      const rows = [
        mkItem({ priority: "normal", openedAt: "bad-date" }),
        mkItem({ priority: "normal", openedAt: "2026-04-12T10:00:00.000Z" }),
      ];
      const sorted = sortQueueItemsForTriage(rows);
      expect(sorted[0]!.openedAt).toBe("2026-04-12T10:00:00.000Z");
      expect(sorted[1]!.openedAt).toBe("bad-date");
    });

    it("does not mutate the input array", () => {
      const input = [mkItem({ priority: "low" }), mkItem({ priority: "urgent" })];
      const snapshot = [...input];
      sortQueueItemsForTriage(input);
      expect(input).toEqual(snapshot);
    });
  });

  describe("groupByQueueKey", () => {
    it("groups by queueKey", () => {
      const rows = [
        mkItem({ queueKey: "intake_review" }),
        mkItem({ queueKey: "offer_review" }),
        mkItem({ queueKey: "intake_review" }),
      ];
      const grouped = groupByQueueKey(rows);
      expect(grouped.get("intake_review")).toHaveLength(2);
      expect(grouped.get("offer_review")).toHaveLength(1);
      expect(grouped.has("contract_review")).toBe(false);
    });
  });

  describe("shortAge", () => {
    it("returns 'now' for items under 60s", () => {
      expect(shortAge("2026-04-12T17:59:30.000Z", NOW)).toBe("now");
    });

    it("returns Nm for minute-level ages", () => {
      expect(shortAge("2026-04-12T17:45:00.000Z", NOW)).toBe("15m");
    });

    it("returns Nh for hour-level ages", () => {
      expect(shortAge("2026-04-12T15:00:00.000Z", NOW)).toBe("3h");
    });

    it("returns Nd for day-level ages", () => {
      expect(shortAge("2026-04-09T18:00:00.000Z", NOW)).toBe("3d");
    });

    it("returns em-dash for invalid timestamps", () => {
      expect(shortAge("bad", NOW)).toBe("—");
    });
  });

  describe("parseFilterFromSearchParams / filterToSearchParams", () => {
    it("parses URLSearchParams", () => {
      const p = new URLSearchParams("queue=offer_review&status=in_review&priority=urgent&age=last_24h");
      expect(parseFilterFromSearchParams(p)).toEqual({
        queueKey: "offer_review",
        status: "in_review",
        priority: "urgent",
        age: "last_24h",
      });
    });

    it("parses plain record shape", () => {
      expect(
        parseFilterFromSearchParams({
          queue: "escalation",
          status: "all",
          priority: "all",
          age: "last_hour",
        }),
      ).toEqual({
        queueKey: "escalation",
        status: "all",
        priority: "all",
        age: "last_hour",
      });
    });

    it("falls back to defaults for unknown values", () => {
      expect(
        parseFilterFromSearchParams({
          queue: "bogus",
          status: "maybe",
          priority: "whenever",
          age: "ever",
        }),
      ).toEqual(DEFAULT_FILTER_STATE);
    });

    it("round-trips filters through search params (non-default only)", () => {
      const input = {
        queueKey: "offer_review" as const,
        status: "in_review" as const,
        priority: "high" as const,
        age: "last_24h" as const,
      };
      const params = filterToSearchParams(input);
      const back = parseFilterFromSearchParams(params);
      expect(back).toEqual(input);
    });

    it("filterToSearchParams omits defaults", () => {
      expect(filterToSearchParams(DEFAULT_FILTER_STATE)).toEqual({});
    });
  });
});
