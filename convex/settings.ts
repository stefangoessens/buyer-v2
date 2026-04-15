import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/session";

/**
 * Convex queries + mutations for the internal settings area
 * (KIN-807).
 *
 * Auth model:
 *   - reads: ops-only (`requireRole(ctx, "broker")`)
 *   - writes: role-gated per catalog entry — admin can write
 *     anything, brokers only entries with `writeRole === "broker"`
 *
 * Pure validation logic lives in `src/lib/settings/*`. Convex
 * files cannot import from `src/`, so this file duplicates the
 * catalog + validator inline. The TS source is canonical — tests
 * in `src/__tests__/lib/settings/logic.test.ts` exercise the
 * pure module to prevent drift.
 */

// MARK: - Inline catalog mirror

type SettingCategory =
  | "disclosures"
  | "fees"
  | "rollout"
  | "operational"
  | "branding";

type SettingValueKind =
  | "string"
  | "number"
  | "boolean"
  | "richText"
  | "json";

type SettingWriteRole = "admin" | "broker";

interface InlineCatalogEntry {
  key: string;
  label: string;
  description: string;
  category: SettingCategory;
  kind: SettingValueKind;
  writeRole: SettingWriteRole;
  defaultJson: unknown;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
    integer?: boolean;
    requiredJsonKeys?: readonly string[];
  };
}

/**
 * Mirror of `SETTINGS_CATALOG` from `src/lib/settings/catalog.ts`.
 * Keep the two aligned — any drift is visible to the Vitest
 * suite on the src/ copy at build time.
 */
