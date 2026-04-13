import { normalizeWindow } from "@/lib/scheduling/windows";

export interface RequestedAvailabilityWindow {
  startAt: string;
  endAt: string;
  timezone: string;
}

export interface NormalizedAvailabilityWindow {
  startUtc: string;
  endUtc: string;
  durationMs: number;
}

export interface SchedulingConstraints {
  minimumNoticeMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  maximumDurationMinutes?: number;
}

export interface AvailabilityWindowState {
  requestedWindow: RequestedAvailabilityWindow;
  normalizedWindow: NormalizedAvailabilityWindow;
  constraints?: SchedulingConstraints;
}

export interface AvailabilityWindowPatch {
  startAt?: string;
  endAt?: string;
  timezone?: string;
  constraints?: SchedulingConstraints;
}

export interface AvailabilityValidationError {
  code: "invalid_window" | "invalid_constraint";
  message: string;
}

export type AvailabilityStateResult =
  | { valid: true; state: AvailabilityWindowState }
  | { valid: false; errors: AvailabilityValidationError[] };

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function sanitizeConstraints(
  constraints?: SchedulingConstraints,
): SchedulingConstraints | undefined {
  if (!constraints) return undefined;

  const next: SchedulingConstraints = {};
  if (constraints.minimumNoticeMinutes !== undefined) {
    next.minimumNoticeMinutes = constraints.minimumNoticeMinutes;
  }
  if (constraints.bufferBeforeMinutes !== undefined) {
    next.bufferBeforeMinutes = constraints.bufferBeforeMinutes;
  }
  if (constraints.bufferAfterMinutes !== undefined) {
    next.bufferAfterMinutes = constraints.bufferAfterMinutes;
  }
  if (constraints.maximumDurationMinutes !== undefined) {
    next.maximumDurationMinutes = constraints.maximumDurationMinutes;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function validateConstraints(
  constraints: SchedulingConstraints | undefined,
  durationMs: number,
): AvailabilityValidationError[] {
  if (!constraints) return [];

  const errors: AvailabilityValidationError[] = [];
  const numericEntries = [
    ["minimumNoticeMinutes", constraints.minimumNoticeMinutes],
    ["bufferBeforeMinutes", constraints.bufferBeforeMinutes],
    ["bufferAfterMinutes", constraints.bufferAfterMinutes],
    ["maximumDurationMinutes", constraints.maximumDurationMinutes],
  ] as const;

  for (const [field, value] of numericEntries) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      errors.push({
        code: "invalid_constraint",
        message: `${field} must be a non-negative integer`,
      });
    }
  }

  if (
    constraints.maximumDurationMinutes !== undefined &&
    durationMs > constraints.maximumDurationMinutes * 60_000
  ) {
    errors.push({
      code: "invalid_constraint",
      message:
        "maximumDurationMinutes cannot be shorter than the requested window duration",
    });
  }

  return errors;
}

export function buildAvailabilityWindowState(
  requestedWindow: RequestedAvailabilityWindow,
  constraints?: SchedulingConstraints,
): AvailabilityStateResult {
  const normalized = normalizeWindow(
    requestedWindow.startAt,
    requestedWindow.endAt,
    requestedWindow.timezone,
  );

  if (!normalized.valid) {
    return {
      valid: false,
      errors: normalized.errors.map((error) => ({
        code: "invalid_window" as const,
        message: error.message,
      })),
    };
  }

  const sanitizedConstraints = sanitizeConstraints(constraints);
  const constraintErrors = validateConstraints(
    sanitizedConstraints,
    normalized.normalized.durationMs,
  );

  if (constraintErrors.length > 0) {
    return { valid: false, errors: constraintErrors };
  }

  return {
    valid: true,
    state: {
      requestedWindow,
      normalizedWindow: {
        startUtc: normalized.normalized.startUtc,
        endUtc: normalized.normalized.endUtc,
        durationMs: normalized.normalized.durationMs,
      },
      constraints: sanitizedConstraints,
    },
  };
}

export function applyAvailabilityWindowPatch(
  existing: AvailabilityWindowState,
  patch: AvailabilityWindowPatch,
): AvailabilityStateResult {
  return buildAvailabilityWindowState(
    {
      startAt: patch.startAt ?? existing.requestedWindow.startAt,
      endAt: patch.endAt ?? existing.requestedWindow.endAt,
      timezone: patch.timezone ?? existing.requestedWindow.timezone,
    },
    patch.constraints === undefined ? existing.constraints : patch.constraints,
  );
}

export function hasSchedulingConstraints(
  state: AvailabilityWindowState,
): boolean {
  return Object.values(state.constraints ?? {}).some(isDefined);
}
