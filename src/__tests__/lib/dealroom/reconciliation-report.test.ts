import { describe, expect, it } from "vitest";

import {
  collectMonthlyReconciliationDealRoomIds,
  deriveReconciliationReviewStatus,
  getReportMonthBounds,
  latestReportsByDealRoom,
} from "@/lib/dealroom/reconciliation-report";

describe("deriveReconciliationReviewStatus", () => {
  it("marks discrepancies as pending review", () => {
    expect(deriveReconciliationReviewStatus(true)).toBe("pending");
  });

  it("marks clean reconciliations as resolved", () => {
    expect(deriveReconciliationReviewStatus(false)).toBe("resolved");
  });
});

describe("getReportMonthBounds", () => {
  it("builds an inclusive-exclusive UTC window for the report month", () => {
    expect(getReportMonthBounds("2026-04")).toEqual({
      start: "2026-04-01T00:00:00.000Z",
      end: "2026-05-01T00:00:00.000Z",
    });
  });

  it("rolls year boundaries correctly", () => {
    expect(getReportMonthBounds("2026-12")).toEqual({
      start: "2026-12-01T00:00:00.000Z",
      end: "2027-01-01T00:00:00.000Z",
    });
  });
});

describe("collectMonthlyReconciliationDealRoomIds", () => {
  it("uses actual closing entries for the target month and dedupes by deal room", () => {
    expect(
      collectMonthlyReconciliationDealRoomIds(
        [
          {
            dealRoomId: "deal_1",
            entryType: "actual_closing_credit",
            createdAt: "2026-04-04T14:00:00.000Z",
          },
          {
            dealRoomId: "deal_1",
            entryType: "actual_closing_credit",
            createdAt: "2026-04-05T09:30:00.000Z",
          },
          {
            dealRoomId: "deal_2",
            entryType: "projected_closing_credit",
            createdAt: "2026-04-06T11:00:00.000Z",
          },
          {
            dealRoomId: "deal_3",
            entryType: "actual_closing_credit",
            createdAt: "2026-03-31T23:59:59.999Z",
          },
          {
            dealRoomId: "deal_4",
            entryType: "actual_closing_credit",
            createdAt: "2026-04-30T23:59:59.999Z",
          },
        ],
        "2026-04",
      ),
    ).toEqual(["deal_1", "deal_4"]);
  });
});

describe("latestReportsByDealRoom", () => {
  it("keeps only the newest report per transaction", () => {
    expect(
      latestReportsByDealRoom([
        {
          dealRoomId: "deal_1",
          generatedAt: "2026-04-08T09:00:00.000Z",
          reportId: "r1",
        },
        {
          dealRoomId: "deal_1",
          generatedAt: "2026-04-09T09:00:00.000Z",
          reportId: "r2",
        },
        {
          dealRoomId: "deal_2",
          generatedAt: "2026-04-07T09:00:00.000Z",
          reportId: "r3",
        },
      ]),
    ).toEqual([
      {
        dealRoomId: "deal_1",
        generatedAt: "2026-04-09T09:00:00.000Z",
        reportId: "r2",
      },
      {
        dealRoomId: "deal_2",
        generatedAt: "2026-04-07T09:00:00.000Z",
        reportId: "r3",
      },
    ]);
  });
});
