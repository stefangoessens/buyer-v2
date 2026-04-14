"use client";

import { useState, useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NOTE_SUBJECT_TYPES,
  NOTE_SUBJECT_LABELS,
  NOTE_VISIBILITIES,
  NOTE_VISIBILITY_DESCRIPTIONS,
  NOTE_VISIBILITY_LABELS,
  NOTE_BODY_MAX_CHARS,
  canCreateVisibility,
  validateNoteBody,
  type NoteSubjectType,
  type NoteVisibility,
} from "@/lib/admin/notesCatalog";
import type { InternalConsoleRole } from "@/lib/admin/roles";

interface InternalNoteComposerProps {
  role: InternalConsoleRole;
  /** Optional pre-fill — the subject detail pages use this to lock the form to one subject. */
  defaultSubjectType?: NoteSubjectType;
  defaultSubjectId?: string;
  onCreated?: () => void;
}

/**
 * Form for creating a new internal note. The subject selector is
 * optional — on subject detail pages we lock the form so ops can't
 * accidentally attach a note to the wrong entity.
 */
export function InternalNoteComposer({
  role,
  defaultSubjectType,
  defaultSubjectId,
  onCreated,
}: InternalNoteComposerProps) {
  const create = useMutation(api.internalNotes.createNote);
  const locked = Boolean(defaultSubjectType && defaultSubjectId);

  const [subjectType, setSubjectType] = useState<NoteSubjectType>(
    defaultSubjectType ?? "dealRoom",
  );
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("internal");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allowedVisibilities = NOTE_VISIBILITIES.filter((v) =>
    canCreateVisibility(role, v),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!subjectId.trim()) {
      setError("Subject ID required");
      return;
    }
    const valid = validateNoteBody(body);
    if (!valid.ok) {
      setError(valid.reason);
      return;
    }
    if (!canCreateVisibility(role, visibility)) {
      setError("You cannot set that visibility");
      return;
    }
    startTransition(async () => {
      try {
        await create({
          subjectType,
          subjectId: subjectId.trim(),
          body,
          visibility,
        });
        setBody("");
        if (!locked) setSubjectId("");
        setSuccess("Note saved");
        onCreated?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Create failed");
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-white p-5"
    >
      <div className="mb-3">
        <div className="text-sm font-semibold text-foreground">New note</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Internal notes are hidden from buyers. Append-only — edits create a
          new revision linked to this entry.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label
            htmlFor="note-subject-type"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Subject type
          </label>
          <select
            id="note-subject-type"
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value as NoteSubjectType)}
            disabled={locked}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm disabled:bg-muted"
          >
            {NOTE_SUBJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {NOTE_SUBJECT_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="note-subject-id"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Subject ID
          </label>
          <Input
            id="note-subject-id"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={locked}
            placeholder="Convex document ID"
          />
        </div>
      </div>

      <div className="mt-3">
        <label
          htmlFor="note-body"
          className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Note
        </label>
        <textarea
          id="note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={NOTE_BODY_MAX_CHARS}
          rows={5}
          placeholder="Plain text. Markdown is not rendered."
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        />
        <div className="mt-1 text-right text-[11px] text-neutral-400">
          {body.length} / {NOTE_BODY_MAX_CHARS}
        </div>
      </div>

      <div className="mt-3">
        <label
          htmlFor="note-visibility"
          className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Visibility
        </label>
        <select
          id="note-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as NoteVisibility)}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm"
        >
          {allowedVisibilities.map((v) => (
            <option key={v} value={v}>
              {NOTE_VISIBILITY_LABELS[v]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          {NOTE_VISIBILITY_DESCRIPTIONS[visibility]}
        </p>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-error-500/40 bg-error-50 px-3 py-2 text-sm text-error-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-3 rounded-md border border-success-500/40 bg-success-50 px-3 py-2 text-sm text-success-700">
          {success}
        </div>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={isPending}>
          Save note
        </Button>
      </div>
    </form>
  );
}
