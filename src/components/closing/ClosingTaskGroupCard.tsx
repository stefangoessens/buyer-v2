"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClosingTaskRow } from "./ClosingTaskRow";
import { computeGroupProgress } from "@/lib/closing/commandCenterHelpers";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type CommandCenterTask = {
  _id: Id<"closeTasks">;
  _creationTime: number;
  dealRoomId: Id<"dealRooms">;
  title: string;
  description?: string;
  status:
    | "pending"
    | "in_progress"
    | "completed"
    | "blocked"
    | "canceled";
  tab?:
    | "title"
    | "financing"
    | "inspections"
    | "insurance"
    | "moving_in"
    | "addendums";
  groupKey?: string;
  groupTitle?: string;
  templateKey?: string;
  sortOrder?: number;
  dueDate?: string;
  manuallyOverriddenDueDate?: boolean;
  waitingOnRole?:
    | "buyer"
    | "broker"
    | "title_company"
    | "lender"
    | "inspector"
    | "insurance_agent"
    | "hoa"
    | "seller_side"
    | "moving_company"
    | "other";
  blockedCode?:
    | "awaiting_response"
    | "awaiting_document"
    | "awaiting_quote"
    | "awaiting_schedule"
    | "awaiting_signature"
    | "awaiting_payment"
    | "dependency"
    | "other";
  blockedTaskIds?: Array<Id<"closeTasks">>;
  dependsOn?: Array<Id<"closeTasks">>;
  ownerRole: string;
  visibility: "buyer_visible" | "internal_only";
};

interface ClosingTaskGroupCardProps {
  groupKey: string;
  groupTitle: string;
  tasks: ReadonlyArray<CommandCenterTask>;
  viewerLevel: "buyer" | "broker" | "admin";
  dealRoomId: Id<"dealRooms">;
}

export function ClosingTaskGroupCard({
  groupKey,
  groupTitle,
  tasks,
  viewerLevel,
  dealRoomId,
}: ClosingTaskGroupCardProps) {
  const progress = computeGroupProgress({
    groupKey,
    groupTitle,
    tasks: tasks.map((t) => ({
      _id: t._id,
      status: t.status,
      title: t.title,
      dueDate: t.dueDate,
    })),
  });
  const allDone = progress.total > 0 && progress.completed === progress.total;

  return (
    <Card className="rounded-4xl shadow-sm" data-testid={`closing-group-${groupKey}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {groupTitle}
        </h3>
        <span
          className={`text-xs font-medium tabular-nums ${
            allDone ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {progress.completed}/{progress.total} done
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-0">
        {tasks.map((task, idx) => (
          <ClosingTaskRow
            key={task._id}
            task={task as unknown as Doc<"closeTasks">}
            viewerLevel={viewerLevel}
            dealRoomId={dealRoomId}
            isLast={idx === tasks.length - 1}
          />
        ))}
      </CardContent>
    </Card>
  );
}
