import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  QUEUE_KEY_LABELS,
  QUEUE_PRIORITY_LABELS,
  QUEUE_PRIORITY_TONE,
  QUEUE_STATUS_LABELS,
  QUEUE_STATUS_TONE,
  type QueueKey,
  type QueuePriority,
  type QueueStatus,
} from "@/lib/admin/queueLabels";
import { shortAge } from "@/lib/admin/queueFilters";

export interface QueueItemRowData {
  _id: string;
  queueKey: QueueKey;
  subjectType: string;
  subjectId: string;
  priority: QueuePriority;
  status: QueueStatus;
  summary: string;
  openedAt: string;
}

interface QueueItemRowProps {
  row: QueueItemRowData;
  now: Date;
  showQueueKey?: boolean;
}

/**
 * Single queue item row — used in both the queue index table and the
 * per-queue detail table. `showQueueKey` controls whether the queue
 * label is rendered (hidden on per-queue pages).
 */
export function QueueItemRow({ row, now, showQueueKey = true }: QueueItemRowProps) {
  return (
    <tr className="border-t border-neutral-100 last:border-b-0 hover:bg-neutral-50">
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            QUEUE_PRIORITY_TONE[row.priority],
          )}
        >
          {QUEUE_PRIORITY_LABELS[row.priority]}
        </span>
      </td>
      {showQueueKey ? (
        <td className="px-4 py-3 text-xs text-neutral-500">
          {QUEUE_KEY_LABELS[row.queueKey]}
        </td>
      ) : null}
      <td className="px-4 py-3 text-sm">
        <Link
          href={`/queues/${row.queueKey}#${row._id}`}
          className="font-medium text-neutral-900 hover:text-primary-700"
        >
          {row.summary}
        </Link>
        <div className="mt-0.5 text-xs text-neutral-500">
          {row.subjectType} · {row.subjectId.slice(0, 12)}
          {row.subjectId.length > 12 ? "…" : ""}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            QUEUE_STATUS_TONE[row.status],
          )}
        >
          {QUEUE_STATUS_LABELS[row.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-xs text-neutral-500 tabular-nums">
        {shortAge(row.openedAt, now)}
      </td>
    </tr>
  );
}

interface QueueItemTableProps {
  rows: QueueItemRowData[];
  now: Date;
  showQueueKey?: boolean;
}

export function QueueItemTable({ rows, now, showQueueKey = true }: QueueItemTableProps) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <table className="w-full">
        <thead className="border-b border-neutral-200 bg-neutral-50">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            <th className="px-4 py-3 w-28">Priority</th>
            {showQueueKey ? <th className="px-4 py-3 w-40">Queue</th> : null}
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3 w-28">Status</th>
            <th className="px-4 py-3 w-16 text-right">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <QueueItemRow
              key={row._id}
              row={row}
              now={now}
              showQueueKey={showQueueKey}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
