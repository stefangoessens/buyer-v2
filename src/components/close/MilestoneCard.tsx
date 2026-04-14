// Close dashboard milestone card with urgency pill, workstream badge, and party chip.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type {
  CloseDashboardMilestone,
  Urgency,
} from "@/lib/dealroom/close-dashboard-types";
import { WORKSTREAM_LABELS } from "@/lib/dealroom/close-dashboard-types";
import { cn } from "@/lib/utils";

interface MilestoneCardProps {
  milestone: CloseDashboardMilestone;
  emphasize?: boolean;
}

const urgencyStyles: Record<Urgency, { label: string; className: string }> = {
  overdue: {
    label: "Overdue",
    className: "border-error-200 bg-error-50 text-error-700",
  },
  this_week: {
    label: "This week",
    className: "border-warning-200 bg-warning-50 text-warning-700",
  },
  next_week: {
    label: "Next week",
    className: "border-primary-200 bg-primary-50 text-primary-700",
  },
  later: {
    label: "Later",
    className: "border-border bg-muted text-muted-foreground",
  },
  completed: {
    label: "Completed",
    className: "border-success-200 bg-success-50 text-success-700",
  },
};

const partyLabels: Record<CloseDashboardMilestone["responsibleParty"], string> = {
  buyer: "You",
  seller: "Seller",
  lender: "Lender",
  broker: "Broker",
  title_company: "Title co.",
  inspector: "Inspector",
  hoa: "HOA",
  unknown: "TBD",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function formatDue(milestone: CloseDashboardMilestone): string {
  if (milestone.status === "completed") {
    return milestone.completedAt
      ? `Completed ${dateFormatter.format(new Date(milestone.completedAt))}`
      : "Completed";
  }
  const parsed = new Date(`${milestone.dueDate}T00:00:00Z`);
  const dateText = Number.isNaN(parsed.getTime())
    ? milestone.dueDate
    : dateFormatter.format(parsed);
  if (milestone.daysUntilDue < 0) {
    const d = Math.abs(milestone.daysUntilDue);
    return `${dateText} · ${d} day${d === 1 ? "" : "s"} overdue`;
  }
  if (milestone.daysUntilDue === 0) return `${dateText} · today`;
  return `${dateText} · in ${milestone.daysUntilDue} day${milestone.daysUntilDue === 1 ? "" : "s"}`;
}

export function MilestoneCard({ milestone, emphasize }: MilestoneCardProps) {
  const urgency = urgencyStyles[milestone.urgency];
  return (
    <Card
      className={cn(
        "border transition-all",
        emphasize
          ? "border-primary-300 shadow-md"
          : "border-border hover:border-neutral-300",
      )}
    >
      <CardContent className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {milestone.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDue(milestone)}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn("font-medium", urgency.className)}
          >
            {urgency.label}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-border bg-muted text-muted-foreground"
          >
            {WORKSTREAM_LABELS[milestone.workstream]}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "border-border",
              milestone.responsibleParty === "buyer"
                ? "bg-accent-50 text-accent-700"
                : "bg-white text-muted-foreground",
            )}
          >
            {partyLabels[milestone.responsibleParty]}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
