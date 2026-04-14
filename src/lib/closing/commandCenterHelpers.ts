/**
 * Pure helpers for the closing command center UI (KIN-1080).
 *
 * Derivations that don't depend on React or Convex so they can be unit
 * tested in isolation. The UI components consume these via imports and
 * pass in data shapes that mirror the closingCommandCenter query
 * payload.
 */

import type { ClosingTab } from "./taskTemplates";

export type CommandCenterTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "canceled";

export interface CommandCenterTaskLike {
  _id: string;
  status: CommandCenterTaskStatus;
  dueDate?: string;
  title: string;
  blockedCode?: string;
}

export interface CommandCenterGroupLike {
  groupKey: string;
  groupTitle: string;
  tasks: ReadonlyArray<CommandCenterTaskLike>;
}

export interface CommandCenterTabLike {
  tab: ClosingTab;
  label: string;
  groups: ReadonlyArray<CommandCenterGroupLike>;
  counts: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    blocked: number;
    canceled: number;
  };
}

export interface GroupProgress {
  total: number;
  completed: number;
}

/** Count completed + total for a single group of tasks. */
export function computeGroupProgress(
  group: CommandCenterGroupLike,
): GroupProgress {
  let completed = 0;
  for (const task of group.tasks) {
    if (task.status === "completed") completed++;
  }
  return { total: group.tasks.length, completed };
}

/**
 * Whether the Title-tab wire-fraud banner should render. Isolated as a
 * helper so future logic (e.g. dismiss state, tab checks) stays
 * testable.
 */
export function shouldShowWireFraudBanner(activeTab: ClosingTab): boolean {
  return activeTab === "title";
}

/** Blocked chip is only shown when at least one task is blocked. */
export function shouldShowBlockedChip(blockedCount: number): boolean {
  return blockedCount > 0;
}

export interface NextDueSummary {
  title: string;
  dueDate: string;
}

/**
 * Find the next uncompleted/uncanceled task across all tabs, ordered
 * by earliest ISO dueDate. Tasks without a dueDate are ignored. Ties
 * break on task title.
 */
export function findNextDueTask(
  tabs: ReadonlyArray<CommandCenterTabLike>,
): NextDueSummary | null {
  let best: NextDueSummary | null = null;
  for (const tab of tabs) {
    for (const group of tab.groups) {
      for (const task of group.tasks) {
        if (task.status === "completed" || task.status === "canceled") continue;
        if (!task.dueDate) continue;
        if (
          !best ||
          task.dueDate < best.dueDate ||
          (task.dueDate === best.dueDate && task.title < best.title)
        ) {
          best = { title: task.title, dueDate: task.dueDate };
        }
      }
    }
  }
  return best;
}

/**
 * Count tasks in the active tab whose status is "blocked". Used by the
 * top rail chip when the tab view is scoped.
 */
export function countBlockedInTab(tab: CommandCenterTabLike): number {
  return tab.counts.blocked;
}

/**
 * Parse the URL-query-param `tab` value into a ClosingTab or null.
 * Any non-matching string falls back to null so the caller can default
 * to the first tab.
 */
export function parseTabFromQuery(
  value: string | null | undefined,
  validTabs: ReadonlyArray<ClosingTab>,
): ClosingTab | null {
  if (!value) return null;
  return (validTabs as ReadonlyArray<string>).includes(value)
    ? (value as ClosingTab)
    : null;
}
