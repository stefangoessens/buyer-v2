"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  findNextDueTask,
  shouldShowBlockedChip,
  type CommandCenterTabLike,
} from "@/lib/closing/commandCenterHelpers";

interface CommandCenterMilestone {
  _id: string;
  name: string;
  milestoneKey?: string;
  workstream: string;
  dueDate: string;
  status: string;
}

interface ClosingTopRailProps {
  propertyAddress?: string | null;
  dealStatus: string;
  tabs: ReadonlyArray<CommandCenterTabLike>;
  milestones: ReadonlyArray<CommandCenterMilestone>;
  percentComplete: number;
  blockedCount: number;
  overdueCount: number;
}

function formatStatusLabel(status: string): string {
  if (status === "under_contract") return "Under contract";
  if (status === "closing") return "Closing";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatIsoDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function resolveClosingDate(
  milestones: ReadonlyArray<CommandCenterMilestone>,
): string | null {
  const closing = milestones.find(
    (m) => m.workstream === "closing" && m.milestoneKey === "closing_date",
  );
  if (closing) return closing.dueDate;
  const anyClosing = milestones.find((m) => m.workstream === "closing");
  return anyClosing?.dueDate ?? null;
}

export function ClosingTopRail({
  propertyAddress,
  dealStatus,
  tabs,
  milestones,
  percentComplete,
  blockedCount,
  overdueCount,
}: ClosingTopRailProps) {
  const closingIso = resolveClosingDate(milestones);
  const nextDue = findNextDueTask(tabs);

  return (
    <Card className="rounded-4xl shadow-sm">
      <CardContent className="flex flex-col gap-6 p-6 md:p-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Closing command center
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground">
              {propertyAddress ?? "Your closing"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-medium">
                {formatStatusLabel(dealStatus)}
              </Badge>
              {closingIso && (
                <Badge variant="outline" className="font-medium">
                  Close: {formatIsoDate(closingIso)}
                </Badge>
              )}
              {shouldShowBlockedChip(blockedCount) && (
                <Badge
                  variant="outline"
                  className="border-destructive/40 bg-destructive/10 text-destructive"
                >
                  {blockedCount} blocked
                </Badge>
              )}
              {overdueCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-destructive/40 bg-destructive/10 text-destructive"
                >
                  {overdueCount} overdue
                </Badge>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Progress
            </p>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold text-foreground">
                {percentComplete}%
              </span>
            </div>
            <div
              className="h-2 w-40 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={percentComplete}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.max(0, percentComplete))}%` }}
              />
            </div>
          </div>
        </div>

        {nextDue && (
          <div className="flex flex-col gap-1 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Next up
              </p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {nextDue.title}
              </p>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground md:text-sm">
              Due {formatIsoDate(nextDue.dueDate)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
