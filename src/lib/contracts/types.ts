/** FL FAR/BAR contract field mapping */
export interface ContractFieldMap {
  // Parties
  buyerName: string;
  buyerAddress: string;
  sellerName?: string;
  sellerAddress?: string;

  // Property
  propertyAddress: string;
  legalDescription?: string;
  county: string;
  folioNumber?: string;

  // Terms
  purchasePrice: number;
  earnestMoney: number;
  earnestMoneyHolder?: string;
  closingDate: string;
  occupancyDate?: string;

  // Financing
  financingType: "cash" | "conventional" | "fha" | "va" | "other";
  loanAmount?: number;
  interestRate?: number;

  // Contingencies
  inspectionPeriodDays: number;
  financingContingencyDays?: number;
  appraisalContingency: boolean;

  // Addenda
  leadBasedPaintDisclosure: boolean;
  hoaAddendum: boolean;
  condoAddendum: boolean;
}

/** Validation result for contract fields */
export interface FieldValidation {
  valid: boolean;
  missingFields: string[];
  warnings: string[];
}

/** Adapter run record */
export interface AdapterRun {
  offerId: string;
  status: "mapped" | "validation_failed" | "submitted" | "error";
  mappedFieldCount: number;
  missingFields: string[];
  timestamp: string;
}

/** Signature event from e-sign provider */
export interface SignatureEvent {
  contractId: string;
  event: "sent" | "viewed" | "signed" | "declined";
  signerEmail?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** Required fields for FL FAR/BAR residential contract */
export const REQUIRED_FIELDS: (keyof ContractFieldMap)[] = [
  "buyerName",
  "buyerAddress",
  "propertyAddress",
  "county",
  "purchasePrice",
  "earnestMoney",
  "closingDate",
  "financingType",
  "inspectionPeriodDays",
  "leadBasedPaintDisclosure",
];
