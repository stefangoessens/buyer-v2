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
    {
      key: "fee.offer_gate_flat_fee_pct",
      label: "Offer-gate flat fee percentage",
      description:
        "Flat fee % of list price used in the offer-gate credit math. Shown to buyers as 'Our Fee (only if you close)'.",
      category: "fees",
      kind: "number",
      writeRole: "admin",
      defaultValue: { kind: "number", value: 1.0 },
      constraints: { min: 0, max: 10 },
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
    {
      key: "rollout.fl_availability_strip_enabled",
      label: "FL availability strip enabled",
      description:
        "Controls whether the sitewide Florida-only availability strip renders on public marketing routes. Does not affect the waitlist mutation itself — only the strip + dialog UI.",
      category: "rollout",
      kind: "boolean",
      writeRole: "broker",
      defaultValue: { kind: "boolean", value: true },
    },
    {
      key: "rollout.home_rebate_slider_enabled",
      label: "Home rebate slider enabled",
      description:
        "Global kill switch for the interactive homepage rebate slider. When false, the homepage renders a static 4-row fallback table instead.",
      category: "rollout",
      kind: "boolean",
      writeRole: "broker",
      defaultValue: { kind: "boolean", value: true },
    },
    {
      key: "rollout.notifications_fanout_enabled",
      label: "Notification fanout enabled",
      description:
        "Master kill switch for the buyer notification fanout fabric. Keep false until the downstream provider rails are ready.",
      category: "rollout",
      kind: "boolean",
      writeRole: "broker",
      defaultValue: { kind: "boolean", value: false },
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
    {
      key: "broker.callback_sla_copy",
      label: "Brokerage callback SLA copy",
      description:
        "Copy shown in the offer-gate success state promising broker callback SLA.",
      category: "operational",
      kind: "string",
      writeRole: "broker",
      defaultValue: {
        kind: "string",
        value: "We'll call you within 1 business hour",
      },
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
      defaultValue: { kind: "string", value: "" },
      constraints: { minLength: 0, maxLength: 50 },
    },
    {
      key: "broker.outbound_from_name",
      label: "Outbound sender name",
      description:
        "Brokerage sender name used on transactional and relationship email.",
      category: "operational",
      kind: "string",
      writeRole: "broker",
      defaultValue: { kind: "string", value: "buyer-v2 Brokerage" },
      constraints: { minLength: 1, maxLength: 120 },
    },
    {
      key: "broker.outbound_from_email",
      label: "Outbound sender email",
      description:
        "Brokerage sender email used in the From header for Resend sends.",
      category: "operational",
      kind: "string",
      writeRole: "broker",
      defaultValue: { kind: "string", value: "broker@buyer-v2.app" },
      constraints: {
        minLength: 5,
        maxLength: 200,
        pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
      },
    },
    {
      key: "broker.reply_domain",
      label: "Reply-to domain",
      description:
        "Domain used to mint per-thread reply aliases for broker-to-broker email.",
      category: "operational",
      kind: "string",
      writeRole: "admin",
      defaultValue: { kind: "string", value: "reply.buyer-v2.app" },
      constraints: { minLength: 3, maxLength: 120 },
    },
    {
      key: "broker.signature_postal_address",
      label: "Brokerage postal address",
      description:
        "Physical brokerage mailing address rendered in CAN-SPAM email footers.",
      category: "operational",
      kind: "string",
      writeRole: "admin",
      defaultValue: { kind: "string", value: "" },
      constraints: { minLength: 0, maxLength: 400 },
    },
    {
      key: "email.resend_api_key_env_var_name",
      label: "Resend API key env var",
      description:
        "Name of the environment variable that stores the transactional Resend API key.",
      category: "operational",
      kind: "string",
      writeRole: "admin",
      defaultValue: { kind: "string", value: "RESEND_API_KEY" },
      constraints: { minLength: 1, maxLength: 120 },
    },
    {
      key: "email.resend_webhook_secret_env_var_name",
      label: "Resend webhook secret env var",
      description:
        "Name of the environment variable that stores the Resend webhook signing secret.",
      category: "operational",
      kind: "string",
      writeRole: "admin",
      defaultValue: { kind: "string", value: "RESEND_WEBHOOK_SECRET" },
      constraints: { minLength: 1, maxLength: 120 },
    },
    {
      key: "email.marketing_list_id",
      label: "Relationship audience list id",
      description:
        "Resend relationship/marketing audience identifier kept separate from transactional email.",
      category: "operational",
      kind: "string",
      writeRole: "broker",
      defaultValue: { kind: "string", value: "" },
      constraints: { minLength: 0, maxLength: 200 },
    },
    {
      key: "notifications.default_quiet_hours_start",
      label: "Default quiet hours start",
      description:
        "Default quiet-hours start time used when a buyer has not set a personal notification window. Stored as Eastern Time HH:MM.",
      category: "operational",
      kind: "string",
      writeRole: "broker",
      defaultValue: { kind: "string", value: "21:00" },
      constraints: {
        minLength: 4,
        maxLength: 5,
        pattern: "^([01]?\\d|2[0-3]):[0-5]\\d$",
      },
    },
    {
      key: "notifications.default_quiet_hours_end",
      label: "Default quiet hours end",
      description:
        "Default quiet-hours end time used when a buyer has not set a personal notification window. Stored as Eastern Time HH:MM.",
      category: "operational",
      kind: "string",
      writeRole: "broker",
      defaultValue: { kind: "string", value: "08:00" },
      constraints: {
        minLength: 4,
        maxLength: 5,
        pattern: "^([01]?\\d|2[0-3]):[0-5]\\d$",
      },
    },
    {
      key: "notifications.fanout_batch_size",
      label: "Notification fanout batch size",
      description:
        "Maximum event rows the fanout worker should pull per batch before it re-checks suppression and preference state.",
      category: "operational",
      kind: "number",
      writeRole: "admin",
      defaultValue: { kind: "number", value: 100 },
      constraints: { min: 1, max: 1000, integer: true },
    },
    {
      key: "notifications.retry_max_attempts",
      label: "Notification retry max attempts",
      description:
        "Upper bound for transient notification retries before the event is treated as permanently failed.",
      category: "operational",
      kind: "number",
      writeRole: "admin",
      defaultValue: { kind: "number", value: 5 },
      constraints: { min: 1, max: 10, integer: true },
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
