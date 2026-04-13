import type { SettingCatalogEntry, SettingsCatalog } from "./types";

/**
 * Canonical settings catalog (KIN-807).
 *
 * Every supported mutable setting is declared here. Callers that
 * need a new setting add it to this list, not directly to the
 * Convex writes. The Convex mutation layer walks this catalog on
 * every write to validate the incoming value.
 *
 * Keys are stable — once a key is published, it must not be
 * renamed without a migration of both the Convex row and any
 * runtime code that reads the old key.
 */

export const SETTINGS_CATALOG: SettingsCatalog = {
  entries: [
    // ─── Disclosures ────────────────────────────────────────────
    {
      key: "disclosure.buyer_representation",
      label: "Buyer representation disclosure",
      description:
        "Rendered at the top of the buyer agreement form and on the legal disclosures page.",
      category: "disclosures",
      kind: "richText",
      writeRole: "admin",
      defaultValue: {
        kind: "richText",
        value:
          "buyer-v2 represents the buyer in Florida residential real estate transactions. As a licensed Florida brokerage, we act as the buyer's exclusive agent on every transaction unless the buyer signs a different form of representation.",
      },
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
      defaultValue: {
        kind: "richText",
        value:
          "buyer-v2's commission rebate is calculated from the buyer-agent commission specified in the listing agreement. The rebate is delivered as a closing credit and does not stack with builder incentives unless the builder's written terms allow it.",
      },
      constraints: { minLength: 50, maxLength: 2000 },
    },

    // ─── Fees ───────────────────────────────────────────────────
    {
      key: "fee.default_rebate_pct",
      label: "Default buyer rebate percentage",
      description:
        "Default assumption used by the savings calculator and pricing engine when the real listing commission isn't available.",
      category: "fees",
      kind: "number",
      writeRole: "admin",
      defaultValue: { kind: "number", value: 0.9 },
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
      defaultValue: { kind: "number", value: 500 },
      constraints: { min: 0, max: 100000, integer: true },
    },

    // ─── Rollout / feature flags ────────────────────────────────
    {
      key: "rollout.savings_calculator_enabled",
      label: "Savings calculator enabled",
      description:
        "Global kill switch for the savings calculator on the public site.",
      category: "rollout",
      kind: "boolean",
      writeRole: "broker",
      defaultValue: { kind: "boolean", value: true },
    },
    {
      key: "rollout.new_construction_pages_enabled",
      label: "New-construction pages enabled",
      description:
        "Global kill switch for the /new-construction/* programmatic pages.",
      category: "rollout",
      kind: "boolean",
      writeRole: "broker",
      defaultValue: { kind: "boolean", value: true },
    },

    // ─── Operational defaults ───────────────────────────────────
    {
      key: "ops.support_email",
      label: "Support email",
      description:
        "Contact address rendered in the footer and sent via the contact form.",
      category: "operational",
      kind: "string",
      writeRole: "broker",
      defaultValue: { kind: "string", value: "support@buyerv2.com" },
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
      defaultValue: { kind: "number", value: 4 },
      constraints: { min: 1, max: 168, integer: true },
    },

    // ─── Branding ───────────────────────────────────────────────
    {
      key: "branding.site_name",
      label: "Site name",
      description:
        "Display name used across titles, OG cards, and footer.",
      category: "branding",
      kind: "string",
      writeRole: "admin",
      defaultValue: { kind: "string", value: "buyer-v2" },
      constraints: { minLength: 1, maxLength: 50 },
    },
    {
      key: "branding.primary_color",
      label: "Primary brand color",
      description: "Hex color used for primary buttons and accent strokes.",
      category: "branding",
      kind: "string",
      writeRole: "admin",
      defaultValue: { kind: "string", value: "#1B2B65" },
      constraints: {
        minLength: 7,
        maxLength: 7,
        pattern: "^#[0-9a-fA-F]{6}$",
      },
    },
  ],
};

/**
 * Convenience helper: find a catalog entry by key. Returns
 * undefined for unknown keys; callers treat that as a typed
 * `unknownKey` validation error.
 */
export function findCatalogEntry(
  catalog: SettingsCatalog,
  key: string
): SettingCatalogEntry | undefined {
  return catalog.entries.find((e) => e.key === key);
}

/**
 * Return all entries in a given category. Used by the admin UI
 * to render grouped panels.
 */
export function entriesByCategory(
  catalog: SettingsCatalog,
  category: SettingCatalogEntry["category"]
): SettingCatalogEntry[] {
  return catalog.entries.filter((e) => e.category === category);
}
