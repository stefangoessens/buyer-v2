"use client";

import { use, useMemo } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { QueueFilters } from "@/components/admin/QueueFilters";
import { QueueItemTable, type QueueItemRowData } from "@/components/admin/QueueItemRow";
import { QueueActionPanel } from "@/components/admin/QueueActionPanel";
import {
  QUEUE_KEY_DESCRIPTIONS,
  QUEUE_KEY_LABELS,
  isQueueKey,
  type QueueKey,
} from "@/lib/admin/queueLabels";
import {
  DEFAULT_FILTER_STATE,
  parseFilterFromSearchParams,
  type QueueFilterState,
} from "@/lib/admin/queueFilters";
import { pluralize } from "@/lib/admin/format";
import type { Id } from "../../../../../convex/_generated/dataModel";

interface QueueDetailPageProps {
  params: Promise<{ queueId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Queue detail route. Shows the table of items for a single queue with
 * status/priority/age filters. URL params drive the filter so results
 * are shareable and bookmarkable. The first row with `status=open`
 * becomes the focused action target.
 */
export default function QueueDetailPage({ params, searchParams }: QueueDetailPageProps) {
  const { queueId } = use(params);
  const searchParamsValue = use(searchParams);
  if (!isQueueKey(queueId)) notFound();
  const queueKey = queueId;

  return (
    <AdminShell>
      <QueueDetailContent queueKey={queueKey} searchParams={searchParamsValue} />
    </AdminShell>
  );
}

interface QueueDetailContentProps {
  queueKey: QueueKey;
  searchParams: Record<string, string | string[] | undefined>;
}

function QueueDetailContent({ queueKey, searchParams }: QueueDetailContentProps) {
  const filter: QueueFilterState = useMemo(
    () => ({ ...parseFilterFromSearchParams(searchParams), queueKey }),
    [searchParams, queueKey],
  );

  const items = useQuery(api.opsQueues.listQueueItems, {
    queueKey,
    status: filter.status,
    priority: filter.priority,
    age: filter.age,
    limit: 200,
  }) as QueueItemRowData[] | undefined;

  const now = useMemo(() => new Date(), []);
  const focusId: Id<"opsReviewQueueItems"> | null = useMemo(() => {
    if (!items || items.length === 0) return null;
    const open = items.find((row) => row.status === "open") ?? items[0];
    return open ? (open._id as Id<"opsReviewQueueItems">) : null;
  }, [items]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Queue"
        title={QUEUE_KEY_LABELS[queueKey]}
        description={QUEUE_KEY_DESCRIPTIONS[queueKey]}
      />
      <QueueFilters filter={filter} hideQueueKey pinnedQueueKey={queueKey} />
      {items === undefined ? (
        <AdminEmptyState title="Loading queue items…" />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No items match these filters"
          description="Try widening the filters — or pat yourself on the back, the queue is clear."
        />
      ) : (
        <>
          <div className="mb-3 text-xs text-neutral-500">
            Showing {pluralize(items.length, "item")}, sorted urgent → low, then oldest.
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <QueueItemTable rows={items} now={now} showQueueKey={false} />
            {focusId ? (
              <QueueActionPanel
                itemId={focusId}
                currentStatus={
                  items.find((r) => r._id === focusId)?.status ?? "open"
                }
              />
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
