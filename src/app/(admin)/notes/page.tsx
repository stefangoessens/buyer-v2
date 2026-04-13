"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AdminShell, type AdminShellSession } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { InternalNoteComposer } from "@/components/admin/InternalNoteComposer";
import { InternalNotesList } from "@/components/admin/InternalNotesList";

export default function NotesPage() {
  return (
    <AdminShell>
      <NotesContent />
    </AdminShell>
  );
}

function NotesContent() {
  const session = useQuery(api.adminShell.getCurrentSession) as
    | AdminShellSession
    | null
    | undefined;

  if (session === undefined) {
    return (
      <>
        <AdminPageHeader
          eyebrow="Ops tools"
          title="Internal notes"
          description="Buyer-hidden notes with role-aware access and retained history."
        />
        <AdminEmptyState title="Loading session…" />
      </>
    );
  }
  if (session === null) {
    return (
      <>
        <AdminPageHeader
          eyebrow="Ops tools"
          title="Internal notes"
          description="Buyer-hidden notes with role-aware access and retained history."
        />
        <AdminEmptyState title="Not authorized" />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Ops tools"
        title="Internal notes"
        description="Notes attached to deal rooms, offers, contracts, tours, buyers, and properties. Never visible to buyers. Edits are append-only."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <InternalNoteComposer role={session.user.role} />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Recent notes
          </h2>
          <InternalNotesList
            emptyTitle="No notes yet"
            emptyDescription="Use the composer on the left to write the first one."
          />
        </div>
      </div>
    </>
  );
}