const SETTINGS_CATALOG_INLINE: readonly InlineCatalogEntry[] = [
  {
    key: "disclosure.buyer_representation",
    label: "Buyer representation disclosure",
    description:
      "Rendered at the top of the buyer agreement form and on the legal disclosures page.",
    category: "disclosures",
    kind: "richText",
    writeRole: "admin",
    defaultJson:
      "buyer-v2 represents the buyer in Florida residential real estate transactions. As a licensed Florida brokerage, we act as the buyer's exclusive agent on every transaction unless the buyer signs a different form of representation.",
    constraints: { minLength: 50, maxLength: 4000 },
  },
  {
    key: "disclosure.fee_transparency",
    label: "Fee transparency disclosure",
    description:
      "Short explanation of how buyer-v2's commission rebate interacts with builder and seller credits.",
    category: "disclosures",
    kind: "richText",
    writeRole: "admin",
    defaultJson:
      "buyer-v2's commission rebate is calculated from the buyer-agent commission specified in the listing agreement. The rebate is delivered as a closing credit and does not stack with builder incentives unless the builder's written terms allow it.",
    constraints: { minLength: 50, maxLength: 2000 },
  },
  {
    key: "fee.default_rebate_pct",
    label: "Default buyer rebate percentage",
    description:
      "Default assumption used by the savings calculator and pricing engine when the real listing commission isn't available.",
    category: "fees",
    kind: "number",
    writeRole: "admin",
    defaultJson: 0.9,
    constraints: { min: 0, max: 3 },
  },
  {
    key: "fee.default_buyer_credit_floor",
    label: "Minimum buyer credit at closing",
    description:
      "Operational floor — buyer credits below this amount require manual broker approval before surfacing to the buyer.",
    category: "fees",
    kind: "number",
    writeRole: "admin",
    defaultJson: 500,
    constraints: { min: 0, max: 100000, integer: true },
  },
  {
    key: "fee.offer_gate_flat_fee_pct",
    label: "Offer-gate flat fee percentage",
    description:
      "Flat fee % of list price used in the offer-gate credit math. Shown to buyers as 'Our Fee (only if you close)'.",
    category: "fees",
    kind: "number",
    writeRole: "admin",
    defaultJson: 1.0,
    constraints: { min: 0, max: 10 },
  },
  {
    key: "sms.twilio_account_sid_env_var_name",
    label: "Twilio account SID env var",
    description:
      "Environment variable name that resolves to the Twilio Account SID.",
    category: "operational",
    kind: "string",
    writeRole: "admin",
    defaultJson: "TWILIO_ACCOUNT_SID",
    constraints: {
      minLength: 1,
      maxLength: 100,
      pattern: "^[A-Z][A-Z0-9_]*$",
    },
  },
  {
    key: "sms.twilio_auth_token_env_var_name",
    label: "Twilio auth token env var",
    description:
      "Environment variable name that resolves to the Twilio auth token.",
    category: "operational",
    kind: "string",
    writeRole: "admin",
    defaultJson: "TWILIO_AUTH_TOKEN",
    constraints: {
      minLength: 1,
      maxLength: 100,
      pattern: "^[A-Z][A-Z0-9_]*$",
    },
  },
  {
    key: "sms.twilio_verify_service_sid_env_var_name",
    label: "Twilio Verify SID env var",
    description:
      "Environment variable name that resolves to the Twilio Verify service SID.",
    category: "operational",
    kind: "string",
    writeRole: "admin",
    defaultJson: "TWILIO_VERIFY_SERVICE_SID",
    constraints: {
      minLength: 1,
      maxLength: 100,
      pattern: "^[A-Z][A-Z0-9_]*$",
    },
  },
  {
    key: "sms.twilio_messaging_service_sid_transactional",
    label: "Transactional messaging service SID",
    description:
      "Twilio Messaging Service SID used for transactional SMS sends.",
    category: "operational",
    kind: "string",
    writeRole: "admin",
    defaultJson: "MG00000000000000000000000000000000",
    constraints: {
      minLength: 34,
      maxLength: 34,
      pattern: "^MG[0-9a-fA-F]{32}$",
    },
  },
  {
    key: "sms.twilio_messaging_service_sid_relationship",
    label: "Relationship messaging service SID",
    description:
      "Twilio Messaging Service SID reserved for relationship / engagement SMS.",
    category: "operational",
    kind: "string",
    writeRole: "admin",
    defaultJson: "MG00000000000000000000000000000000",
    constraints: {
      minLength: 34,
      maxLength: 34,
      pattern: "^MG[0-9a-fA-F]{32}$",
    },
  },
  {
    key: "sms.twilio_from_number",
    label: "Twilio sender number",
    description:
      "Public Twilio SMS sender number used for outbound transactional alerts.",
    category: "operational",
    kind: "string",
    writeRole: "admin",
    defaultJson: "+15555550100",
    constraints: {
      minLength: 8,
      maxLength: 16,
      pattern: "^\\+[1-9]\\d{7,14}$",
    },
  },
  {
    key: "sms.max_inbound_per_buyer_per_hour",
    label: "Inbound SMS throttle per buyer",
    description:
      "Maximum number of inbound SMS messages a buyer may send per hour.",
    category: "operational",
    kind: "number",
    writeRole: "admin",
    defaultJson: 10,
    constraints: { min: 1, max: 100, integer: true },
  },
  {
    key: "rollout.sms_outbound_enabled",
    label: "SMS outbound enabled",
    description:
      "Global kill switch for Twilio transactional SMS delivery.",
    category: "rollout",
    kind: "boolean",
    writeRole: "broker",
    defaultJson: false,
  },
  {
    key: "rollout.sms_inbound_enabled",
    label: "SMS inbound enabled",
    description:
      "Global kill switch for the Twilio inbound SMS-to-deal-room flow.",
    category: "rollout",
    kind: "boolean",
    writeRole: "broker",
    defaultJson: false,
  },
  {
    key: "rollout.savings_calculator_enabled",
    label: "Savings calculator enabled",
    description:
      "Global kill switch for the savings calculator on the public site.",
    category: "rollout",
    kind: "boolean",
    writeRole: "broker",
    defaultJson: true,
  },
  {
    key: "rollout.new_construction_pages_enabled",
    label: "New-construction pages enabled",
    description:
      "Global kill switch for the /new-construction/* programmatic pages.",
    category: "rollout",
    kind: "boolean",
    writeRole: "broker",
    defaultJson: true,
  },
  {
    key: "ops.support_email",
    label: "Support email",
    description:
      "Contact address rendered in the footer and sent via the contact form.",
    category: "operational",
    kind: "string",
    writeRole: "broker",
    defaultJson: "support@buyerv2.com",
    constraints: {
      minLength: 5,
      maxLength: 200,
      pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    },
  },
  {
    key: "ops.broker_review_sla_hours",
    label: "Broker review SLA (hours)",
    description:
      "Target turnaround time for broker review of AI-generated outputs.",
    category: "operational",
    kind: "number",
    writeRole: "admin",
    defaultJson: 4,
    constraints: { min: 1, max: 168, integer: true },
  },
  {
    key: "broker.callback_sla_copy",
    label: "Brokerage callback SLA copy",
    description:
      "Copy shown in the offer-gate success state promising broker callback SLA.",
    category: "operational",
    kind: "string",
    writeRole: "broker",
    defaultJson: "We'll call you within 1 business hour",
    constraints: { minLength: 1, maxLength: 200 },
  },
  {
    key: "broker.fl_license_number",
    label: "Florida brokerage license number",
    description:
      "Florida brokerage license number, displayed in the offer-gate disclosure footer. REQUIRED before launch.",
    category: "operational",
    kind: "string",
    writeRole: "admin",
    defaultJson: "",
    constraints: { minLength: 0, maxLength: 50 },
  },
  {
    key: "branding.site_name",
    label: "Site name",
    description:
      "Display name used across titles, OG cards, and footer.",
    category: "branding",
    kind: "string",
    writeRole: "admin",
    defaultJson: "buyer-v2",
    constraints: { minLength: 1, maxLength: 50 },
  },
  {
    key: "branding.primary_color",
    label: "Primary brand color",
    description: "Hex color used for primary buttons and accent strokes.",
    category: "branding",
    kind: "string",
    writeRole: "admin",
    defaultJson: "#1B2B65",
    constraints: {
      minLength: 7,
      maxLength: 7,
      pattern: "^#[0-9a-fA-F]{6}$",
    },
  },
];

