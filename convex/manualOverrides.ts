/**
 * convex/manualOverrides.ts — KIN-799 Manual override tools backend.
 *
 * Typed queries and mutations for audited manual overrides. Every
 * mutation requires:
 *
 *   1. The actor is broker or admin (role-gated via requireAuth).
 *   2. The `field` is in the hardcoded override catalog below.
 *   3. The submitted value passes the catalog's value-type check.
 *   4. A `reasonCode` from the closed set and a non-empty `reasonDetail`.
 *
 * Every successful execution writes a row to `manualOverrideRecords`
 * (before/after values + actor + reason) AND a row to `auditLog` so
 * downstream search still finds overrides via the standard audit path.
 *
 * Rollback is first-class: `reverseOverride` writes a new row with
 * `reversedAt/reversedBy` set on the target row so history stays
 * immutable.
 *
 * Critically, we do NOT touch the target entity row here. KIN-799
 * scope is "expose typed backend actions for approved override cases"
 * — actually patching other entities is out of lane for session 6
 * (offers, contracts, tours, etc. are owned by other lanes). What we
 * provide is the audited *record* of the override with before/after
 * state. Downstream lanes can wire up the actual entity patch on top
 * of this record.
 */

import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { type Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";

// ─── catalog (duplicated from src/lib/admin/overrideCatalog.ts) ─────────────

type ValueType = "boolean" | "string" | "number" | "enum";
type TargetType =
  | "dealRoom"
  | "offer"
  | "contract"
  | "buyerProfile"
  | "property"
  | "agreement";

interface CatalogEntry {
  key: string;
  targetType: TargetType;
  valueType: ValueType;
  enumValues?: readonly string[];
  allowedRoles: readonly ("broker" | "admin")[];
}

// Every enum in this catalog MUST match the canonical enum declared on
// the corresponding table in `convex/schema.ts`. `executeOverride`
// validates values against these lists, so a drifted enum would block
// legitimate overrides. Cross-referenced against schema.ts main branch.
const CATALOG: readonly CatalogEntry[] = [
  {
    key: "dealRoom.status",
    targetType: "dealRoom",
    valueType: "enum",
    enumValues: [
      "intake",
      "analysis",
      "tour_scheduled",
      "offer_prep",
      "offer_sent",
      "under_contract",
      "closing",
      "closed",
      "withdrawn",
    ],
    allowedRoles: ["admin"],
  },
  {
    key: "dealRoom.accessLevel",
    targetType: "dealRoom",
    valueType: "enum",
    enumValues: ["anonymous", "registered", "full"],
    allowedRoles: ["admin"],
  },
  {
    key: "offer.status",
    targetType: "offer",
    valueType: "enum",
    enumValues: [
      "draft",
      "pending_review",
      "approved",
      "submitted",
      "countered",
      "accepted",
      "rejected",
      "withdrawn",
      "expired",
    ],
    allowedRoles: ["admin"],
  },
  {
    key: "buyerProfile.preApprovalAmount",
    targetType: "buyerProfile",
    valueType: "number",
    allowedRoles: ["admin"],
  },
  {
    key: "buyerProfile.preApproved",
    targetType: "buyerProfile",
    valueType: "boolean",
    allowedRoles: ["admin"],
  },
  {
    key: "contract.status",
    targetType: "contract",
    valueType: "enum",
    enumValues: ["pending_signatures", "fully_executed", "amended", "terminated"],
    allowedRoles: ["admin"],
  },
  {
    key: "agreement.status",
    targetType: "agreement",
    valueType: "enum",
    enumValues: ["draft", "sent", "signed", "canceled", "replaced"],
    allowedRoles: ["admin"],
  },
];

const CATALOG_BY_KEY: Readonly<Record<string, CatalogEntry>> = Object.freeze(
  Object.fromEntries(CATALOG.map((e) => [e.key, e])),
);

// ─── validators ─────────────────────────────────────────────────────────────

const reasonCodeValidator = v.union(
  v.literal("ops_request"),
  v.literal("buyer_request"),
  v.literal("legal_requirement"),
  v.literal("data_correction"),
  v.literal("escalation"),
  v.literal("other"),
);

const overrideRecordValidator = v.object({
  _id: v.id("manualOverrideRecords"),
  _creationTime: v.number(),
  targetType: v.string(),
  targetId: v.string(),
  field: v.string(),
  beforeValue: v.optional(v.any()),
  afterValue: v.optional(v.any()),
  reasonCode: reasonCodeValidator,
  reasonDetail: v.string(),
  performedBy: v.id("users"),
  performedAt: v.string(),
  reversedAt: v.optional(v.string()),
  reversedBy: v.optional(v.id("users")),
});

// ─── helpers ────────────────────────────────────────────────────────────────

async function requireInternalUser(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (user.role !== "broker" && user.role !== "admin") {
    throw new Error("Internal console access required");
  }
  return user;
}

function validateValue(
  entry: CatalogEntry,
  value: unknown,
): { ok: true } | { ok: false; reason: string } {
  switch (entry.valueType) {
    case "boolean":
      return typeof value === "boolean"
        ? { ok: true }
        : { ok: false, reason: "Expected a boolean" };
    case "string":
      if (typeof value !== "string") return { ok: false, reason: "Expected a string" };
      if (value.length === 0) return { ok: false, reason: "Value required" };
      if (value.length > 500) return { ok: false, reason: "Value too long" };
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
      if (!entry.enumValues || !entry.enumValues.includes(value)) {
        return { ok: false, reason: "Value not in allowed set" };
      }
      return { ok: true };
  }
}

async function writeAudit(
  ctx: MutationCtx,
  params: {
    userId: Id<"users">;
    action: string;
    entityId: Id<"manualOverrideRecords">;
    details: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditLog", {
    userId: params.userId,
    action: params.action,
    entityType: "manualOverrideRecords",
    entityId: params.entityId,
    details: JSON.stringify(params.details),
    timestamp: new Date().toISOString(),
  });
}

