/**
 * Close task state helpers (KIN-847).
 *
 * Pure TS — used by Convex backend and the deal-room close UI. Defines
 * the typed task shape, valid status transitions, and buyer-safe vs
 * internal projection.
 *
 * Status transitions: pending → in_progress → completed, with any
 * non-terminal → blocked or canceled as escape hatches. Completed and
 * canceled are terminal.
 */

export type CloseTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "canceled";

export type CloseTaskCategory =
  | "inspection"
  | "financing"
  | "title"
  | "insurance"
  | "appraisal"
  | "disclosure"
  | "walkthrough"
  | "other";

export type CloseTaskVisibility = "buyer_visible" | "internal_only";

export type CloseTaskOwnerRole =
  | "buyer"
  | "broker"
  | "lender"
  | "title_company"
  | "inspector"
  | "other";

/** Terminal statuses — a task in one of these states cannot transition further. */
export const TERMINAL_STATUSES: readonly CloseTaskStatus[] = [
  "completed",
  "canceled",
];

/** Valid transitions map. Any → blocked/canceled always allowed. */
export const VALID_TRANSITIONS: Readonly<Record<CloseTaskStatus, CloseTaskStatus[]>> = {
  pending: ["in_progress", "blocked", "canceled"],
  in_progress: ["completed", "blocked", "canceled"],
  blocked: ["pending", "in_progress", "canceled"],
  completed: [],
  canceled: [],
};

export type TransitionErrorCode = "invalid_transition" | "already_terminal";

export interface TransitionError {
  code: TransitionErrorCode;
  message: string;
}

export type TransitionResult =
  | { ok: true; from: CloseTaskStatus; to: CloseTaskStatus }
  | { ok: false; error: TransitionError };

/** Validate a status transition. Returns ok + from/to on success. */
export function validateTransition(
  from: CloseTaskStatus,
  to: CloseTaskStatus,
): TransitionResult {
  if (from === to) {
    return { ok: true, from, to };
  }
  if (TERMINAL_STATUSES.includes(from)) {
    return {
      ok: false,
      error: {
        code: "already_terminal",
        message: `Task is already in terminal state '${from}' and cannot transition.`,
      },
    };
  }
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: {
        code: "invalid_transition",
        message: `Invalid transition: ${from} → ${to}. Allowed: ${allowed.join(", ")}`,
      },
    };
  }
  return { ok: true, from, to };
}

// ───────────────────────────────────────────────────────────────────────────
// Read-model projection
// ───────────────────────────────────────────────────────────────────────────

export interface RawCloseTask {
  _id: string;
  dealRoomId: string;
  contractId?: string;
  title: string;
  description?: string;
  category: CloseTaskCategory;
  status: CloseTaskStatus;
  visibility: CloseTaskVisibility;
  ownerRole: CloseTaskOwnerRole;
  ownerUserId?: string;
  ownerDisplayName?: string;
  dueDate?: string;
  blockedReason?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface BuyerTaskRow {
  taskId: string;
  title: string;
  description: string | null;
  category: CloseTaskCategory;
  status: CloseTaskStatus;
  ownerRole: CloseTaskOwnerRole;
  ownerDisplayName: string | null;
  dueDate: string | null;
  completedAt: string | null;
  isOverdue: boolean;
}

export interface InternalTaskRow extends BuyerTaskRow {
  visibility: CloseTaskVisibility;
  blockedReason: string | null;
  internalNotes: string | null;
  ownerUserId: string | null;
  contractId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Project a raw close task into the buyer-safe row shape. Internal-only
 * fields are stripped here — the caller is responsible for only calling
 * this on tasks the buyer is allowed to see (filter by visibility first).
 */
export function projectBuyerRow(
  task: RawCloseTask,
  nowMs: number,
): BuyerTaskRow {
  return {
    taskId: task._id,
    title: task.title,
    description: task.description ?? null,
    category: task.category,
    status: task.status,
    ownerRole: task.ownerRole,
    ownerDisplayName: task.ownerDisplayName ?? null,
    dueDate: task.dueDate ?? null,
    completedAt: task.completedAt ?? null,
    isOverdue: computeIsOverdue(task, nowMs),
  };
}

/** Project a raw close task into the full internal row (broker/admin view). */
export function projectInternalRow(
  task: RawCloseTask,
  nowMs: number,
): InternalTaskRow {
  return {
    ...projectBuyerRow(task, nowMs),
    visibility: task.visibility,
    blockedReason: task.blockedReason ?? null,
    internalNotes: task.internalNotes ?? null,
    ownerUserId: task.ownerUserId ?? null,
    contractId: task.contractId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function computeIsOverdue(task: RawCloseTask, nowMs: number): boolean {
  if (!task.dueDate) return false;
  if (TERMINAL_STATUSES.includes(task.status)) return false;
  return new Date(task.dueDate).getTime() < nowMs;
}

// ───────────────────────────────────────────────────────────────────────────
// Filtering + sorting
// ───────────────────────────────────────────────────────────────────────────

/**
 * Filter a task list to only those visible to a buyer. Uses the
 * visibility flag — buyers see tasks marked "buyer_visible"; internal
 * staff see all.
 */
export function filterByVisibility(
  tasks: RawCloseTask[],
  role: "buyer" | "broker" | "admin",
): RawCloseTask[] {
  if (role === "buyer") {
    return tasks.filter((t) => t.visibility === "buyer_visible");
  }
  return tasks;
}

/**
 * Sort tasks for display: overdue first, then by due date ascending,
 * then by createdAt. Terminal tasks sort to the bottom.
 */
export function sortForDisplay(
  tasks: RawCloseTask[],
  nowMs: number,
): RawCloseTask[] {
  return tasks.slice().sort((a, b) => {
    const aTerminal = TERMINAL_STATUSES.includes(a.status);
    const bTerminal = TERMINAL_STATUSES.includes(b.status);
    if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;

    const aOverdue = computeIsOverdue(a, nowMs);
    const bOverdue = computeIsOverdue(b, nowMs);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    // Both terminal or both non-terminal, both overdue or both not.
    const aDue = a.dueDate
      ? new Date(a.dueDate).getTime()
      : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate
      ? new Date(b.dueDate).getTime()
      : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;

    return a.createdAt.localeCompare(b.createdAt);
  });
}
