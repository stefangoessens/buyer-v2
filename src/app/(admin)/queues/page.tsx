import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

export const metadata = { title: "Review queues" };

/**
 * Queue index. KIN-798 replaces the empty state with a typed table of
 * open review items and age/priority/queue-type filters. The shell owns
 * the layout + navigation; the list of queues is queue-owner turf.
 */
export default function QueuesIndexPage() {
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Queues"
        title="Review queues"
        description="Triage intake, offer, contract, and escalation reviews here. Filters for age, priority, and queue type are added in KIN-798."
      />
      <AdminEmptyState
        title="No queue data wired yet"
        description="KIN-798 fills this route in with the full review table. The shell is already wired to the typed backend query."
      />
    </AdminShell>
  );
}