// ─── queries ────────────────────────────────────────────────────────────────

/**
 * Paginated recent-overrides list. Role-gated. Limits to 200 rows.
 *
 * When `targetType` is present we collect the full, time-sorted set
 * first and then slice — otherwise `take(limit)` would pull the most
 * recent N rows globally and filter AFTER, producing fewer results
 * than requested whenever the newest rows belong to a different
 * target type.
 */
export const listRecent = query({
  args: {
    targetType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(overrideRecordValidator),
  handler: async (ctx, args) => {
    await requireInternalUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    if (args.targetType) {
      const all = await ctx.db
        .query("manualOverrideRecords")
        .withIndex("by_performedAt")
        .order("desc")
        .collect();
      const filtered = all.filter((r) => r.targetType === args.targetType);
      return filtered.slice(0, limit);
    }
    return await ctx.db
      .query("manualOverrideRecords")
      .withIndex("by_performedAt")
      .order("desc")
      .take(limit);
  },
});

/** Return everything known about a single override row. */
export const getOverride = query({
  args: { recordId: v.id("manualOverrideRecords") },
  returns: v.union(overrideRecordValidator, v.null()),
  handler: async (ctx, args) => {
    await requireInternalUser(ctx);
    const row = await ctx.db.get(args.recordId);
    if (!row) return null;
    return row;
  },
});

/**
 * Catalog read endpoint. Returns the closed set of override fields
 * available to the current user based on their role. The client uses
 * this to render the override form — unknown keys are rejected.
 */
export const listCatalog = query({
  args: {},
  returns: v.array(
    v.object({
      key: v.string(),
      targetType: v.string(),
      valueType: v.union(
        v.literal("boolean"),
        v.literal("string"),
        v.literal("number"),
        v.literal("enum"),
      ),
      enumValues: v.optional(v.array(v.string())),
      allowedRoles: v.array(
        v.union(v.literal("broker"), v.literal("admin")),
      ),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireInternalUser(ctx);
    const role = user.role as "broker" | "admin";
    return CATALOG.filter(
      (e) => role === "admin" || e.allowedRoles.includes(role),
    ).map((e) => ({
      key: e.key,
      targetType: e.targetType,
      valueType: e.valueType,
      enumValues: e.enumValues ? [...e.enumValues] : undefined,
      allowedRoles: [...e.allowedRoles],
    }));
  },
});

// ─── mutations ──────────────────────────────────────────────────────────────

/**
 * Execute a manual override. Writes an audit row with before/after
 * values. Does NOT patch the target entity — downstream lanes wire up
 * the actual patch on top of the override record. This keeps override
 * tracking cleanly separated from state transitions in other lanes.
 */
export const executeOverride = mutation({
  args: {
    field: v.string(),
    targetId: v.string(),
    beforeValue: v.optional(v.any()),
    afterValue: v.optional(v.any()),
    reasonCode: reasonCodeValidator,
    reasonDetail: v.string(),
  },
  returns: v.id("manualOverrideRecords"),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);

    // 1. Field must be in the catalog.
    const entry = CATALOG_BY_KEY[args.field];
    if (!entry) {
      throw new Error(`Unknown override field: ${args.field}`);
    }

    // 2. Current role must be authorized for this field.
    const authorized =
      user.role === "admin" ||
      (user.role === "broker" && entry.allowedRoles.includes("broker"));
    if (!authorized) {
      throw new Error("You do not have permission to execute this override");
    }

    // 3. Value must match the declared type.
    const afterCheck = validateValue(entry, args.afterValue);
    if (!afterCheck.ok) {
      throw new Error(`Invalid afterValue: ${afterCheck.reason}`);
    }
    if (args.beforeValue !== undefined) {
      const beforeCheck = validateValue(entry, args.beforeValue);
      if (!beforeCheck.ok) {
        throw new Error(`Invalid beforeValue: ${beforeCheck.reason}`);
      }
    }

    // 4. Non-empty reason detail.
    const trimmedDetail = args.reasonDetail.trim();
    if (trimmedDetail.length < 10) {
      throw new Error("Reason detail required (min 10 characters)");
    }
    if (trimmedDetail.length > 2000) {
      throw new Error("Reason detail capped at 2000 characters");
    }
    // 5. targetId must be non-empty.
    if (!args.targetId.trim()) {
      throw new Error("targetId required");
    }

    const nowIso = new Date().toISOString();
    const recordId = await ctx.db.insert("manualOverrideRecords", {
      targetType: entry.targetType,
      targetId: args.targetId,
      field: args.field,
      beforeValue: args.beforeValue,
      afterValue: args.afterValue,
      reasonCode: args.reasonCode,
      reasonDetail: trimmedDetail,
      performedBy: user._id,
      performedAt: nowIso,
    });

    await writeAudit(ctx, {
      userId: user._id,
      action: "manual_override_executed",
      entityId: recordId,
      details: {
        field: args.field,
        targetType: entry.targetType,
        targetId: args.targetId,
        reasonCode: args.reasonCode,
        reasonLength: trimmedDetail.length,
      },
    });

    return recordId;
  },
});

/**
 * Mark a previous override as reversed. Captures the reverser, the
 * timestamp, and a reason. Never deletes the row — rollback history is
 * part of the audit trail.
 */
export const reverseOverride = mutation({
  args: {
    recordId: v.id("manualOverrideRecords"),
    reasonDetail: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    if (user.role !== "admin") {
      throw new Error("Only admins can reverse overrides");
    }
    const row = await ctx.db.get(args.recordId);
    if (!row) throw new Error("Override record not found");
    if (row.reversedAt) throw new Error("Override already reversed");

    const trimmed = args.reasonDetail.trim();
    if (trimmed.length < 10) {
      throw new Error("Reversal reason required (min 10 characters)");
    }
    if (trimmed.length > 2000) {
      throw new Error("Reason detail capped at 2000 characters");
    }

    const nowIso = new Date().toISOString();
    await ctx.db.patch(args.recordId, {
      reversedAt: nowIso,
      reversedBy: user._id,
    });

    // Persist the full reversal reason in the audit row — not just
    // its length — so reviewers can reconstruct why a reversal
    // happened. The auditLog table is the canonical explanation
    // store for override state changes.
    await writeAudit(ctx, {
      userId: user._id,
      action: "manual_override_reversed",
      entityId: args.recordId,
      details: {
        field: row.field,
        targetType: row.targetType,
        targetId: row.targetId,
        originalReason: row.reasonCode,
        reversalReasonDetail: trimmed,
      },
    });

    return null;
  },
});
