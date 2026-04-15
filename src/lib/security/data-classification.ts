/** Data sensitivity levels */
export type SensitivityLevel = "public" | "internal" | "confidential" | "restricted";

/** Access roles that can view this data */
export type AccessRole = "buyer" | "broker" | "admin" | "system";

/** Classification entry for a data type */
export interface DataClassification {
  name: string;
  sensitivity: SensitivityLevel;
  description: string;
  accessRoles: AccessRole[];
  piiFields: string[];
  retentionCategory: string;
  encryptionRequired: boolean;
}

/**
 * Canonical data classification catalog for buyer-v2.
 * Every data type in the system must be classified here.
 */
export const DATA_CATALOG: Record<string, DataClassification> = {
  buyerProfile: {
    name: "Buyer Profile",
    sensitivity: "confidential",
    description: "Buyer personal information, preferences, and contact details",
    accessRoles: ["buyer", "broker", "admin"],
    piiFields: ["email", "name", "phone", "address"],
    retentionCategory: "buyer_data",
    encryptionRequired: false,
  },
  financialInfo: {
    name: "Financial Information",
    sensitivity: "restricted",
    description: "Pre-approval amounts, offer prices, earnest money, closing credits",
    accessRoles: ["buyer", "broker", "admin"],
    piiFields: ["preApprovalAmount", "offerPrice", "earnestMoney"],
    retentionCategory: "financial",
    encryptionRequired: true,
  },
  agreementDocuments: {
    name: "Agreement Documents",
    sensitivity: "restricted",
    description: "Buyer agreements, tour passes, full representation agreements",
    accessRoles: ["buyer", "broker", "admin"],
    piiFields: ["signatoryName", "signatoryEmail"],
    retentionCategory: "legal_documents",
    encryptionRequired: true,
  },
  contractDocuments: {
    name: "Contract Documents",
    sensitivity: "restricted",
    description: "Purchase contracts, amendments, addenda",
    accessRoles: ["buyer", "broker", "admin"],
    piiFields: ["buyerName", "sellerName", "propertyAddress"],
    retentionCategory: "legal_documents",
    encryptionRequired: true,
  },
  communicationRecords: {
    name: "Communication Records",
    sensitivity: "confidential",
    description: "Emails, SMS, call logs between buyer and brokerage",
    accessRoles: ["buyer", "broker", "admin"],
    piiFields: ["recipientEmail", "recipientPhone", "messageBody"],
    retentionCategory: "communications",
    encryptionRequired: false,
  },
  aiEngineOutputs: {
    name: "AI Engine Outputs",
    sensitivity: "internal",
    description: "Pricing analysis, comps, leverage signals, offer scenarios",
    accessRoles: ["buyer", "broker", "admin"],
    piiFields: [],
    retentionCategory: "ai_outputs",
    encryptionRequired: false,
  },
  propertyData: {
    name: "Property Data",
    sensitivity: "public",
    description: "Normalized property records from portal extraction",
    accessRoles: ["buyer", "broker", "admin"],
    piiFields: ["listingAgentName", "listingAgentPhone"],
    retentionCategory: "property_data",
    encryptionRequired: false,
  },
  auditTrail: {
    name: "Audit Trail",
    sensitivity: "internal",
    description: "System audit log for regulated actions and approvals",
    accessRoles: ["admin"],
    piiFields: [],
    retentionCategory: "audit",
    encryptionRequired: false,
  },
  tourRecords: {
    name: "Tour Records",
    sensitivity: "confidential",
    description: "Tour schedules, agent assignments, notes",
    accessRoles: ["buyer", "broker", "admin"],
    piiFields: ["buyerName", "agentName"],
    retentionCategory: "buyer_data",
    encryptionRequired: false,
  },
  disclosurePacket: {
    name: "Disclosure Packet",
    sensitivity: "restricted",
    description:
      "Seller disclosures, inspection reports, HOA docs, and other uploaded transaction documents analyzed for red flags.",
    accessRoles: ["buyer", "broker", "admin"],
    piiFields: [
      "sellerName",
      "buyerName",
      "propertyAddress",
      "signatoryName",
      "signatoryEmail",
    ],
    retentionCategory: "legal_documents",
    encryptionRequired: true,
  },
};

/** Get all PII field names across the entire catalog */
export function getAllPiiFields(): string[] {
  const fields = new Set<string>();
  for (const entry of Object.values(DATA_CATALOG)) {
    for (const field of entry.piiFields) {
      fields.add(field);
    }
  }
  return Array.from(fields);
}
