import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

export const metadata = { title: "Internal notes" };

/**
 * Internal notes landing. KIN-808 fills this with the note composer,
 * history tree, and the subject picker.
 */
export default function NotesPage() {
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Ops tools"
        title="Internal notes"
        description="Buyer-hidden notes attached to properties, offers, contracts, and tours. Append-only history with role-aware access."
      />
      <AdminEmptyState
        title="No notes yet"
        description="KIN-808 fills this route with the note composer and history tree."
      />
    </AdminShell>
  );
}
