/**
 * Deadline sync helpers for the closing command center (KIN-1080).
 *
 * Pure TS. Given a set of closing tasks and the current milestone /
 * closing-date context, compute which tasks should have their due dates
 * refreshed — and which ones the user has locked via a manual edit.
 *
 * The Convex internal mutation `syncClosingTaskDeadlinesFromMilestones`
 * uses these helpers so the Convex DB logic stays thin and the math stays
 * testable.
 */

import {
  DEFAULT_TEMPLATES,
  resolveTaskDueDate,
  type ClosingTaskTemplate,
  type TemplateContext,
  type TemplateMilestoneRef,
} from "./taskTemplates";

export interface SyncCloseTaskRow {
  _id: string;
  templateKey?: string;
  dueDate?: number | null;
  manuallyOverriddenDueDate?: boolean;
}

const TEMPLATES_BY_KEY: Record<string, ClosingTaskTemplate> = Object.freeze(
  DEFAULT_TEMPLATES.reduce<Record<string, ClosingTaskTemplate>>((acc, t) => {
    acc[t.templateKey] = t;
    return acc;
  }, {}),
);

/**
 * True when the task's due date should be rewritten to match the
 * freshly-computed value. False when the task was manually overridden
 * (we never clobber manual edits), when the task has no templateKey
 * (nothing to resync against), or when the computed date already
 * matches the stored one.
 */
export function shouldResyncTask(
  task: SyncCloseTaskRow,
  computedDueDate: number | null,
): boolean {
  if (task.manuallyOverriddenDueDate) return false;
  if (!task.templateKey) return false;
  const current = task.dueDate ?? null;
  return current !== computedDueDate;
}

/**
 * Compute a map of taskId → new due date for every task whose
 * template-driven due date has changed. Tasks not present in the map
 * should be left alone.
 *
 * Tasks whose milestone reference is missing receive a null entry —
 * callers can use that to clear a stale date.
 */
export function computeResyncedTaskDueDates(
  tasks: readonly SyncCloseTaskRow[],
  milestonesByKey: Record<string, TemplateMilestoneRef>,
  closingDate: number | null,
): Map<string, number | null> {
  const ctx: TemplateContext = {
    milestonesByKey,
    closingDate: closingDate ?? undefined,
  };
  const result = new Map<string, number | null>();
  for (const task of tasks) {
    if (!task.templateKey) continue;
    const template = TEMPLATES_BY_KEY[task.templateKey];
    if (!template) continue;
    const computed = resolveTaskDueDate(template, ctx);
    if (shouldResyncTask(task, computed)) {
      result.set(task._id, computed);
    }
  }
  return result;
}

/**
 * Convenience: look up a template by key. Used by the Convex seed
 * mutation to validate that a template still exists before reseeding.
 */
export function getTemplateByKey(
  templateKey: string,
): ClosingTaskTemplate | undefined {
  return TEMPLATES_BY_KEY[templateKey];
}
