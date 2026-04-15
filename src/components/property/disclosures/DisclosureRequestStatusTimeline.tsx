"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  Clock01Icon,
  Mail01Icon,
  TickDouble02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export type DisclosureRequestTimelineStage =
  | "sent"
  | "opened"
  | "replied"
  | "follow_up_needed";

interface DisclosureRequestStatusTimelineProps {
  stage: DisclosureRequestTimelineStage;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
}

interface StageDef {
  key: "sent" | "opened" | "replied";
  title: string;
  doneSubtitle: string;
  waitingSubtitle: string;
}

const STAGES: readonly StageDef[] = [
  {
    key: "sent",
    title: "Request sent",
    doneSubtitle: "Listing agent has been asked",
    waitingSubtitle: "Listing agent has been asked",
  },
  {
    key: "opened",
    title: "Agent opened it",
    doneSubtitle: "Agent has seen our email",
    waitingSubtitle: "Waiting for open",
  },
  {
    key: "replied",
    title: "Reply received",
    doneSubtitle: "Reply received",
    waitingSubtitle: "We'll follow up in 48h",
  },
];

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function computeState(
  stage: DisclosureRequestTimelineStage,
): Record<StageDef["key"], "done" | "active" | "future"> {
  switch (stage) {
    case "sent":
      return { sent: "done", opened: "active", replied: "future" };
    case "opened":
      return { sent: "done", opened: "done", replied: "active" };
    case "replied":
      return { sent: "done", opened: "done", replied: "done" };
    case "follow_up_needed":
      return { sent: "done", opened: "active", replied: "future" };
    default:
      return { sent: "future", opened: "future", replied: "future" };
  }
}

export function DisclosureRequestStatusTimeline({
  stage,
  sentAt,
  openedAt,
  repliedAt,
}: DisclosureRequestStatusTimelineProps) {
  const state = computeState(stage);
  const timestamps: Record<StageDef["key"], string | null> = {
    sent: formatRelative(sentAt),
    opened: formatRelative(openedAt),
    replied: formatRelative(repliedAt),
  };
  const followUpOverdue = stage === "follow_up_needed";

  return (
    <div
      role="list"
      aria-label="Disclosure request progress"
      className="rounded-3xl border border-border bg-card p-6"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-4">
        {STAGES.map((s, index) => {
          const status = state[s.key];
          const isDone = status === "done";
          const isActive = status === "active";
          const ts = timestamps[s.key];
          const showConnector = index < STAGES.length - 1;
          const nextDone =
            showConnector && state[STAGES[index + 1].key] !== "future";
          const subtitle =
            isDone && ts
              ? s.doneSubtitle
              : isActive && s.key === "replied" && followUpOverdue
                ? "Needs follow-up — send a nudge"
                : isActive
                  ? s.waitingSubtitle
                  : s.waitingSubtitle;
          const StageIcon =
            s.key === "sent"
              ? Mail01Icon
              : s.key === "opened"
                ? Clock01Icon
                : TickDouble02Icon;

          return (
            <div
              key={s.key}
              role="listitem"
              className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:text-center"
            >
              <div className="flex flex-row items-center gap-3 sm:w-full sm:flex-col sm:gap-3">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isDone &&
                      "border-primary bg-primary text-primary-foreground",
                    isActive &&
                      !followUpOverdue &&
                      "border-primary bg-primary/10 text-primary ring-4 ring-primary/15",
                    isActive &&
                      followUpOverdue &&
                      "border-destructive bg-destructive/10 text-destructive ring-4 ring-destructive/15",
                    status === "future" &&
                      "border-border bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {isDone ? (
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      size={20}
                      strokeWidth={2}
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={StageIcon}
                      size={18}
                      strokeWidth={2}
                    />
                  )}
                </div>
                {showConnector && (
                  <div
                    className={cn(
                      "hidden h-px flex-1 sm:block",
                      nextDone ? "bg-primary" : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col sm:mt-2 sm:flex-none">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    isDone || isActive
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {s.title}
                </p>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
                {isDone && ts && (
                  <p className="mt-1 text-xs font-medium text-primary">{ts}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
