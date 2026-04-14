"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatConsoleTimestamp } from "@/lib/admin/format";
import {
  NOTE_SUBJECT_LABELS,
  NOTE_VISIBILITY_LABELS,
  type NoteSubjectType,
  type NoteVisibility,
} from "@/lib/admin/notesCatalog";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export interface InternalNoteRow {
  _id: Id<"internalNotes">;
  _creationTime: number;
  subjectType: string;
  subjectId: string;
  body: string;
  authorId: Id<"users">;
  visibility: NoteVisibility;
  parentNoteId?: Id<"internalNotes">;
  pinned?: boolean;
  createdAt: string;
}

interface InternalNotesListProps {
  /** If set, the list pulls notes for a single subject only. */
  subject?: { type: NoteSubjectType; id: string };
  /** Override the empty-state copy for embedded use. */
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * List of internal notes, either scoped to one subject or showing the
 * most recent notes across every subject. Pinned notes float to the
 * top. Each row shows the visibility pill and a short snippet.
 */
export function InternalNotesList({
  subject,
  emptyTitle,
  emptyDescription,
}: InternalNotesListProps) {
  const subjectArgs = subject
    ? { subjectType: subject.type, subjectId: subject.id }
    : "skip";
  const recentArgs = subject ? "skip" : { limit: 100 };

  const subjectRows = useQuery(
    api.internalNotes.listBySubject,
    subjectArgs as
      | { subjectType: string; subjectId: string }
      | "skip",
  ) as InternalNoteRow[] | undefined;
  const recentRows = useQuery(
    api.internalNotes.listRecent,
    recentArgs as { limit?: number } | "skip",
  ) as InternalNoteRow[] | undefined;

  const rows = subject ? subjectRows : recentRows;

  if (rows === undefined) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-muted-foreground">
        Loading notes…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center">
        <div className="text-sm font-medium text-foreground">
          {emptyTitle ?? "No notes yet"}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {emptyDescription ??
            "Internal notes appear here as soon as ops writes them."}
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li
          key={row._id}
          className={cn(
            "rounded-xl border bg-white p-4",
            row.pinned ? "border-primary-500/40" : "border-border",
          )}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              {row.pinned ? (
                <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                  Pinned
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {NOTE_VISIBILITY_LABELS[row.visibility]}
              </span>
              {!subject ? (
                <span className="text-muted-foreground">
                  {(NOTE_SUBJECT_LABELS[row.subjectType as NoteSubjectType] ??
                    row.subjectType)}
                  <span className="ml-1 font-mono text-[10px] text-neutral-400">
                    {row.subjectId.slice(0, 10)}
                    {row.subjectId.length > 10 ? "…" : ""}
                  </span>
                </span>
              ) : null}
              {row.parentNoteId ? (
                <span className="text-neutral-400">Revision</span>
              ) : null}
            </div>
            <span className="text-muted-foreground">
              {formatConsoleTimestamp(row.createdAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {row.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