function findInlineEntry(key: string): InlineCatalogEntry | undefined {
  return SETTINGS_CATALOG_INLINE.find((e) => e.key === key);
}

/**
 * Inline mirror of `validateSettingValue` from src/lib/settings/logic.ts.
 * Throws with a clear message for any first failure. Full error
 * enumeration is the pure module's responsibility — Convex callers
 * just need to know whether to write or reject.
 */
function validateInline(
  key: string,
  incomingKind: SettingValueKind,
  value: unknown
): void {
  const entry = findInlineEntry(key);
  if (!entry) {
    throw new Error(`unknown settings key: ${key}`);
  }
  if (incomingKind !== entry.kind) {
    throw new Error(
      `settings kind mismatch for ${key}: expected ${entry.kind}, got ${incomingKind}`
    );
  }
  const c = entry.constraints;
  if (incomingKind === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`${key} value is not a number`);
    }
    if (c?.min !== undefined && value < c.min) {
      throw new Error(`${key} value ${value} below min ${c.min}`);
    }
    if (c?.max !== undefined && value > c.max) {
      throw new Error(`${key} value ${value} above max ${c.max}`);
    }
    if (c?.integer && !Number.isInteger(value)) {
      throw new Error(`${key} value ${value} must be an integer`);
    }
  }
  if (incomingKind === "string" || incomingKind === "richText") {
    if (typeof value !== "string") {
      throw new Error(`${key} value is not a string`);
    }
    if (c?.minLength !== undefined && value.length < c.minLength) {
      throw new Error(
        `${key} value is too short (min ${c.minLength} chars)`
      );
    }
    if (c?.maxLength !== undefined && value.length > c.maxLength) {
      throw new Error(
        `${key} value is too long (max ${c.maxLength} chars)`
      );
    }
    if (c?.pattern !== undefined) {
      let regex: RegExp;
      try {
        regex = new RegExp(c.pattern);
      } catch {
        throw new Error(
          `${key} catalog pattern is invalid: ${c.pattern}`
        );
      }
      if (!regex.test(value)) {
        throw new Error(`${key} value does not match pattern ${c.pattern}`);
      }
    }
  }
  if (incomingKind === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${key} value is not a boolean`);
    }
  }
  if (incomingKind === "json") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${key} value is not a JSON object`);
    }
    const required = c?.requiredJsonKeys ?? [];
    for (const rk of required) {
      if (!(rk in (value as Record<string, unknown>))) {
        throw new Error(`${key} missing required JSON key: ${rk}`);
      }
    }
  }
}

