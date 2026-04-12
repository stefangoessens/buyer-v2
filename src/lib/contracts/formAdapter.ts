import type { ContractFieldMap, FieldValidation, AdapterRun } from "./types";
import { REQUIRED_FIELDS } from "./types";

interface OfferData {
  offerPrice: number;
  earnestMoney?: number;
  closingDate?: string;
  contingencies?: string[];
  buyerCredits?: number;
}

interface PropertyData {
  address: { street: string; city: string; state: string; zip: string; county?: string; formatted?: string };
  folioNumber?: string;
  hoaFee?: number;
  propertyType?: string;
}

interface BuyerData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  financingType?: string;
}

/**
 * Map approved offer + property + buyer data into FL FAR/BAR contract fields.
 */
export function mapOfferToContractFields(
  offer: OfferData,
  property: PropertyData,
  buyer: BuyerData
): ContractFieldMap {
  const hasInspection = offer.contingencies?.includes("inspection") ?? true;
  const hasFinancing = offer.contingencies?.includes("financing") ?? false;
  const hasAppraisal = offer.contingencies?.includes("appraisal") ?? false;

  return {
    buyerName: buyer.name,
    buyerAddress: buyer.address ?? "",
    propertyAddress: property.address.formatted ?? `${property.address.street}, ${property.address.city}, ${property.address.state} ${property.address.zip}`,
    county: property.address.county ?? "",
    folioNumber: property.folioNumber,
    purchasePrice: offer.offerPrice,
    earnestMoney: offer.earnestMoney ?? Math.round(offer.offerPrice * 0.01),
    closingDate: offer.closingDate ?? new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    financingType: (buyer.financingType as ContractFieldMap["financingType"]) ?? "conventional",
    inspectionPeriodDays: hasInspection ? 15 : 0,
    financingContingencyDays: hasFinancing ? 30 : undefined,
    appraisalContingency: hasAppraisal,
    leadBasedPaintDisclosure: true, // Required for all pre-1978 properties
    hoaAddendum: (property.hoaFee ?? 0) > 0,
    condoAddendum: property.propertyType?.toLowerCase() === "condo",
  };
}

/**
 * Validate contract fields against FL FAR/BAR requirements.
 */
export function validateContractFields(fields: ContractFieldMap): FieldValidation {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = fields[field];
    if (value === undefined || value === null || value === "") {
      missingFields.push(field);
    }
  }

  if (fields.purchasePrice <= 0) {
    missingFields.push("purchasePrice (must be > 0)");
  }

  if (fields.earnestMoney <= 0) {
    warnings.push("Earnest money is $0 — unusual for FL transactions");
  }

  if (fields.financingType !== "cash" && !fields.loanAmount) {
    warnings.push("Loan amount not specified for financed purchase");
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

/**
 * Create an adapter run record.
 */
export function createAdapterRun(
  offerId: string,
  fields: ContractFieldMap,
  validation: FieldValidation
): AdapterRun {
  return {
    offerId,
    status: validation.valid ? "mapped" : "validation_failed",
    mappedFieldCount: Object.keys(fields).filter((k) => fields[k as keyof ContractFieldMap] !== undefined).length,
    missingFields: validation.missingFields,
    timestamp: new Date().toISOString(),
  };
}
