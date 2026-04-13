/**
 * Pure decision logic for weekend visitor pre-registration (KIN-824).
 *
 * Every function here is a pure function — no DB calls, no IO. This
 * lets the Convex mutation layer compose these helpers and the
 * Vitest suite exercise every branch without a live backend.
 */

import type {
  ConversionKind,
  DuplicateDecision,
  PreregistrationFormInput,
  PreregistrationStatus,
  PreregistrationValidation,
  PreregistrationValidationError,
  VisitorPreregistration,
} from "./types";

// MARK: - Form validation

/**
 * Validate + normalize a raw form input. Returns a discriminated
 * union that the mutation layer exhaustively handles.
 *
 * Normalization:
 *   - visitorName: trim whitespace
 *   - visitorEmail: trim + lowercase
 *   - visitorPhone: trim (empty → undefined)
 *   - visitorNote: trim (empty → undefined)
 *   - propertyId: trim
 *   - partySize: integer coerced from the input
 */
export function validateAndNormalize(
  input: PreregistrationFormInput
): PreregistrationValidation {
  const errors: PreregistrationValidationError[] = [];

  const propertyId = (input.propertyId ?? "").trim();
  if (propertyId === "") {
    errors.push({ kind: "missingField", field: "propertyId" });
  }

  const visitorName = (input.visitorName ?? "").trim();
  if (visitorName === "") {
    errors.push({ kind: "missingField", field: "visitorName" });
  }

  const visitorEmail = (input.visitorEmail ?? "").trim().toLowerCase();
  if (visitorEmail === "") {
    errors.push({ kind: "missingField", field: "visitorEmail" });
  } else if (!EMAIL_REGEX.test(visitorEmail)) {
    errors.push({
      kind: "invalidEmail",
      field: "visitorEmail",
      value: visitorEmail,
    });
  }

  if (typeof input.partySize !== "number" || !Number.isFinite(input.partySize)) {
    errors.push({
      kind: "invalidPartySize",
      min: 1,
      max: 10,
      actual: input.partySize as unknown as number,
    });
  } else if (input.partySize < 1 || input.partySize > 10) {
    errors.push({
      kind: "invalidPartySize",
      min: 1,
      max: 10,
      actual: input.partySize,
    });
  }

  const eventStartAt = (input.eventStartAt ?? "").trim();
  const eventEndAt = (input.eventEndAt ?? "").trim();
  if (eventStartAt === "") {
    errors.push({ kind: "missingField", field: "eventStartAt" });
  }
  if (eventEndAt === "") {
    errors.push({ kind: "missingField", field: "eventEndAt" });
  }
  if (
    eventStartAt !== "" &&
    eventEndAt !== "" &&
    eventStartAt >= eventEndAt
  ) {
    errors.push({
      kind: "invalidEventWindow",
      message: "eventStartAt must be strictly before eventEndAt",
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const visitorPhone = input.visitorPhone?.trim();
  const visitorNote = input.visitorNote?.trim();

  return {
    ok: true,
    normalized: {
      propertyId,
      eventStartAt,
      eventEndAt,
      visitorName,
      visitorEmail,
      visitorPhone: visitorPhone && visitorPhone.length > 0 ? visitorPhone : undefined,
      partySize: Math.floor(input.partySize),
      visitorNote: visitorNote && visitorNote.length > 0 ? visitorNote : undefined,
    },
  };
}

// Basic RFC-lite email check — good enough for form submission.
// Strict validation happens at the delivery layer.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// MARK: - Duplicate resolution

/**
 * Given the set of existing preregistrations for the same property
 * + event window + visitor email, decide how to handle an incoming
 * form submission.
 *
 * Match criteria:
 *   - same propertyId
 *   - overlapping event window (same eventStartAt + eventEndAt)
 *   - same normalized email
 *
 * Rules:
 *   1. If ANY match is in a terminal `converted` state → block and
 *      redirect to the follow-on state.
 *   2. If ANY match is `created` or `reminded` → update that record
 *      in place (carry forward the party size / note / phone).
 *   3. If only `canceled`, `noShow`, or `attended` matches exist →
 *      treat as a new registration (visitor may be attending a
 *      different event session).
 *   4. No match → new registration.
 */
export function resolveDuplicate(
  existing: readonly VisitorPreregistration[],
  input: PreregistrationFormInput
): DuplicateDecision {
  const candidates = existing.filter(
    (r) =>
      r.propertyId === input.propertyId &&
      r.eventStartAt === input.eventStartAt &&
      r.eventEndAt === input.eventEndAt &&
      r.visitorEmail === input.visitorEmail
  );

  if (candidates.length === 0) {
    return { kind: "newRegistration" };
  }

  // Rule 1 — blocked by conversion
  const converted = candidates.find((r) => r.status === "converted");
  if (converted && converted.conversion) {
    return {
      kind: "blockedByConversion",
      existingId: converted.id,
      conversionKind: converted.conversion.kind,
    };
  }

  // Rule 2 — update existing created/reminded
  const reusable = candidates.find(
    (r) => r.status === "created" || r.status === "reminded"
  );
  if (reusable) {
    return { kind: "updateExisting", existingId: reusable.id };
  }

  // Rule 3 — terminal states (canceled/noShow/attended) are not
  // reusable. Treat as a new registration.
  return { kind: "newRegistration" };
}

// MARK: - Status transitions

/**
 * Allowed status transitions. Returns true iff the transition is
 * valid. The mutation layer must check this before patching a
 * record — ad hoc transitions would invalidate the attendance /
 * conversion funnel analytics downstream.
 */
export function canTransition(
  from: PreregistrationStatus,
  to: PreregistrationStatus
): boolean {
  const allowed: Record<PreregistrationStatus, PreregistrationStatus[]> = {
    created: ["reminded", "attended", "noShow", "converted", "canceled"],
    reminded: ["attended", "noShow", "converted", "canceled"],
    attended: ["converted"], // an attendee can still convert later
    noShow: ["converted"], // a no-show can still convert later
    converted: [], // terminal
    canceled: [], // terminal
  };
  return allowed[from].includes(to);
}

/**
 * Compose a conversion record for the explicit transition into a
 * deeper representation state. Returns a new VisitorPreregistration
 * with status: "converted" and the conversion payload set. Throws
 * when the transition is not allowed — callers must guard with
 * `canTransition` first.
 */
export function applyConversion(
  record: VisitorPreregistration,
  conversion: {
    kind: ConversionKind;
    targetRefId: string;
    now: string;
  }
): VisitorPreregistration {
  if (!canTransition(record.status, "converted")) {
    throw new Error(
      `Cannot convert from status "${record.status}" — transition not allowed`
    );
  }
  return {
    ...record,
    status: "converted",
    conversion: {
      kind: conversion.kind,
      targetRefId: conversion.targetRefId,
      convertedAt: conversion.now,
    },
    updatedAt: conversion.now,
  };
}

// MARK: - Analytics projection

/**
 * Small pure projection of a preregistration list into the metrics
 * the ops dashboard needs. Exposed here so it's trivially testable
 * without a live Convex query.
 */
export interface PreregistrationMetrics {
  total: number;
  created: number;
  reminded: number;
  attended: number;
  noShow: number;
  converted: number;
  canceled: number;
  /** Conversion rate as a fraction 0..1 of (converted / total). */
  conversionRate: number;
  /** Attendance rate as a fraction 0..1 of (attended / (attended + noShow)). */
  attendanceRate: number;
}

export function computeMetrics(
  records: readonly VisitorPreregistration[]
): PreregistrationMetrics {
  const total = records.length;
  let created = 0;
  let reminded = 0;
  let attended = 0;
  let noShow = 0;
  let converted = 0;
  let canceled = 0;

  for (const r of records) {
    switch (r.status) {
      case "created":
        created++;
        break;
      case "reminded":
        reminded++;
        break;
      case "attended":
        attended++;
        break;
      case "noShow":
        noShow++;
        break;
      case "converted":
        converted++;
        break;
      case "canceled":
        canceled++;
        break;
    }
  }

  const attendanceDenominator = attended + noShow;
  return {
    total,
    created,
    reminded,
    attended,
    noShow,
    converted,
    canceled,
    conversionRate: total === 0 ? 0 : converted / total,
    attendanceRate:
      attendanceDenominator === 0 ? 0 : attended / attendanceDenominator,
  };
}
