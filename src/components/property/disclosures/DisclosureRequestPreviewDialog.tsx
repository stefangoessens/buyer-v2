"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mail01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/lib/analytics";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const PERSONAL_NOTE_LIMIT = 500;

const EMAIL_SUBJECT = "Seller disclosure packet request";

const EMAIL_BODY_TEMPLATE = `Hello,

I'm reaching out on behalf of a buyer who is preparing an offer on the listing. To help them move quickly, could you please share the most recent seller disclosure packet — including the Seller's Property Disclosure, any HOA / condo documents, and any known inspection reports?

We'll review the packet carefully and follow up with any questions before drafting an offer. As a courtesy, we'll let you know when the buyer is ready to proceed.

Thank you in advance — we appreciate your help in keeping this smooth for everyone.

Best,
buyer-v2 Brokerage`;

interface DisclosureRequestPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealRoomId: Id<"dealRooms">;
  featureEnabled: boolean;
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (ev: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(ev.matches);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

const TITLE_ID = "disclosure-request-preview-title";
const DESCRIPTION_ID = "disclosure-request-preview-description";

export function DisclosureRequestPreviewDialog({
  open,
  onOpenChange,
  dealRoomId,
  featureEnabled,
}: DisclosureRequestPreviewDialogProps) {
  const isDesktop = useIsDesktop();
  const [personalNote, setPersonalNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requestFromListingAgent = useMutation(
    api.disclosures.requestFromListingAgent,
  );

  useEffect(() => {
    if (!open) {
      setPersonalNote("");
      setSubmitting(false);
      return;
    }
    track("disclosure_request_preview_opened", { dealRoomId });
  }, [open, dealRoomId]);

  const trimmedNote = personalNote.trim();
  const remaining = PERSONAL_NOTE_LIMIT - personalNote.length;
  const overLimit = remaining < 0;

  const composedBody = useMemo(() => {
    if (!trimmedNote) return EMAIL_BODY_TEMPLATE;
    return `${EMAIL_BODY_TEMPLATE}\n\n---\n\n${trimmedNote}`;
  }, [trimmedNote]);

  const handleSend = useCallback(async () => {
    if (!featureEnabled || submitting || overLimit) return;
    setSubmitting(true);
    try {
      await requestFromListingAgent({
        dealRoomId,
        personalNote: trimmedNote.length > 0 ? trimmedNote : undefined,
      });
      track("disclosure_request_sent", {
        dealRoomId,
        hasPersonalNote: trimmedNote.length > 0,
      });
      toast.success(
        "Request sent to listing agent — we'll notify you on reply.",
      );
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't send the request. Try again in a moment.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    featureEnabled,
    submitting,
    overLimit,
    requestFromListingAgent,
    dealRoomId,
    trimmedNote,
    onOpenChange,
  ]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const sendDisabled = !featureEnabled || submitting || overLimit;

  const body = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Preview email
        </p>
        <h2
          id={TITLE_ID}
          className="font-heading text-xl font-semibold text-foreground sm:text-2xl"
        >
          We'll ask the listing agent for the disclosure packet
        </h2>
        <p id={DESCRIPTION_ID} className="text-sm text-muted-foreground">
          Review exactly what we'll send on your behalf. Add a short personal
          note if you'd like to mention something specific.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-border bg-muted/40 p-5">
        <div className="flex items-start gap-3 border-b border-border/80 pb-3">
          <span
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <HugeiconsIcon icon={Mail01Icon} size={16} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Subject
            </p>
            <p className="text-sm font-semibold text-foreground">
              {EMAIL_SUBJECT}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Broker template
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {EMAIL_BODY_TEMPLATE}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="disclosure-request-personal-note"
            className="text-sm font-medium text-foreground"
          >
            Personal note{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <span
            className={
              overLimit
                ? "text-xs font-medium text-destructive"
                : "text-xs text-muted-foreground"
            }
            aria-live="polite"
          >
            {remaining} left
          </span>
        </div>
        <Textarea
          id="disclosure-request-personal-note"
          value={personalNote}
          onChange={(e) => setPersonalNote(e.target.value)}
          placeholder="e.g. We're pre-approved and hoping to tour this weekend — let us know if a tour slot opens up."
          rows={4}
          aria-invalid={overLimit || undefined}
          aria-describedby="disclosure-request-personal-note-hint"
        />
        <p
          id="disclosure-request-personal-note-hint"
          className="text-xs text-muted-foreground"
        >
          Kept to 500 characters so the email stays focused.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Final preview — what the listing agent sees
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {composedBody}
        </p>
      </div>

      {!featureEnabled && (
        <p
          className="rounded-2xl border border-border bg-muted px-4 py-3 text-xs text-muted-foreground"
          role="status"
        >
          Disabled — request rail not yet enabled.
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={handleCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={handleSend}
          disabled={sendDisabled}
          aria-disabled={sendDisabled || undefined}
          className="gap-2"
        >
          <HugeiconsIcon icon={Mail01Icon} size={18} strokeWidth={2} />
          {submitting ? "Sending…" : "Send request"}
        </Button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
          aria-labelledby={TITLE_ID}
          aria-describedby={DESCRIPTION_ID}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Preview disclosure request email</DialogTitle>
            <DialogDescription>
              Review the email we'll send to the listing agent and optionally
              add a personal note before sending.
            </DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl p-0"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESCRIPTION_ID}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Preview disclosure request email</SheetTitle>
          <SheetDescription>
            Review the email we'll send to the listing agent and optionally add
            a personal note before sending.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 py-8">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
