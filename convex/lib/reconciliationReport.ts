export type DerivedReconciliationReviewStatus = "pending" | "resolved";

export interface MonthlyReconciliationEntryLike {
  dealRoomId: string;
  entryType: string;
  createdAt: string;
}

export interface GeneratedReconciliationReportLike {
  dealRoomId: string;
  generatedAt: string;
}

export function deriveReconciliationReviewStatus(
  discrepancyFlag: boolean,
): DerivedReconciliationReviewStatus {
  return discrepancyFlag ? "pending" : "resolved";
}

export function getReportMonthBounds(reportMonth: string): {
  start: string;
  end: string;
} {
  if (!/^\d{4}-\d{2}$/.test(reportMonth)) {
    throw new Error("reportMonth must be in YYYY-MM format");
  }

  const [yearString, monthString] = reportMonth.split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;

  const start = new Date(Date.UTC(year, monthIndex, 1)).toISOString();
  const end = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString();

  return { start, end };
}

export function collectMonthlyReconciliationDealRoomIds(
  entries: Array<MonthlyReconciliationEntryLike>,
  reportMonth: string,
): Array<string> {
  const { start, end } = getReportMonthBounds(reportMonth);
  const seen = new Set<string>();
  const dealRoomIds: Array<string> = [];

  for (const entry of entries) {
    if (entry.entryType !== "actual_closing_credit") {
      continue;
    }
    if (entry.createdAt < start || entry.createdAt >= end) {
      continue;
    }
    if (seen.has(entry.dealRoomId)) {
      continue;
    }

    seen.add(entry.dealRoomId);
    dealRoomIds.push(entry.dealRoomId);
  }

  return dealRoomIds;
}

export function latestReportsByDealRoom<T extends GeneratedReconciliationReportLike>(
  reports: Array<T>,
): Array<T> {
  const latestByDealRoom = new Map<string, T>();

  for (const report of reports) {
    const existing = latestByDealRoom.get(report.dealRoomId);
    if (!existing || report.generatedAt > existing.generatedAt) {
      latestByDealRoom.set(report.dealRoomId, report);
    }
  }

  return Array.from(latestByDealRoom.values());
}