// MARK: - Validators

const kindValidator = v.union(
  v.literal("string"),
  v.literal("number"),
  v.literal("boolean"),
  v.literal("richText"),
  v.literal("json")
);

// MARK: - Queries

/**
 * Read a single setting by key. Ops-only. Returns the catalog
 * default when the row doesn't exist yet so callers never have
 * to null-handle.
 */
export const getByKey = query({
  args: { key: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      key: v.string(),
      kind: kindValidator,
      stringValue: v.optional(v.string()),
      numberValue: v.optional(v.number()),
      booleanValue: v.optional(v.boolean()),
      richTextValue: v.optional(v.string()),
      jsonValue: v.optional(v.any()),
      updatedAt: v.string(),
      updatedBy: v.string(),
      isDefault: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    const entry = findInlineEntry(args.key);
    if (!entry) return null;
    const row = await ctx.db
      .query("settingsEntries")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!row) {
      // Return the catalog default as a read-only synthesized row
      return {
        key: entry.key,
        kind: entry.kind,
        stringValue: entry.kind === "string" ? (entry.defaultJson as string) : undefined,
        numberValue: entry.kind === "number" ? (entry.defaultJson as number) : undefined,
        booleanValue:
          entry.kind === "boolean" ? (entry.defaultJson as boolean) : undefined,
        richTextValue:
          entry.kind === "richText" ? (entry.defaultJson as string) : undefined,
        jsonValue: entry.kind === "json" ? entry.defaultJson : undefined,
        updatedAt: "1970-01-01T00:00:00Z",
        updatedBy: "catalog-default",
        isDefault: true,
      };
    }
    return {
      key: row.key,
      kind: row.kind,
      stringValue: row.stringValue,
      numberValue: row.numberValue,
      booleanValue: row.booleanValue,
      richTextValue: row.richTextValue,
      jsonValue: row.jsonValue,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      isDefault: false,
    };
  },
});

/**
 * List every supported setting with current stored value or
 * default. Used by the admin UI to render the full catalog grid.
 */
export const listAll = query({
  args: {},
  returns: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      description: v.string(),
      category: v.union(
        v.literal("disclosures"),
        v.literal("fees"),
        v.literal("rollout"),
        v.literal("operational"),
        v.literal("branding")
      ),
      kind: kindValidator,
      writeRole: v.union(v.literal("admin"), v.literal("broker")),
      currentJson: v.any(),
      isDefault: v.boolean(),
      updatedAt: v.string(),
      updatedBy: v.string(),
    })
  ),
  handler: async (ctx) => {
    await requireRole(ctx, "broker");
    const rows = await ctx.db.query("settingsEntries").collect();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return SETTINGS_CATALOG_INLINE.map((entry) => {
      const row = byKey.get(entry.key);
      const currentJson = row
        ? row.stringValue ??
          row.numberValue ??
          row.booleanValue ??
          row.richTextValue ??
          row.jsonValue
        : entry.defaultJson;
      return {
        key: entry.key,
        label: entry.label,
        description: entry.description,
        category: entry.category,
        kind: entry.kind,
        writeRole: entry.writeRole,
        currentJson,
        isDefault: !row,
        updatedAt: row?.updatedAt ?? "1970-01-01T00:00:00Z",
        updatedBy: row?.updatedBy ?? "catalog-default",
      };
    });
  },
});

// MARK: - Write

/**
 * Upsert a setting value. Role-gated per catalog entry (admin
 * always OK; broker only for broker-writable entries). Every
 * successful write appends an audit log row with the caller's
 * email, reason, and change timestamp.
 *
 * `reason` is required (min 3 chars) — ops accountability is a
 * hard requirement, not a nice-to-have.
 */
