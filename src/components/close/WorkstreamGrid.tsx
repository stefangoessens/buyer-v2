// Workstream-grouped milestone breakdown for the close dashboard.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkstreamGroup } from "@/lib/dealroom/close-dashboard-types";
import { WORKSTREAM_LABELS } from "@/lib/dealroom/close-dashboard-types";
import { MilestoneCard } from "./MilestoneCard";

interface WorkstreamGridProps {
  groups: WorkstreamGroup[];
}

export function WorkstreamGrid({ groups }: WorkstreamGridProps) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-neutral-500">
          No milestones yet. They will appear here once your contract is
          extracted.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <Card key={group.workstream} className="border-neutral-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-neutral-900">
                {WORKSTREAM_LABELS[group.workstream]}
              </CardTitle>
              <div className="flex items-center gap-1.5">
                {group.overdueCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-error-200 bg-error-50 text-error-700"
                  >
                    {group.overdueCount} overdue
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className="border-neutral-200 bg-neutral-50 text-neutral-600"
                >
                  {group.completedCount}/{group.milestones.length} done
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {group.milestones.map((milestone) => (
              <MilestoneCard key={milestone.id} milestone={milestone} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
