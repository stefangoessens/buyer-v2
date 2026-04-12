import {
  type AccountStepState,
  type BuyerBasicsStepState,
  type PropertyLinkageStepState,
  type StepValidationResult,
  type ValidationIssue,
} from "@/lib/onboarding/types";
import { createSearchPreviewFromUrl, isSupportedListingUrl } from "@/lib/onboarding/demo-search";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issuesResult(issues: ValidationIssue[]): StepValidationResult {
  if (issues.length === 0) {
    return { ok: true };
  }

  return { ok: false, issues };
}

export function validateAccountStep(
  state: AccountStepState,
): StepValidationResult {
  const issues: ValidationIssue[] = [];

  if (state.fullName.trim().length === 0) {
    issues.push({
      field: "fullName",
      code: "required",
      message: "Tell us who should own this buyer account.",
    });
  }

  const email = state.email.trim().toLowerCase();
  if (email.length === 0) {
    issues.push({
      field: "email",
      code: "required",
      message: "Email is required to save your deal-room access.",
    });
  } else if (!EMAIL_REGEX.test(email)) {
    issues.push({
      field: "email",
      code: "invalid_email",
      message: "Enter a valid email address.",
    });
  }

  const phoneDigits = state.phone.replace(/\D/g, "");
  if (phoneDigits.length === 0) {
    issues.push({
      field: "phone",
      code: "required",
      message: "Phone is required so your broker can follow up.",
    });
  } else if (phoneDigits.length < 10) {
    issues.push({
      field: "phone",
      code: "invalid_phone",
      message: "Enter a valid phone number.",
    });
  }

  return issuesResult(issues);
}

export function validateBuyerBasicsStep(
  state: BuyerBasicsStepState,
): StepValidationResult {
  const issues: ValidationIssue[] = [];

  if (state.budgetMin == null || state.budgetMax == null) {
    issues.push({
      field: "budget",
      code: "required",
      message: "Add your budget range so we can calibrate the analysis.",
    });
  } else if (state.budgetMin <= 0 || state.budgetMax <= state.budgetMin) {
    issues.push({
      field: "budget",
      code: "budget_range",
      message: "Budget max must be higher than budget min.",
    });
  }

  if (state.preferredAreas.trim().length === 0) {
    issues.push({
      field: "preferredAreas",
      code: "required",
      message: "Add at least one Florida area you want to watch.",
    });
  }

  return issuesResult(issues);
}

export function validatePropertyLinkageStep(
  state: PropertyLinkageStepState,
): StepValidationResult {
  const issues: ValidationIssue[] = [];

  if (state.listingUrl.trim().length === 0) {
    issues.push({
      field: "listingUrl",
      code: "required",
      message: "Paste a Zillow, Redfin, or Realtor.com listing to start.",
    });
  } else if (!isSupportedListingUrl(state.listingUrl)) {
    issues.push({
      field: "listingUrl",
      code: "invalid_listing_url",
      message: "Use a Zillow, Redfin, or Realtor.com listing URL.",
    });
  }

  if (!state.linkedSearch) {
    issues.push({
      field: "linkedSearch",
      code: "missing_linked_search",
      message: "Generate your first property analysis before continuing.",
    });
  }

  return issuesResult(issues);
}

export function buildLinkedSearch(url: string) {
  return createSearchPreviewFromUrl(url);
}

