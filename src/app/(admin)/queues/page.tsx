"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { QueueIndexCards } from "@/components/admin/QueueIndexCards";
import type { QueueKey } from "@/lib/admin/queueLabels";

interface QueueCount {
  queueKey: QueueKey;
  open: number;
  inReview: number;
  urgent: number;
}

interface QueueCountsPayload {
  byQueue: QueueCount[];
  totalOpen: number;
  totalUrgent: number;
}

/**
 * Queue index. Renders a card for each of the six ops review queues
 * with live open/in-review/urgent counts. Each card links to the
 * queue detail route.
 */
export default function QueuesIndexPage() {
  return (
    <AdminShell>
      <QueuesIndexContent />
    </AdminShell>
  );
}

function QueuesIndexContent() {
  const counts = useQuery(api.opsQueues.getQueueCounts) as
    | QueueCountsPayload
    | undefined;

  return (
    <>
      <AdminPageHeader
        eyebrow="Queues"
        title="Review queues"
        description="Triage intake, offer, contract, and escalation reviews. Every card shows open items, currently-in-review items, and urgent counts."
      />
      {counts === undefined ? (
        <AdminEmptyState
          title="Loading queue counts…"
          description="Fetching typed counts from the backend."
        />
      ) : counts.totalOpen === 0 && counts.byQueue.every((q) => q.inReview === 0) ? (
        <>
          <div className="mb-4 text-sm text-neutral-500">
            No items open or in review right now. Everything clear.
          </div>
          <QueueIndexCards counts={counts.byQueue} />
        </>
      ) : (
        <QueueIndexCards counts={counts.byQueue} />
      )}
    </>
  );
}
