/**
 * Internal notes helpers (KIN-808).
 *
 * Canonical visibility set, subject-type catalog, and pure validation
 * so the client and Convex mutations never drift. The server is the
 * final gate — these helpers are here to short-circuit bad input
 * before it hits the wire, and to give tests something to exercise.
 */

import type { InternalConsoleRole } from "./roles";

export const NOTE_VISIBILITIES = [
  "internal",
  "broker_only",
  "admin_only",
] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

export const NOTE_VISIBILITY_LABELS: Readonly<Record<NoteVisibility, string>> = {
  internal: "Internal (broker + admin)",
  broker_only: "Broker only",
  admin_only: "Admin only",
};

export const NOTE_VISIBILITY_DESCRIPTIONS: Readonly<Record<NoteVisibility, string>> = {
  internal: "Visible to every internal console user. Use for general ops context.",
  broker_only: "Broker + admin can see. Use when only licensed staff need the detail.",
  admin_only: "Admin only. Use for sensitive escalations, legal, or HR notes.",
};

/**
 * Subject types ops can attach notes to. Each entry maps to a canonical
 * Convex table name used by the intake forms so the backend can reject
 * anything that is not in this closed set.
 */
export const NOTE_SUBJECT_TYPES = [
  "dealRoom",
  "offer",
  "contract",
  "tour",
  "buyer",
  "property",
] as const;
export type NoteSubjectType = (typeof NOTE_SUBJECT_TYPES)[number];

export const NOTE_SUBJECT_LABELS: Readonly<Record<NoteSubjectType, string>> = {
  dealRoom: "Deal room",
  offer: "Offer",
  contract: "Contract",
  tour: "Tour",
  buyer: "Buyer",
  property: "Property",
};

export function isNoteVisibility(value: string): value is NoteVisibility {
  return (NOTE_VISIBILITIES as readonly string[]).includes(value);
}

export function isNoteSubjectType(value: string): value is NoteSubjectType {
  return (NOTE_SUBJECT_TYPES as readonly string[]).includes(value);
}

export const NOTE_BODY_MIN_CHARS = 1;
export const NOTE_BODY_MAX_CHARS = 5000;

/**
 * Validate a note body for length. Returns a result object so the UI
 * can render the error inline. Kept deliberately simple — the backend
 * re-runs the same check before persisting.
 */
export function validateNoteBody(
  body: string,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = body.trim();
  if (trimmed.length < NOTE_BODY_MIN_CHARS) {
    return { ok: false, reason: "Note body required" };
  }
  if (trimmed.length > NOTE_BODY_MAX_CHARS) {
    return {
      ok: false,
      reason: `Note body capped at ${NOTE_BODY_MAX_CHARS} characters`,
    };
  }
  return { ok: true };
}

/**
 * True iff `role` is allowed to set `visibility` on a new note.
 * Mirrors the backend rule: admin-only notes require admin.
 */
export function canCreateVisibility(
  role: InternalConsoleRole | null | undefined,
  visibility: NoteVisibility,
): boolean {
  if (!role) return false;
  if (visibility === "admin_only") return role === "admin";
  return true;
}

/**
 * True iff `role` is allowed to read a note with the given visibility.
 * Used by the UI to decide which notes to render and by tests to
 * cover the read matrix.
 */
export function canReadVisibility(
  role: InternalConsoleRole | null | undefined,
  visibility: NoteVisibility,
): boolean {
  if (!role) return false;
  if (visibility === "admin_only") return role === "admin";
  return role === "broker" || role === "admin";
}
