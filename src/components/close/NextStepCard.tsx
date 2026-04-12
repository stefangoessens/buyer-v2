// Hero "next step" card driven by close-dashboard-logic.buildNextStep.
import { Card, CardContent } from "@/components/ui/card";
import type { NextStepSummary } from "@/lib/dealroom/close-dashboard-types";
import { cn } from "@/lib/utils";

interface NextStepCardProps {
  summary: NextStepSummary;
  propertyAddress: string;
  daysToClose: number | null;
}

const urgencyClasses: Record<NextStepSummary["urgency"], string> = {
  overdue: "border-error-200 bg-error-50 text-error-700",
  this_week: "border-warning-200 bg-warning-50 text-warning-700",
  next_week: "border-primary-200 bg-primary-50 text-primary-700",
  later: "border-neutral-200 bg-neutral-50 text-neutral-600",
  completed: "border-success-200 bg-success-50 text-success-700",
};

export function NextStepCard({
  summary,
  propertyAddress,
  daysToClose,
}: NextStepCardProps) {
  return (
    <Card className="border-neutral-200">
      <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Next step
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-neutral-900">
            {summary.headline}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-neutral-600">
            {summary.body}
          </p>
          {summary.action && (
            <p className="mt-3 text-sm font-medium text-primary-700">
              {summary.action}
              {summary.dueDate ? ` · ${summary.dueDate}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={cn(
              "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
              urgencyClasses[summary.urgency],
            )}
          >
            {summary.urgency.replace(/_/g, " ")}
          </span>
          {daysToClose !== null && (
            <div className="rounded-xl bg-neutral-50 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Days to close
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">
                {daysToClose}
              </p>
              <p className="mt-0.5 text-xs text-neutral-400 max-w-[160px] truncate">
                {propertyAddress}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
