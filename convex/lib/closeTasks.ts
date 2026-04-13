/**
 * Close task state helpers (KIN-867).
 *
 * Convex-side mirror of `src/lib/dealroom/close-tasks.ts`. Keep in sync.
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

export interface CreateCloseTaskInput {
  dealRoomId: string;
  contractId?: string;
  title: string;
  description?: string;
  category: CloseTaskCategory;
  visibility: CloseTaskVisibility;
  ownerRole: CloseTaskOwnerRole;
  ownerUserId?: string;
  ownerDisplayName?: string;
  dueDate?: string;
  internalNotes?: string;
}

export interface UpdateCloseTaskInput {
  title?: string;
  description?: string;
  dueDate?: string;
  ownerRole?: CloseTaskOwnerRole;
  ownerUserId?: string;
  ownerDisplayName?: string;
  internalNotes?: string;
}

export interface TransitionCloseTaskInput {
  newStatus: CloseTaskStatus;
  blockedReason?: string;
}

export interface CloseTaskPatchResult {
  changedFields: string[];
  patch: Partial<RawCloseTask>;
}

export const TERMINAL_STATUSES: readonly CloseTaskStatus[] = [
  "completed",
  "canceled",
];

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

export function validateTransition(
  from: CloseTaskStatus,
  to: CloseTaskStatus,
): TransitionResult {
  if (from === to) return { ok: true, from, to };
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

export function buildCreateCloseTask(
  input: CreateCloseTaskInput,
  now: string,
): Omit<RawCloseTask, "_id"> {
  return {
    dealRoomId: input.dealRoomId,
    contractId: input.contractId,
    title: input.title,
    description: input.description,
    category: input.category,
    status: "pending",
    visibility: input.visibility,
    ownerRole: input.ownerRole,
    ownerUserId: input.ownerUserId,
    ownerDisplayName: input.ownerDisplayName,
    dueDate: input.dueDate,
    internalNotes: input.internalNotes,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildCloseTaskUpdatePatch(
  task: RawCloseTask,
  input: UpdateCloseTaskInput,
  now: string,
): CloseTaskPatchResult {
  const changedFields: string[] = [];
  const patch: Partial<RawCloseTask> = {};

  if (input.title !== undefined && input.title !== task.title) {
    patch.title = input.title;
    changedFields.push("title");
  }
  if (
    input.description !== undefined &&
    input.description !== task.description
  ) {
    patch.description = input.description;
    changedFields.push("description");
  }
  if (input.dueDate !== undefined && input.dueDate !== task.dueDate) {
    patch.dueDate = input.dueDate;
    changedFields.push("dueDate");
  }
  if (input.ownerRole !== undefined && input.ownerRole !== task.ownerRole) {
    patch.ownerRole = input.ownerRole;
    changedFields.push("ownerRole");
  }
  if (
    input.ownerUserId !== undefined &&
    input.ownerUserId !== task.ownerUserId
  ) {
    patch.ownerUserId = input.ownerUserId;
    changedFields.push("ownerUserId");
  }
  if (
    input.ownerDisplayName !== undefined &&
    input.ownerDisplayName !== task.ownerDisplayName
  ) {
    patch.ownerDisplayName = input.ownerDisplayName;
    changedFields.push("ownerDisplayName");
  }
  if (
    input.internalNotes !== undefined &&
    input.internalNotes !== task.internalNotes
  ) {
    patch.internalNotes = input.internalNotes;
    changedFields.push("internalNotes");
  }

  if (changedFields.length > 0) {
    patch.updatedAt = now;
  }

  return { changedFields, patch };
}

export function buildCloseTaskTransitionPatch(
  task: RawCloseTask,
  input: TransitionCloseTaskInput,
  now: string,
): Partial<RawCloseTask> {
  const result = validateTransition(task.status, input.newStatus);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }

  const patch: Partial<RawCloseTask> = {
    status: input.newStatus,
    updatedAt: now,
  };

  if (input.newStatus === "completed" && task.status !== "completed") {
    patch.completedAt = now;
  }
  if (input.newStatus === "blocked") {
    patch.blockedReason = input.blockedReason;
  }
  if (task.status === "blocked" && input.newStatus !== "blocked") {
    patch.blockedReason = undefined;
  }

  return patch;
}
