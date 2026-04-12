import type { DisclosureModule } from "@/lib/content/types";
import { CALCULATOR_DISCLOSURES } from "@/lib/pricing/disclosures";

/**
 * The canonical public disclosure catalog for buyer-v2 (KIN-773).
 *
 * Every disclosure has a stable id so analytics can track which ones
 * users have viewed and so legal review rounds can reference clauses
 * by name. Multiple public surfaces compose a subset of this catalog
 * via `selectDisclosures(...)` from the filter module — the savings
 * calculator, pricing page, and brokerage disclosure page all share
 * the same source copy.
 *
 * This file intentionally wraps the KIN-772 calculator disclosures
 * into the KIN-773 typed `DisclosureModule` shape (adding a
 * `visibility` flag) so both modules stay in sync without duplicating
 * the legal-reviewed text. Any edit to the underlying copy happens
 * in `src/lib/pricing/disclosures.ts` and flows through here
 * automatically.
 */
export const PUBLIC_DISCLOSURES: DisclosureModule[] = [
  // Inherit the 5 legal-reviewed clauses from the calculator module.
  ...CALCULATOR_DISCLOSURES.map(
    (d): DisclosureModule => ({
      id: d.id,
      label: d.label,
      body: d.body,
      severity: d.severity,
      visibility: "public",
    })
  ),

  // Additional brokerage-specific disclosures that apply beyond the
  // savings calculator context.
  {
    id: "fl_brokerage_relationship",
    label: "Florida brokerage relationship",
    severity: "emphasis",
    visibility: "public",
    body:
      "As your buyer's brokerage, buyer-v2 owes you the duties of loyalty, confidentiality, obedience, full disclosure, accounting, and skill, care, and diligence required by Florida law. If a different relationship is ever proposed (e.g. transaction broker for a specific listing), we will disclose it in writing before you sign anything.",
  },
  {
    id: "dual_agency_prohibited",
    label: "No dual agency",
    severity: "info",
    visibility: "public",
    body:
      "buyer-v2 does not practice dual agency. We represent buyers only. If a listing requires dual representation, we will refer you to an independent brokerage for that specific transaction.",
  },
  {
    id: "fair_housing",
    label: "Fair housing",
    severity: "info",
    visibility: "public",
    body:
      "buyer-v2 complies with the federal Fair Housing Act and the Florida Fair Housing Act. We do not discriminate on the basis of race, color, national origin, religion, sex, familial status, disability, or any other protected class.",
  },
  {
    id: "internal_ops_notes",
    label: "Internal: ops dispatch notes",
    severity: "info",
    visibility: "internal",
    body:
      "Internal-only content used by the ops team for dispatch prioritization. Must not appear on any public surface.",
  },
];
