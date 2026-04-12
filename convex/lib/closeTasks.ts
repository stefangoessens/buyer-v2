/**
 * Close task state helpers (KIN-847).
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
