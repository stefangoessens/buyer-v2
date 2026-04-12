/**
 * Manual override catalog (KIN-799).
 *
 * Every override the internal console supports is declared here with
 * its target entity, field, label, allowed roles, and expected value
 * shape. The backend reads the same list so allowed overrides cannot
 * drift between client and server — any case not in this catalog is
 * rejected by the mutation.
 *
 * These are the ONLY fields admins can override through the UI. Ops
 * cases that need more flexibility should get their own typed override
 * added here rather than a generic patch API.
 */

import type { InternalConsoleRole } from "./roles";

export const OVERRIDE_REASON_CODES = [
  "ops_request",
  "buyer_request",
  "legal_requirement",
  "data_correction",
  "escalation",
  "other",
] as const;
export type OverrideReasonCode = (typeof OVERRIDE_REASON_CODES)[number];

export const OVERRIDE_REASON_LABELS: Readonly<Record<OverrideReasonCode, string>> = {
  ops_request: "Ops request",
  buyer_request: "Buyer request",
  legal_requirement: "Legal requirement",
  data_correction: "Data correction",
  escalation: "Escalation",
  other: "Other",
};

export type OverrideValueType = "boolean" | "string" | "number" | "enum";

export interface OverrideFieldDef {
  /** Stable machine key — the override row will record this in `field`. */
  key: string;
  label: string;
  targetType: "dealRoom" | "offer" | "contract" | "buyerProfile" | "property" | "agreement";
  valueType: OverrideValueType;
  /** Allowed literal values when `valueType === "enum"`. Ignored otherwise. */
  enumValues?: readonly string[];
  /** Human-facing hint explaining when this override is appropriate. */
  description: string;
  /** Roles permitted to execute this override. `admin` is always allowed. */
  allowedRoles: readonly InternalConsoleRole[];
}

export const OVERRIDE_CATALOG: readonly OverrideFieldDef[] = [
  {
    key: "dealRoom.status",
    label: "Deal room status",
    targetType: "dealRoom",
    valueType: "enum",
    enumValues: ["active", "on_hold", "archived"],
    description:
      "Force a deal room between active / on hold / archived. Use only when the buyer requests a pause or legal flags the deal.",
    allowedRoles: ["admin"],
  },
  {
    key: "dealRoom.accessLevel",
    label: "Deal room access level",
    targetType: "dealRoom",
    valueType: "enum",
    enumValues: ["anonymous", "registered", "full"],
    description:
      "Reset a deal room's visibility. Useful when a buyer's registration fails and ops needs to escalate access manually.",
    allowedRoles: ["admin"],
  },
  {
    key: "offer.status",
    label: "Offer status",
    targetType: "offer",
    valueType: "enum",
    enumValues: ["draft", "submitted", "withdrawn", "accepted", "rejected", "countered"],
    description:
      "Transition an offer into a new status outside the normal submission flow. Rarely needed — escalations only.",
    allowedRoles: ["admin"],
  },
  {
    key: "buyerProfile.preapprovalAmount",
    label: "Buyer pre-approval amount",
    targetType: "buyerProfile",
    valueType: "number",
    description:
      "Adjust the buyer's captured pre-approval amount after receiving an updated lender letter.",
    allowedRoles: ["admin"],
  },
  {
    key: "buyerProfile.financingStatus",
    label: "Buyer financing status",
    targetType: "buyerProfile",
    valueType: "enum",
    enumValues: ["not_started", "in_progress", "verified", "expired"],
    description:
      "Bring financing status into sync with an out-of-band lender update.",
    allowedRoles: ["admin"],
  },
  {
    key: "contract.status",
    label: "Contract status",
    targetType: "contract",
    valueType: "enum",
    enumValues: ["draft", "pending_signature", "executed", "closed", "voided"],
    description:
      "Override contract status when the execution flow did not capture a real-world signature or voiding.",
    allowedRoles: ["admin"],
  },
  {
    key: "agreement.status",
    label: "Buyer agreement status",
    targetType: "agreement",
    valueType: "enum",
    enumValues: ["draft", "sent", "signed", "countersigned", "executed", "expired", "revoked"],
    description:
      "Move a buyer brokerage agreement into a terminal state for audit when the signing flow was bypassed.",
    allowedRoles: ["admin"],
  },
  {
    key: "property.reviewFlag",
    label: "Property review flag",
    targetType: "property",
    valueType: "boolean",
    description:
      "Flag a property record for manual review. Used when ingestion confidence is low but ops already validated.",
    allowedRoles: ["broker", "admin"],
  },
];

export const OVERRIDE_BY_KEY: Readonly<Record<string, OverrideFieldDef>> =
  Object.freeze(Object.fromEntries(OVERRIDE_CATALOG.map((o) => [o.key, o])));

/** Type guard for catalog keys. */
export function isKnownOverrideKey(key: string): boolean {
  return key in OVERRIDE_BY_KEY;
}

/** Type guard for reason codes. */
export function isOverrideReason(value: string): value is OverrideReasonCode {
  return (OVERRIDE_REASON_CODES as readonly string[]).includes(value);
}

/**
 * True iff `role` is allowed to execute `field`. Admin is always
 * allowed regardless of the catalog definition because the console
 * treats admin as a strict superset.
 */
export function canExecuteOverride(
  role: InternalConsoleRole | null | undefined,
  field: OverrideFieldDef,
): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  return field.allowedRoles.includes(role);
}

/**
 * Validate that a value is assignable to the field's declared value
 * type. Used by the client to short-circuit before calling the
 * mutation, and by the mutation as a belt-and-suspenders check.
 */
export function validateOverrideValue(
  field: OverrideFieldDef,
  value: unknown,
): { ok: true } | { ok: false; reason: string } {
  switch (field.valueType) {
    case "boolean":
      return typeof value === "boolean"
        ? { ok: true }
        : { ok: false, reason: "Expected a boolean" };
    case "string":
      if (typeof value !== "string") return { ok: false, reason: "Expected a string" };
      if (value.length === 0) return { ok: false, reason: "Value required" };
      if (value.length > 500) return { ok: false, reason: "Value too long (max 500)" };
      return { ok: true };
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        return { ok: false, reason: "Expected a number" };
      }
      if (!Number.isFinite(value)) {
        return { ok: false, reason: "Expected a finite number" };
      }
      return { ok: true };
    case "enum":
      if (typeof value !== "string") return { ok: false, reason: "Expected a string" };
      if (!field.enumValues || !field.enumValues.includes(value)) {
        return {
          ok: false,
          reason: `Expected one of ${(field.enumValues ?? []).join(", ")}`,
        };
      }
      return { ok: true };
  }
}

/** Minimum length for reason detail. Short-circuits empty-reason submissions. */
export const OVERRIDE_REASON_DETAIL_MIN_CHARS = 10;
/** Max reason detail. Matches the `manualOverrideRecords.reasonDetail` budget. */
export const OVERRIDE_REASON_DETAIL_MAX_CHARS = 2000;

/** Validate the reason detail string. */
export function validateReasonDetail(
  detail: string,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = detail.trim();
  if (trimmed.length < OVERRIDE_REASON_DETAIL_MIN_CHARS) {
    return {
      ok: false,
      reason: `Reason needs at least ${OVERRIDE_REASON_DETAIL_MIN_CHARS} characters`,
    };
  }
  if (trimmed.length > OVERRIDE_REASON_DETAIL_MAX_CHARS) {
    return {
      ok: false,
      reason: `Reason capped at ${OVERRIDE_REASON_DETAIL_MAX_CHARS} characters`,
    };
  }
  return { ok: true };
}
