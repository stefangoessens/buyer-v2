"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreVerticalIcon,
  Attachment01Icon,
  CommentAdd01Icon,
  Calendar01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trackClosingEvent } from "@/lib/analytics/closing-events";
import { ClosingTaskDocuments } from "./ClosingTaskDocuments";
import { ClosingTaskNotes } from "./ClosingTaskNotes";

interface ClosingTaskRowProps {
  task: Doc<"closeTasks">;
  viewerLevel: "buyer" | "broker" | "admin";
  dealRoomId: Id<"dealRooms">;
  isLast?: boolean;
}

const WAITING_ON_LABELS: Record<string, string> = {
  buyer: "buyer",
  broker: "broker",
  title_company: "title company",
  lender: "lender",
  inspector: "inspector",
  insurance_agent: "insurance agent",
  hoa: "HOA",
  seller_side: "seller side",
  moving_company: "moving company",
  other: "other",
};

const BLOCKED_LABELS: Record<string, string> = {
  awaiting_response: "Awaiting response",
  awaiting_document: "Awaiting document",
  awaiting_quote: "Awaiting quote",
  awaiting_schedule: "Awaiting schedule",
  awaiting_signature: "Awaiting signature",
  awaiting_payment: "Awaiting payment",
  dependency: "Waiting on dependency",
  other: "Blocked",
};

function formatIsoDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ClosingTaskRow({
  task,
  viewerLevel,
  dealRoomId,
  isLast,
}: ClosingTaskRowProps) {
  const transition = useMutation(api.closeTasks.transitionStatus);
  const setManualDueDate = useMutation(
    api.closingCommandCenter.setManualDueDate,
  );

  const [detailOpen, setDetailOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [pendingDueDate, setPendingDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const completed = task.status === "completed";
  const isStaff = viewerLevel === "broker" || viewerLevel === "admin";
  const buyerOwnsTask =
    task.ownerRole === "buyer" && task.visibility === "buyer_visible";
  const canToggle = isStaff || (viewerLevel === "buyer" && buyerOwnsTask);
  const canEdit = isStaff;

  const handleToggle = async (nextChecked: boolean) => {
    if (!canToggle || submitting) return;
    setSubmitting(true);
    try {
      await transition({
        taskId: task._id,
        newStatus: nextChecked ? "completed" : "pending",
      });
      trackClosingEvent("TASK_STATUS_CHANGED", {
        taskId: task._id,
        dealRoomId,
        newStatus: nextChecked ? "completed" : "pending",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveManualDueDate = async () => {
    if (!pendingDueDate) return;
    const ms = Date.parse(pendingDueDate);
    if (Number.isNaN(ms)) return;
    await setManualDueDate({ taskId: task._id, dueDate: ms });
    setDueDateOpen(false);
    setPendingDueDate("");
  };

  return (
    <>
      <div
        className={cn(
          "group flex items-start gap-3 py-3",
          !isLast && "border-b border-border",
        )}
        data-testid={`closing-task-row-${task._id}`}
      >
        <div className="flex items-center pt-0.5">
          <Checkbox
            checked={completed}
            disabled={!canToggle || submitting}
            onCheckedChange={(value) => handleToggle(value === true)}
            aria-label={`Mark "${task.title}" as ${completed ? "not complete" : "complete"}`}
          />
        </div>

        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="flex-1 min-w-0 text-left focus-visible:outline-none"
        >
          <p
            className={cn(
              "truncate text-sm font-medium",
              completed
                ? "text-muted-foreground line-through"
                : "text-foreground",
            )}
          >
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {task.dueDate && (
              <Badge
                variant="outline"
                className="gap-1 font-medium text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={Calendar01Icon}
                  size={12}
                  strokeWidth={2}
                />
                {formatIsoDate(task.dueDate)}
                {task.manuallyOverriddenDueDate && (
                  <span className="ml-0.5 text-[10px] uppercase tracking-wide">
                    manual
                  </span>
                )}
              </Badge>
            )}
            {task.waitingOnRole && task.status !== "completed" && (
              <Badge variant="secondary" className="font-medium">
                Waiting on {WAITING_ON_LABELS[task.waitingOnRole] ?? task.waitingOnRole}
              </Badge>
            )}
            {task.status === "blocked" && task.blockedCode && (
              <Badge
                variant="outline"
                className="gap-1 border-destructive/40 bg-destructive/10 font-medium text-destructive"
              >
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  size={12}
                  strokeWidth={2}
                />
                {BLOCKED_LABELS[task.blockedCode] ?? "Blocked"}
              </Badge>
            )}
            {task.category && (
              <Badge variant="outline" className="text-muted-foreground">
                {task.category}
              </Badge>
            )}
          </div>
        </button>

        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Task actions"
            onClick={() => setKebabOpen(true)}
            className="text-muted-foreground"
          >
            <HugeiconsIcon
              icon={MoreVerticalIcon}
              size={18}
              strokeWidth={2}
            />
          </Button>
        </div>
      </div>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="right"
          className="w-full max-w-lg overflow-y-auto px-6 pb-8"
        >
          <SheetHeader className="px-0">
            <SheetTitle>{task.title}</SheetTitle>
            {task.description && (
              <SheetDescription className="leading-relaxed">
                {task.description}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Documents
              </h4>
              <ClosingTaskDocuments
                taskId={task._id}
                viewerLevel={viewerLevel}
                dealRoomId={dealRoomId}
              />
            </section>
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </h4>
              <ClosingTaskNotes
                taskId={task._id}
                viewerLevel={viewerLevel}
                dealRoomId={dealRoomId}
              />
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={kebabOpen} onOpenChange={setKebabOpen}>
        <DialogContent className="rounded-4xl">
          <DialogHeader>
            <DialogTitle>Task actions</DialogTitle>
            <DialogDescription>
              {canEdit
                ? "Manage this closing task."
                : "You can view documents and notes. Ask your broker for edits."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setKebabOpen(false);
                setDetailOpen(true);
              }}
            >
              <HugeiconsIcon
                icon={Attachment01Icon}
                size={16}
                strokeWidth={2}
              />
              View documents &amp; notes
            </Button>
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => {
                  setKebabOpen(false);
                  setDueDateOpen(true);
                }}
              >
                <HugeiconsIcon
                  icon={Calendar01Icon}
                  size={16}
                  strokeWidth={2}
                />
                Set manual due date
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => {
                  setKebabOpen(false);
                  setDetailOpen(true);
                }}
              >
                <HugeiconsIcon
                  icon={CommentAdd01Icon}
                  size={16}
                  strokeWidth={2}
                />
                Add note
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dueDateOpen} onOpenChange={setDueDateOpen}>
        <DialogContent className="rounded-4xl">
          <DialogHeader>
            <DialogTitle>Set manual due date</DialogTitle>
            <DialogDescription>
              Manual dates override automatic milestone sync. The task stays
              pinned even if the contract amends.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="date"
            value={pendingDueDate}
            onChange={(e) => setPendingDueDate(e.target.value)}
            aria-label="Manual due date"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDueDateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveManualDueDate}
              disabled={!pendingDueDate}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
