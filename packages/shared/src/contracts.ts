export const portalPlatforms = [
  "zillow",
  "redfin",
  "realtor",
  "manual",
] as const;

export type SourcePlatform = (typeof portalPlatforms)[number];

export const dealStatuses = [
  "intake",
  "analysis",
  "tour_scheduled",
  "offer_prep",
  "offer_sent",
  "under_contract",
  "closing",
  "closed",
  "withdrawn",
] as const;

/** Status of a deal in the buyer-v2 pipeline */
export type DealStatus = (typeof dealStatuses)[number];

export const aiReviewStates = ["pending", "approved", "rejected"] as const;

export type AIReviewState = (typeof aiReviewStates)[number];

export type FinancingType =
  | "cash"
  | "conventional"
  | "fha"
  | "va"
  | "other";

export interface PropertyAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
}

/** Normalized property record — system of record */
export interface PropertyRecord {
  id: string;
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  address: PropertyAddress;
  listPrice?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  mlsNumber?: string;
  extractedAt: string;
}

/** AI engine output metadata — every engine must include this */
export interface AIEngineOutput {
  confidence: number;
  citations: string[];
  reviewState: AIReviewState;
  generatedAt: string;
  modelId: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Florida contract adapter
// ───────────────────────────────────────────────────────────────────────────

export const CONTRACT_PROVIDER = "form_simplicity" as const;
export const CONTRACT_SIGNATURE_PROVIDER = "sabal_sign" as const;
export const FLORIDA_FAR_BAR_TEMPLATE_KEY =
  "fl_far_bar_residential_purchase" as const;
export const FLORIDA_FAR_BAR_TEMPLATE_VERSION = "2026-01" as const;

export type ContractProvider = typeof CONTRACT_PROVIDER;
export type ContractSignatureProvider = typeof CONTRACT_SIGNATURE_PROVIDER;

export const floridaContractFormKeys = [
  "fl_far_bar_residential_contract",
  "fl_condominium_rider",
  "fl_homeowners_association_addendum",
  "fl_lead_based_paint_disclosure",
] as const;

export type FloridaContractFormKey =
  (typeof floridaContractFormKeys)[number];

export const floridaContractFieldKeys = [
  "streetAddress",
  "City",
  "State",
  "Zip",
  "countyName",
  "countyParcel",
  "legalDescription",
  "Subdivision",
  "yearBuilt",
  "propertyType",
  "listingPrice",
  "associationFees",
  "purchasePrice",
  "purchaseAgreementDate",
  "earnestMoneyDueDate",
  "dueDiligenceDate",
  "earnestMoney",
  "projectedClosingDate",
  "buyerParty1Name",
  "buyerParty1Address",
  "buyerParty1Email",
  "buyerParty1CellPhone",
  "sellerParty1Name",
  "sellerParty1Address",
  "sellerParty1Email",
  "sellerAgentName",
  "sellerBrokerageName",
] as const;

export type FloridaContractFieldKey =
  (typeof floridaContractFieldKeys)[number];

export type FloridaContractFieldValue = string | number | boolean;
export type FloridaContractFieldMap = Partial<
  Record<FloridaContractFieldKey, FloridaContractFieldValue>
>;

export const requiredFloridaContractFields = [
  "streetAddress",
  "City",
  "State",
  "Zip",
  "countyName",
  "purchasePrice",
  "purchaseAgreementDate",
  "earnestMoney",
  "projectedClosingDate",
  "buyerParty1Name",
  "buyerParty1Email",
] as const satisfies ReadonlyArray<FloridaContractFieldKey>;

export interface ContractPartyInput {
  fullName?: string;
  email?: string;
  phone?: string;
  mailingAddress?: string;
}

export interface ContractBrokerInput {
  fullName?: string;
  email?: string;
  phone?: string;
  brokerageName?: string;
  nrdsId?: string;
}

export interface ApprovedOfferContractSource {
  dealRoomId: string;
  offerId: string;
  propertyId: string;
  offerStatus: "approved" | "accepted";
  approvedAt?: string;
  purchasePrice: number;
  earnestMoney?: number;
  closingDate?: string;
  contingencies: string[];
  buyerCredits?: number;
  sellerCredits?: number;
  financingType?: FinancingType;
  property: {
    street?: string;
    unit?: string;
    city?: string;
    state?: string;
    zip?: string;
    county?: string;
    folioNumber?: string;
    legalDescription?: string;
    subdivision?: string;
    yearBuilt?: number;
    listPrice?: number;
    hoaFee?: number;
    propertyType?: string;
    listingAgentName?: string;
    listingBrokerage?: string;
  };
  buyer: ContractPartyInput;
  seller?: ContractPartyInput;
  buyerBroker?: ContractBrokerInput;
}

export interface ContractAdapterMissingField {
  field: string;
  label: string;
  reason: string;
}

export interface ContractAdapterWarning {
  code: string;
  message: string;
}

export interface ContractFormSelection {
  formKey: FloridaContractFormKey;
  required: boolean;
  reason: string;
}

export interface FormSimplicityAddTransactionRequest {
  transName: string;
  streetAddress: string;
  propertyType: "R" | "C" | "V" | "F";
  transactionType: "P";
  propertyStatus: "N" | "A" | "P" | "X" | "W" | "R";
}

export interface SabalSignatureRecipient {
  role: "buyer" | "broker";
  name: string;
  email: string;
}

export interface SabalSignatureRequest {
  packageName: string;
  recipients: SabalSignatureRecipient[];
}

export interface ContractAdapterResult {
  templateKey: typeof FLORIDA_FAR_BAR_TEMPLATE_KEY;
  templateVersion: typeof FLORIDA_FAR_BAR_TEMPLATE_VERSION;
  provider: ContractProvider;
  signatureProvider: ContractSignatureProvider;
  status: "ready" | "missing_fields";
  forms: ContractFormSelection[];
  fieldMap: FloridaContractFieldMap;
  missingFields: ContractAdapterMissingField[];
  warnings: ContractAdapterWarning[];
  formSimplicity: {
    addTransaction: FormSimplicityAddTransactionRequest;
    fieldMap: FloridaContractFieldMap;
  };
  sabalSign: SabalSignatureRequest;
}

export interface LegacyFieldValidation {
  valid: boolean;
  missingFields: string[];
  warnings: string[];
}

export interface LegacyAdapterRun {
  offerId: string;
  status: "mapped" | "validation_failed" | "submitted" | "error";
  mappedFieldCount: number;
  missingFields: string[];
  timestamp: string;
}

function isoDate(input: string | undefined, fallback: string): string {
  return (input ?? fallback).slice(0, 10);
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function joinAddress(
  street: string | undefined,
  unit: string | undefined,
  city: string | undefined,
  state: string | undefined,
  zip: string | undefined,
): string {
  const streetLine = [street, unit].filter(Boolean).join(" ").trim();
  const locality = [city, state].filter(Boolean).join(", ");
  const trailing = [locality, zip].filter(Boolean).join(" ")
    .trim();
  return [streetLine, trailing]
    .filter(Boolean)
    .join(", ");
}

function normalizePropertyType(
  propertyType: string | undefined,
): "R" | "C" | "V" | "F" {
  const normalized = propertyType?.toLowerCase() ?? "";
  if (normalized.includes("commercial")) return "C";
  if (normalized.includes("vacant") || normalized.includes("land")) return "V";
  if (normalized.includes("farm") || normalized.includes("ranch")) return "F";
  return "R";
}

function inferPropertyStatusCode(): "N" {
  return "N";
}

function requiredFieldLabel(
  field: string,
): string {
  switch (field) {
    case "streetAddress":
      return "Property street address";
    case "City":
      return "Property city";
    case "State":
      return "Property state";
    case "Zip":
      return "Property ZIP code";
    case "countyName":
      return "Property county";
    case "purchasePrice":
      return "Purchase price";
    case "purchaseAgreementDate":
      return "Agreement date";
    case "earnestMoney":
      return "Earnest money";
    case "projectedClosingDate":
      return "Projected closing date";
    case "buyerParty1Name":
      return "Buyer name";
    case "buyerParty1Email":
      return "Buyer email";
    default:
      return field;
  }
}

function buildMissingField(
  field: string,
  reason: string,
): ContractAdapterMissingField {
  return {
    field,
    label: requiredFieldLabel(field),
    reason,
  };
}

function determineForms(
  source: ApprovedOfferContractSource,
): ContractFormSelection[] {
  const forms: ContractFormSelection[] = [
    {
      formKey: "fl_far_bar_residential_contract",
      required: true,
      reason: "Primary FAR/BAR residential purchase contract.",
    },
  ];

  const propertyType = source.property.propertyType?.toLowerCase() ?? "";
  if (propertyType.includes("condo")) {
    forms.push({
      formKey: "fl_condominium_rider",
      required: true,
      reason: "Condominium transaction detected from property type.",
    });
  }

  if ((source.property.hoaFee ?? 0) > 0) {
    forms.push({
      formKey: "fl_homeowners_association_addendum",
      required: true,
      reason: "Association fees present on the property record.",
    });
  }

  if (
    typeof source.property.yearBuilt === "number" &&
    source.property.yearBuilt < 1978
  ) {
    forms.push({
      formKey: "fl_lead_based_paint_disclosure",
      required: true,
      reason: "Property year built is before 1978.",
    });
  }

  return forms;
}

export function mapApprovedOfferToFloridaContract(
  source: ApprovedOfferContractSource,
  nowIso: string = new Date().toISOString(),
): ContractAdapterResult {
  const agreementDate = isoDate(source.approvedAt, nowIso);
  const closingDate = isoDate(
    source.closingDate,
    addDays(agreementDate, 30),
  );
  const dueDiligenceDate = source.contingencies.includes("inspection")
    ? addDays(agreementDate, 15)
    : addDays(agreementDate, 5);
  const earnestMoneyDueDate = addDays(agreementDate, 3);
  const inferredFinancingType: FinancingType =
    source.financingType ??
    (source.contingencies.includes("financing") ? "conventional" : "cash");
  const address = joinAddress(
    source.property.street,
    source.property.unit,
    source.property.city,
    source.property.state,
    source.property.zip,
  );

  const fieldMap: FloridaContractFieldMap = {
    streetAddress: source.property.street,
    City: source.property.city,
    State: source.property.state,
    Zip: source.property.zip,
    countyName: source.property.county,
    countyParcel: source.property.folioNumber,
    legalDescription: source.property.legalDescription,
    Subdivision: source.property.subdivision,
    yearBuilt: source.property.yearBuilt,
    propertyType: source.property.propertyType,
    listingPrice: source.property.listPrice,
    associationFees: source.property.hoaFee,
    purchasePrice: source.purchasePrice,
    purchaseAgreementDate: agreementDate,
    earnestMoneyDueDate,
    dueDiligenceDate,
    earnestMoney:
      source.earnestMoney ?? Math.max(1000, Math.round(source.purchasePrice * 0.01)),
    projectedClosingDate: closingDate,
    buyerParty1Name: source.buyer.fullName,
    buyerParty1Address: source.buyer.mailingAddress,
    buyerParty1Email: source.buyer.email,
    buyerParty1CellPhone: source.buyer.phone,
    sellerParty1Name: source.seller?.fullName,
    sellerParty1Address: source.seller?.mailingAddress,
    sellerParty1Email: source.seller?.email,
    sellerAgentName: source.property.listingAgentName,
    sellerBrokerageName: source.property.listingBrokerage,
  };

  const missingFields: ContractAdapterMissingField[] = [];

  for (const field of requiredFloridaContractFields) {
    const value = fieldMap[field];
    if (value === undefined || value === null || value === "") {
      missingFields.push(
        buildMissingField(field, "Field is required before contract handoff."),
      );
    }
  }

  if (!address) {
    missingFields.push(
      buildMissingField(
        "streetAddress",
        "Property address is incomplete and cannot be handed off.",
      ),
    );
  }

  if (source.purchasePrice <= 0) {
    missingFields.push(
      buildMissingField(
        "purchasePrice",
        "Purchase price must be greater than zero.",
      ),
    );
  }

  if (
    source.property.yearBuilt === undefined &&
    normalizePropertyType(source.property.propertyType) === "R"
  ) {
    missingFields.push(
      buildMissingField(
        "yearBuilt",
        "Year built is required to determine whether lead-based paint disclosure applies.",
      ),
    );
  }

  const warnings: ContractAdapterWarning[] = [];
  if (!source.buyer.phone) {
    warnings.push({
      code: "buyer_phone_missing",
      message:
        "Buyer phone is missing; Form Simplicity can proceed, but signature reminders may be weaker.",
    });
  }
  if (
    inferredFinancingType !== "cash" &&
    !source.contingencies.includes("financing")
  ) {
    warnings.push({
      code: "financing_type_without_contingency",
      message:
        "Financing type is set but the offer contingencies do not include financing.",
    });
  }
  if (!source.seller?.fullName) {
    warnings.push({
      code: "seller_name_missing",
      message:
        "Seller party data is not currently populated in buyer-v2 and may need ops follow-up inside Form Simplicity.",
    });
  }

  const forms = determineForms(source);
  const packageName = `${address || source.propertyId} • ${source.buyer.fullName ?? "Buyer"} • ${agreementDate}`;
  const recipients: SabalSignatureRecipient[] = [];
  if (source.buyer.fullName && source.buyer.email) {
    recipients.push({
      role: "buyer",
      name: source.buyer.fullName,
      email: source.buyer.email,
    });
  }
  if (source.buyerBroker?.fullName && source.buyerBroker.email) {
    recipients.push({
      role: "broker",
      name: source.buyerBroker.fullName,
      email: source.buyerBroker.email,
    });
  }

  return {
    templateKey: FLORIDA_FAR_BAR_TEMPLATE_KEY,
    templateVersion: FLORIDA_FAR_BAR_TEMPLATE_VERSION,
    provider: CONTRACT_PROVIDER,
    signatureProvider: CONTRACT_SIGNATURE_PROVIDER,
    status: missingFields.length === 0 ? "ready" : "missing_fields",
    forms,
    fieldMap,
    missingFields,
    warnings,
    formSimplicity: {
      addTransaction: {
        transName: packageName,
        streetAddress: source.property.street ?? address,
        propertyType: normalizePropertyType(source.property.propertyType),
        transactionType: "P",
        propertyStatus: inferPropertyStatusCode(),
      },
      fieldMap,
    },
    sabalSign: {
      packageName,
      recipients,
    },
  };
}

export function validateFloridaContractFields(
  fields: FloridaContractFieldMap,
): LegacyFieldValidation {
  const missingFields: string[] = [];
  for (const field of requiredFloridaContractFields) {
    const value = fields[field];
    if (value === undefined || value === null || value === "") {
      missingFields.push(field);
    }
  }

  const warnings: string[] = [];
  const earnestMoney = fields.earnestMoney;
  const purchasePrice = fields.purchasePrice;
  if (typeof earnestMoney === "number" && earnestMoney <= 0) {
    warnings.push("Earnest money is $0 — unusual for FL transactions");
  }
  if (
    typeof earnestMoney === "number" &&
    typeof purchasePrice === "number" &&
    earnestMoney > purchasePrice * 0.1
  ) {
    warnings.push("Earnest money above 10% is unusual for FL transactions");
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

export function createLegacyAdapterRun(
  offerId: string,
  fields: FloridaContractFieldMap,
  validation: LegacyFieldValidation,
  timestamp: string = new Date().toISOString(),
): LegacyAdapterRun {
  return {
    offerId,
    status: validation.valid ? "mapped" : "validation_failed",
    mappedFieldCount: Object.values(fields).filter((value) => value !== undefined)
      .length,
    missingFields: validation.missingFields,
    timestamp,
  };
}
