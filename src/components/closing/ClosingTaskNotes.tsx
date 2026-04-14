"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trackClosingEvent } from "@/lib/analytics/closing-events";

interface ClosingTaskNotesProps {
  taskId: Id<"closeTasks">;
  viewerLevel: "buyer" | "broker" | "admin";
  dealRoomId: Id<"dealRooms">;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ClosingTaskNotes({
  taskId,
  viewerLevel,
  dealRoomId,
}: ClosingTaskNotesProps) {
  const notes = useQuery(api.closeTaskNotes.listByTaskId, { taskId });
  const createNote = useMutation(api.closeTaskNotes.create);
  const removeNote = useMutation(api.closeTaskNotes.remove);

  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<
    "buyer_visible" | "internal_only"
  >("buyer_visible");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStaff = viewerLevel === "broker" || viewerLevel === "admin";

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createNote({
        taskId,
        body: body.trim(),
        visibility: isStaff ? visibility : "buyer_visible",
      });
      trackClosingEvent("TASK_NOTE_ADDED", {
        taskId,
        dealRoomId,
        visibility: isStaff ? visibility : "buyer_visible",
      });
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post note");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (noteId: Id<"closeTaskNotes">) => {
    if (!isStaff) return;
    await removeNote({ noteId });
  };

  if (notes === undefined) {
    return <p className="text-xs text-muted-foreground">Loading notes…</p>;
  }

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note._id}
              className="rounded-2xl border border-border bg-card px-3 py-2 text-sm"
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">
                  {note.authorRole}
                </Badge>
                <span>{formatTimestamp(note.createdAt)}</span>
                {note.visibility === "internal_only" && (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-muted-foreground"
                  >
                    Internal only
                  </Badge>
                )}
                {isStaff && (
                  <button
                    type="button"
                    onClick={() => handleRemove(note._id)}
                    className="ml-auto text-[11px] text-destructive underline-offset-2 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-foreground">{note.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          aria-label="New note body"
        />
        <div className="flex items-center justify-between gap-2">
          {isStaff ? (
            <Select
              value={visibility}
              onValueChange={(v) =>
                setVisibility(v as "buyer_visible" | "internal_only")
              }
            >
              <SelectTrigger className="h-8 w-auto text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buyer_visible">Visible to buyer</SelectItem>
                <SelectItem value="internal_only">Internal only</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">
              Visible to your broker team
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={!body.trim() || submitting}
          >
            {submitting ? "Posting…" : "Post note"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
