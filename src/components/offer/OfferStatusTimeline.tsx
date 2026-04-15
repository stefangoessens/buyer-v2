// Horizontal 3-stage status timeline for the offer brokerage gate (KIN-1077).
"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export type OfferTimelineStage =
  | "requested"
  | "broker_spoke"
  | "agreement_signed"
  | "ready_to_submit";

interface OfferStatusTimelineProps {
  stage: OfferTimelineStage;
  brokerageCallRequestedAt: string | null;
  brokerageCallbackCompletedAt: string | null;
  agreementSignedAt: string | null;
}

interface StageDef {
  key: "requested" | "spoke" | "signed";
  title: string;
  subtitle: string;
}

const STAGES: readonly StageDef[] = [
  {
    key: "requested",
    title: "Callback requested",
    subtitle: "We'll call within 1 business hour",
  },
  {
    key: "spoke",
    title: "Broker spoke with you",
    subtitle: "Agreement in progress",
  },
  {
    key: "signed",
    title: "Agreement signed",
    subtitle: "Ready to submit",
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
  stage: OfferTimelineStage,
): Record<StageDef["key"], "done" | "active" | "future"> {
  switch (stage) {
    case "requested":
      return { requested: "active", spoke: "future", signed: "future" };
    case "broker_spoke":
      return { requested: "done", spoke: "active", signed: "future" };
    case "agreement_signed":
    case "ready_to_submit":
      return { requested: "done", spoke: "done", signed: "done" };
    default:
      return { requested: "future", spoke: "future", signed: "future" };
  }
}

export function OfferStatusTimeline({
  stage,
  brokerageCallRequestedAt,
  brokerageCallbackCompletedAt,
  agreementSignedAt,
}: OfferStatusTimelineProps) {
  const state = computeState(stage);
  const timestamps: Record<StageDef["key"], string | null> = {
    requested: formatRelative(brokerageCallRequestedAt),
    spoke: formatRelative(brokerageCallbackCompletedAt),
    signed: formatRelative(agreementSignedAt),
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-4">
        {STAGES.map((s, index) => {
          const status = state[s.key];
          const isDone = status === "done";
          const isActive = status === "active";
          const ts = timestamps[s.key];
          const showConnector = index < STAGES.length - 1;
          const nextDone =
            showConnector && state[STAGES[index + 1].key] !== "future";

          return (
            <div
              key={s.key}
              className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:text-center"
            >
              <div className="flex flex-row items-center gap-3 sm:w-full sm:flex-col sm:gap-3">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    isDone &&
                      "border-primary bg-primary text-primary-foreground",
                    isActive &&
                      "border-primary bg-primary/10 text-primary ring-4 ring-primary/15",
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
                    index + 1
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
                <p className="text-xs text-muted-foreground">{s.subtitle}</p>
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
