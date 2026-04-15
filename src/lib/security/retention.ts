/** Retention period for a data category */
export interface RetentionPolicy {
  category: string;
  description: string;
  retentionDays: number | "permanent";
  softDeleteFirst: boolean;
  legalBasis: string;
}

export const RETENTION_POLICIES: Record<string, RetentionPolicy> = {
  buyer_data: {
    category: "Buyer Data",
    description: "Profiles, mutable preference state, tour records",
    retentionDays: 1095, // 3 years
    softDeleteFirst: true,
    legalBasis: "Business relationship + CCPA compliance",
  },
  financial: {
    category: "Financial Records",
    description: "Pre-approvals, offer amounts, closing credits",
    retentionDays: 2555, // 7 years (IRS requirement)
    softDeleteFirst: true,
    legalBasis: "IRS record retention requirement",
  },
  legal_documents: {
    category: "Legal Documents",
    description: "Agreements, contracts, signatures",
    retentionDays: 2555, // 7 years
    softDeleteFirst: true,
    legalBasis: "FL real estate record retention + statute of limitations",
  },
  communications: {
    category: "Communications",
    description: "Email, SMS, call logs",
    retentionDays: 1095, // 3 years
    softDeleteFirst: true,
    legalBasis: "Business records + potential dispute resolution",
  },
  ai_outputs: {
    category: "AI Engine Outputs",
    description: "Analysis results, pricing, comps",
    retentionDays: 365, // 1 year
    softDeleteFirst: false,
    legalBasis: "Auditable AI requirement — confidence + citations retained",
  },
  property_data: {
    category: "Property Data",
    description: "Normalized property records",
    retentionDays: 1825, // 5 years
    softDeleteFirst: false,
    legalBasis: "Market data historical reference",
  },
  audit: {
    category: "Audit Trail",
    description:
      "Regulated action audit log, including preference-change before/after history",
    retentionDays: "permanent",
    softDeleteFirst: false,
    legalBasis: "Compliance audit trail — never delete",
  },
};

/** Check if a record is past its retention period */
export function isPastRetention(
  category: string,
  createdAt: Date
): boolean {
  const policy = RETENTION_POLICIES[category];
  if (!policy || policy.retentionDays === "permanent") return false;

  const retentionEnd = new Date(createdAt);
  retentionEnd.setDate(retentionEnd.getDate() + policy.retentionDays);
  return new Date() > retentionEnd;
}
