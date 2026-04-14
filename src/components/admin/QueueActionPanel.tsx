"use client";

import { useState, useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import type { Id } from "../../../convex/_generated/dataModel";

interface QueueActionPanelProps {
  itemId: Id<"opsReviewQueueItems">;
  currentStatus: "open" | "in_review" | "resolved" | "dismissed";
}

/**
 * Action panel rendered on the queue detail view. Wires the claim /
 * resolve / dismiss mutations. Keeps the dialog simple — one text
 * area for notes, one buttons row, inline errors.
 */
export function QueueActionPanel({ itemId, currentStatus }: QueueActionPanelProps) {
  const claim = useMutation(api.opsQueues.claimForReview);
  const resolve = useMutation(api.opsQueues.resolveItem);
  const dismiss = useMutation(api.opsQueues.dismissItem);

  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const terminal = currentStatus === "resolved" || currentStatus === "dismissed";

  const runAction = (action: "claim" | "resolve" | "dismiss") => {
    setError(null);
    startTransition(async () => {
      try {
        if (action === "claim") {
          await claim({ itemId });
        } else if (action === "resolve") {
          await resolve({ itemId, notes });
          setNotes("");
        } else {
          await dismiss({ itemId, reason: notes });
          setNotes("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  };

  if (terminal) {
    return (
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="text-sm font-medium text-neutral-700">
          This item is {currentStatus}.
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Queue items are append-only — open a new item if further ops review is needed.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-3">
        <div className="text-sm font-medium text-foreground">Queue actions</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every action writes a row to the audit log with your identity and the
          previous state.
        </p>
      </div>
      <label
        htmlFor="queue-action-notes"
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Notes / reason
      </label>
      <textarea
        id="queue-action-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={2000}
        rows={4}
        placeholder="Required for resolve or dismiss. Plain text."
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
      />
      <div className="mt-1 text-right text-[11px] text-neutral-400">
        {notes.length} / 2000
      </div>
      {error ? (
        <div className="mt-3 rounded-md border border-error-500/40 bg-error-50 px-3 py-2 text-sm text-error-700">
          {error}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {currentStatus === "open" ? (
          <Button
            variant="outline"
            onClick={() => runAction("claim")}
            disabled={isPending}
          >
            Claim for review
          </Button>
        ) : null}
        <Button
          variant="outline"
          onClick={() => runAction("dismiss")}
          disabled={isPending || notes.trim().length === 0}
        >
          Dismiss
        </Button>
        <Button
          onClick={() => runAction("resolve")}
          disabled={isPending || notes.trim().length === 0}
        >
          Resolve
        </Button>
      </div>
    </div>
  );
}
