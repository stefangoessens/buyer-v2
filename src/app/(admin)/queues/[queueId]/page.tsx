import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

const KNOWN_QUEUES = [
  "intake_review",
  "offer_review",
  "contract_review",
  "tour_dispute",
  "payout_dispute",
  "escalation",
] as const;
type KnownQueue = (typeof KNOWN_QUEUES)[number];

function isKnownQueue(id: string): id is KnownQueue {
  return (KNOWN_QUEUES as readonly string[]).includes(id);
}

const QUEUE_LABELS: Readonly<Record<KnownQueue, string>> = {
  intake_review: "Intake review",
  offer_review: "Offer review",
  contract_review: "Contract review",
  tour_dispute: "Tour dispute",
  payout_dispute: "Payout dispute",
  escalation: "Escalation",
};

/**
 * Queue detail view. Validates the `queueId` param against the closed
 * set defined in `convex/schema.ts > opsReviewQueueItems.queueKey` so we
 * do not render a shell for a fabricated URL. KIN-798 adds the table +
 * mutations; this card just proves the detail route slot exists.
 */
export default async function QueueDetailPage({
  params,
}: {
  params: Promise<{ queueId: string }>;
}) {
  const { queueId } = await params;
  if (!isKnownQueue(queueId)) notFound();
  const label = QUEUE_LABELS[queueId];

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Queue"
        title={label}
        description="Queue detail view. KIN-798 fills this with the audited review table."
      />
      <AdminEmptyState
        title="Detail view stub"
        description={`Items assigned to the ${label.toLowerCase()} queue will render here once KIN-798 ships.`}
      />
    </AdminShell>
  );
}