export const upsertByKey = mutation({
  args: {
    key: v.string(),
    kind: kindValidator,
    // Exactly one of the *Value fields must match the kind.
    stringValue: v.optional(v.string()),
    numberValue: v.optional(v.number()),
    booleanValue: v.optional(v.boolean()),
    richTextValue: v.optional(v.string()),
    jsonValue: v.optional(v.any()),
    reason: v.string(),
  },
  returns: v.id("settingsEntries"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const entry = findInlineEntry(args.key);
    if (!entry) {
      throw new Error(`unknown settings key: ${args.key}`);
    }
    if (user.role !== "admin" && entry.writeRole === "admin") {
      throw new Error(
        `insufficient role: writing ${args.key} requires admin`
      );
    }
    if (args.reason.trim().length < 3) {
      throw new Error("reason is required (min 3 chars)");
    }

    // Pull the value out of the right *Value field and run the
    // inline validator. Throws with a clear message on failure.
    let value: unknown;
    switch (args.kind) {
      case "string":
        value = args.stringValue;
        break;
      case "number":
        value = args.numberValue;
        break;
      case "boolean":
        value = args.booleanValue;
        break;
      case "richText":
        value = args.richTextValue;
        break;
      case "json":
        value = args.jsonValue;
        break;
    }
    if (value === undefined || value === null) {
      throw new Error(`no value provided for kind ${args.kind}`);
    }
    validateInline(args.key, args.kind, value);

    const now = new Date().toISOString();

    // Upsert
    const existing = await ctx.db
      .query("settingsEntries")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    const previousJson = existing
      ? existing.stringValue ??
        existing.numberValue ??
        existing.booleanValue ??
        existing.richTextValue ??
        existing.jsonValue
      : null;
    const previousKind = existing?.kind;

    let rowId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        kind: args.kind,
        stringValue:
          args.kind === "string" ? (value as string) : undefined,
        numberValue:
          args.kind === "number" ? (value as number) : undefined,
        booleanValue:
          args.kind === "boolean" ? (value as boolean) : undefined,
        richTextValue:
          args.kind === "richText" ? (value as string) : undefined,
        jsonValue: args.kind === "json" ? value : undefined,
        updatedAt: now,
        updatedBy: user.email,
      });
      rowId = existing._id;
    } else {
      rowId = await ctx.db.insert("settingsEntries", {
        key: args.key,
        kind: args.kind,
        stringValue:
          args.kind === "string" ? (value as string) : undefined,
        numberValue:
          args.kind === "number" ? (value as number) : undefined,
        booleanValue:
          args.kind === "boolean" ? (value as boolean) : undefined,
        richTextValue:
          args.kind === "richText" ? (value as string) : undefined,
        jsonValue: args.kind === "json" ? value : undefined,
        updatedAt: now,
        updatedBy: user.email,
      });
    }

    // Audit log
    await ctx.db.insert("settingsAuditLog", {
      key: args.key,
      previousKind,
      previousJson: previousJson ?? undefined,
      nextKind: args.kind,
      nextJson: value,
      changedBy: user.email,
      reason: args.reason.trim(),
      changedAt: now,
    });

    return rowId;
  },
});

// MARK: - Audit

/**
 * Read the audit log for a specific key. Ops-only. Returns newest
 * first. Used by the admin UI to show change history.
 */
export const listAuditForKey = query({
  args: { key: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      key: v.string(),
      previousKind: v.optional(kindValidator),
      previousJson: v.optional(v.any()),
      nextKind: kindValidator,
      nextJson: v.any(),
      changedBy: v.string(),
      reason: v.string(),
      changedAt: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    const rows = await ctx.db
      .query("settingsAuditLog")
      .withIndex("by_key_and_changedAt", (q) => q.eq("key", args.key))
      .order("desc")
      .take(args.limit ?? 50);
    return rows.map((r) => ({
      key: r.key,
      previousKind: r.previousKind,
      previousJson: r.previousJson,
      nextKind: r.nextKind,
      nextJson: r.nextJson,
      changedBy: r.changedBy,
      reason: r.reason,
      changedAt: r.changedAt,
    }));
  },
});
