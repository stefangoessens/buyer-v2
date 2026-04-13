import type { LegalDocument } from "@/lib/content/types";

/**
 * Legal documents for the public site (KIN-773).
 *
 * Each document is a typed `LegalDocument` with an `effectiveDate`
 * that drives the "Last updated" stamp on the rendered page. Sections
 * have individual visibility flags so internal-only clauses (review
 * notes, TODOs for legal) stay in the source file but never render
 * publicly.
 *
 * Any copy change to a legal document is a legal-review line item.
 * Bump `effectiveDate` when the substance changes, not when
 * typography is tweaked.
 */

export const TERMS_OF_SERVICE: LegalDocument = {
  id: "terms",
  slug: "terms",
  title: "Terms of Service",
  effectiveDate: "2026-04-01",
  summary:
    "These terms govern your use of buyer-v2's website, deal room, and brokerage services. By using the service you agree to these terms.",
  sections: [
    {
      id: "1_acceptance",
      heading: "1. Acceptance of these terms",
      visibility: "public",
      body:
        "By accessing buyer-v2 or engaging our brokerage services, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, do not use the service.",
    },
    {
      id: "2_eligibility",
      heading: "2. Eligibility",
      visibility: "public",
      body:
        "You must be at least 18 years old and legally able to enter into a real estate purchase contract in Florida. buyer-v2 currently serves Florida only; multi-state expansion is documented but not yet available.",
    },
    {
      id: "3_services",
      heading: "3. Description of services",
      visibility: "public",
      body:
        "buyer-v2 provides AI-assisted listing analysis, deal room collaboration tools, and licensed buyer brokerage representation for Florida residential real estate transactions. AI output is informational and never a substitute for a licensed broker's review of license-critical actions.",
    },
    {
      id: "4_commission",
      heading: "4. Compensation and buyer credit",
      visibility: "public",
      body:
        "buyer-v2's compensation is paid from the buyer-agent commission offered on the listing, as negotiated and disclosed in your buyer representation agreement. We rebate a portion of that commission to you at closing, subject to the terms of the agreement and any lender or program caps on buyer credits.",
    },
    {
      id: "5_ai_outputs",
      heading: "5. AI outputs and limitations",
      visibility: "public",
      body:
        "AI-generated analysis (pricing, comps, leverage, competitiveness) is illustrative. It is not a professional appraisal, a legal opinion, or investment advice. Every AI output includes confidence and citation information; always review it with your assigned broker before acting.",
    },
    {
      id: "6_license_critical",
      heading: "6. License-critical actions",
      visibility: "public",
      body:
        "Buyer representation agreements, compensation disclosures, contract drafting and execution, and any communication with the listing side are reviewed and performed by a licensed Florida broker. You will see every such action before it is executed.",
    },
    {
      id: "7_termination",
      heading: "7. Termination",
      visibility: "public",
      body:
        "You may stop using the service at any time. We may suspend or terminate accounts that violate these terms, attempt to defraud the service, or engage in conduct that endangers other buyers or our staff.",
    },
    {
      id: "8_disclaimer",
      heading: "8. Disclaimer and limitation of liability",
      visibility: "public",
      body:
        "Except as required by Florida real estate law, the service is provided \"as is\" without warranties of any kind. To the fullest extent permitted by law, buyer-v2's total liability for any claim arising out of the service is limited to the greater of (a) the compensation buyer-v2 actually received from a specific closed transaction that is the subject of the claim, or (b) $100.",
    },
    {
      id: "9_governing_law",
      heading: "9. Governing law",
      visibility: "public",
      body:
        "These terms are governed by the laws of the State of Florida, without regard to its conflict-of-laws principles. Any dispute is subject to the exclusive jurisdiction of the state and federal courts located in Miami-Dade County, Florida.",
    },
    {
      id: "internal_todo",
      heading: "Internal review TODO",
      visibility: "internal",
      body:
        "Reminder: legal review of sections 5 and 6 pending prior to public launch. Do not render until approved.",
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  id: "privacy",
  slug: "privacy",
  title: "Privacy Policy",
  effectiveDate: "2026-04-01",
  summary:
    "This policy explains what data buyer-v2 collects, how we use it, who we share it with, and your choices.",
  sections: [
    {
      id: "1_scope",
      heading: "1. Scope",
      visibility: "public",
      body:
        "This policy applies to personal information buyer-v2 collects when you use our website, deal room, and brokerage services.",
    },
    {
      id: "2_data_we_collect",
      heading: "2. Data we collect",
      visibility: "public",
      body:
        "We collect the listing URLs you paste, contact information you give us (name, email, phone), documents you upload to the deal room, and analytics events that measure product usage. We never sell personal data and never share it with third parties for marketing.",
    },
    {
      id: "3_how_we_use_data",
      heading: "3. How we use your data",
      visibility: "public",
      body:
        "We use personal data to provide brokerage services, analyze listings you share, match you with a licensed broker, communicate about your deal, and improve the product. AI analyses use sanitized inputs — PII is stripped before any prompt reaches an external model provider.",
    },
    {
      id: "4_sharing",
      heading: "4. Who we share data with",
      visibility: "public",
      body:
        "We share data with: (a) the licensed Florida broker assigned to your deal, (b) the showing agent who conducts any tour you book, (c) the title company and lender at closing, and (d) service providers (hosting, error tracking) under strict data processing agreements. That's the full list.",
    },
    {
      id: "5_your_choices",
      heading: "5. Your choices",
      visibility: "public",
      body:
        "You can request a copy of your personal data, ask us to correct it, or ask us to delete it (subject to legally required retention for closed transactions). Contact us at privacy@buyerv2.com.",
    },
    {
      id: "6_data_retention",
      heading: "6. Data retention",
      visibility: "public",
      body:
        "Deal-room data is retained for the lifetime of your account plus any period required by Florida real estate and tax law. Analytics events are retained for 24 months. Deletion requests are honored within 30 days except for records we are legally required to keep.",
    },
    {
      id: "7_security",
      heading: "7. Security",
      visibility: "public",
      body:
        "Data is encrypted in transit and at rest. Access to production data is limited to the engineering and brokerage staff who need it to provide the service. We never email passwords or sensitive account information.",
    },
    {
      id: "8_children",
      heading: "8. Children",
      visibility: "public",
      body:
        "buyer-v2 is not directed to children under 18 and we do not knowingly collect personal information from anyone under 18.",
    },
  ],
};

export const BROKERAGE_DISCLOSURES: LegalDocument = {
  id: "brokerage-disclosures",
  slug: "brokerage-disclosures",
  title: "Brokerage Disclosures",
  effectiveDate: "2026-04-01",
  summary:
    "Required Florida real estate disclosures that apply to every buyer-v2 transaction.",
  sections: [
    {
      id: "1_single_agency",
      heading: "1. Single agent — buyer representation",
      visibility: "public",
      body:
        "buyer-v2 operates as a single agent representing buyers only. We owe you the duties of loyalty, confidentiality, obedience, full disclosure, accounting, and skill, care, and diligence required by Florida Statutes § 475.278.",
    },
    {
      id: "2_no_dual_agency",
      heading: "2. No dual agency",
      visibility: "public",
      body:
        "buyer-v2 does not practice dual agency. If a listing would require dual representation, we will refer you to an independent brokerage for that specific transaction before proceeding.",
    },
    {
      id: "3_compensation",
      heading: "3. Compensation disclosure",
      visibility: "public",
      body:
        "Our compensation is paid from the buyer-agent commission offered on the specific listing, as negotiated and disclosed in your buyer representation agreement. We rebate a portion of that commission to you at closing. You will see the exact figures before you sign anything.",
    },
    {
      id: "4_fair_housing",
      heading: "4. Fair housing",
      visibility: "public",
      body:
        "buyer-v2 complies with the federal Fair Housing Act and the Florida Fair Housing Act. We do not discriminate on the basis of race, color, national origin, religion, sex, familial status, disability, or any other protected class.",
    },
    {
      id: "5_ai_outputs",
      heading: "5. AI-assisted analysis",
      visibility: "public",
      body:
        "AI-generated pricing, comps, and leverage analyses are informational tools. They are not professional appraisals, legal opinions, or tax advice. License-critical decisions — agreements, contract terms, compensation, and communications with the listing side — are always reviewed by a licensed Florida broker before any action is taken.",
    },
  ],
};

/**
 * Registry of every public legal document, keyed by slug. The legal
 * route template looks up the document by slug and renders it with
 * the shared `LegalDocumentTemplate`.
 */
export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {
  terms: TERMS_OF_SERVICE,
  privacy: PRIVACY_POLICY,
  "brokerage-disclosures": BROKERAGE_DISCLOSURES,
};
