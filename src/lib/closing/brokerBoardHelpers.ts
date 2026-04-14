/**
 * Broker closing board helpers (KIN-1080).
 *
 * Pure TypeScript. Filters, sorts, and search for the admin-facing
 * closing deals board at /console/closing. No Convex imports — the
 * component feeds already-hydrated rows in and consumes the output.
 */

export type BrokerBoardStatus = "under_contract" | "closing";

export type BrokerBoardSortKey =
  | "closingDate"
  | "percentComplete"
  | "blockedCount";

export interface BrokerBoardFilter {
  stuckOnly: boolean;
  dueThisWeek: boolean;
  statuses: Set<BrokerBoardStatus>;
  searchQuery: string;
}

export interface BrokerBoardRow {
  dealRoomId: string;
  propertyId: string;
  propertyAddress: string;
  buyerName: string;
  status: BrokerBoardStatus;
  closingDate: number | null;
  totalTasks: number;
  completedTasks: number;
  blockedCount: number;
  overdueCount: number;
  nextDueDate: number | null;
  currentWaitingOn: string | null;
  percentComplete: number;
  isStuck: boolean;
  stuckSignals: readonly string[];
}

const ONE_WEEK_MS = 7 * 86_400_000;

/**
 * Case-insensitive substring match on the property address or buyer
 * name. An empty query matches every row.
 */
export function matchesSearch(
  row: BrokerBoardRow,
  query: string,
): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return true;
  const needle = trimmed.toLowerCase();
  return (
    row.propertyAddress.toLowerCase().includes(needle) ||
    row.buyerName.toLowerCase().includes(needle)
  );
}

/**
 * True when the row passes the current filter panel state. Filter
 * chips are AND-combined. An empty status set matches every status so
 * brokers can clear the chips without losing the whole list.
 */
export function matchesFilter(
  row: BrokerBoardRow,
  filter: BrokerBoardFilter,
  now: number,
): boolean {
  if (filter.stuckOnly && !row.isStuck) return false;

  if (filter.dueThisWeek) {
    if (row.nextDueDate === null) return false;
    if (row.nextDueDate > now + ONE_WEEK_MS) return false;
  }

  if (filter.statuses.size > 0 && !filter.statuses.has(row.status)) {
    return false;
  }

  return matchesSearch(row, filter.searchQuery);
}

/**
 * Sort a list of broker-board rows. `closingDate` and `blockedCount`
 * are ascending (closest deadline / lowest blockers first);
 * `percentComplete` is descending (most complete first). Rows with
 * null sort keys land at the end for `closingDate` so active deals
 * without a locked-in close always surface last.
 */
export function sortRows(
  rows: readonly BrokerBoardRow[],
  sortKey: BrokerBoardSortKey,
): BrokerBoardRow[] {
  const copy = [...rows];
  switch (sortKey) {
    case "closingDate":
      copy.sort((a, b) => {
        if (a.closingDate === null && b.closingDate === null) return 0;
        if (a.closingDate === null) return 1;
        if (b.closingDate === null) return -1;
        return a.closingDate - b.closingDate;
      });
      return copy;
    case "blockedCount":
      copy.sort((a, b) => a.blockedCount - b.blockedCount);
      return copy;
    case "percentComplete":
      copy.sort((a, b) => b.percentComplete - a.percentComplete);
      return copy;
    default: {
      const _exhaustive: never = sortKey;
      void _exhaustive;
      return copy;
    }
  }
}
