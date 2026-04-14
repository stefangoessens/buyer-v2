"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { BrokerReviewBadge } from "@/components/offer/BrokerReviewBadge";
import type { BrokerReviewState } from "@/lib/dealroom/offer-cockpit-types";

export type ChatMessageRole = "user" | "assistant" | "system";

export interface PropertyAIChatMessageData {
  role: ChatMessageRole;
  content: string;
  brokerReviewState?: BrokerReviewState | "none";
  brokerReviewNote?: string | null;
  createdAt: string | number;
}

interface PropertyAIChatMessageProps {
  message: PropertyAIChatMessageData;
}

const RELATIVE_UNITS: Array<{ limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { limit: 60, divisor: 1, unit: "second" },
  { limit: 3600, divisor: 60, unit: "minute" },
  { limit: 86_400, divisor: 3600, unit: "hour" },
  { limit: 604_800, divisor: 86_400, unit: "day" },
  { limit: 2_629_800, divisor: 604_800, unit: "week" },
  { limit: 31_557_600, divisor: 2_629_800, unit: "month" },
];

function formatRelative(input: string | number): string {
  const ts = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(ts)) return "";
  const deltaSeconds = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const { limit, divisor, unit } of RELATIVE_UNITS) {
    if (abs < limit) {
      return formatter.format(Math.round(deltaSeconds / divisor), unit);
    }
  }
  return formatter.format(Math.round(deltaSeconds / 31_557_600), "year");
}

export function PropertyAIChatMessage({ message }: PropertyAIChatMessageProps) {
  const relative = useMemo(() => formatRelative(message.createdAt), [message.createdAt]);

  if (message.role === "system") {
    return (
      <div className="w-full rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        {relative ? <p className="mt-1 text-[10px] uppercase tracking-wide">{relative}</p> : null}
      </div>
    );
  }

  const isUser = message.role === "user";
  const showBadge =
    message.role === "assistant" &&
    message.brokerReviewState &&
    message.brokerReviewState !== "none";

  return (
    <div className={cn("flex w-full flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
      {showBadge ? (
        <BrokerReviewBadge
          state={message.brokerReviewState as BrokerReviewState}
          note={message.brokerReviewNote ?? null}
        />
      ) : null}
      {relative ? (
        <span className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {relative}
        </span>
      ) : null}
    </div>
  );
}
