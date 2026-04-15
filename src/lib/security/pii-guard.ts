import { getAllPiiFields } from "./data-classification";

const PII_FIELD_PATTERNS = [
  "email", "phone", "name", "address", "ssn", "socialSecurity",
  "dob", "dateOfBirth", "birthDate", "creditCard", "bankAccount",
  "password", "secret", "token", "apiKey", "authSubject",
  "preApprovalAmount", "income", "salary",
];

const REDACTED = "[REDACTED]";

/**
 * Recursively strip PII fields from an object.
 * Use before sending data to Sentry, PostHog, or any external sink.
 */
export function stripPii<T extends Record<string, unknown>>(
  obj: T,
  additionalFields: string[] = []
): T {
  const piiFields = new Set([
    ...PII_FIELD_PATTERNS,
    ...getAllPiiFields(),
    ...additionalFields,
  ]);

  return deepStripFields(obj, piiFields) as T;
}

function deepStripFields(
  value: unknown,
  piiFields: Set<string>
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => deepStripFields(item, piiFields));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const keyLower = key.toLowerCase();
    if (piiFields.has(key) || piiFields.has(keyLower) ||
        PII_FIELD_PATTERNS.some((pattern) => keyLower.includes(pattern.toLowerCase()))) {
      result[key] = REDACTED;
    } else if (typeof val === "object" && val !== null) {
      result[key] = deepStripFields(val, piiFields);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Check if a string likely contains PII (email, phone patterns).
 * Use as a safety check before logging free-text fields.
 */
export function containsPii(text: string): boolean {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const phonePattern = /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/;
  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/;

  return emailPattern.test(text) || phonePattern.test(text) || ssnPattern.test(text);
}

// PII patterns for value-level scrubbing. These run on free-text fields
// where the field name alone can't catch PII — e.g., error messages or
// user-entered reason text that might contain an email or phone number.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

// KIN-1078 — disclosure-specific patterns. Added after the general
// set so existing behavior (email/phone/SSN) is unchanged; these only
// trigger on free-text OCR output from seller disclosures.
//
// FL driver license is stored on the license as 1 letter + 12 digits
// grouped as L###-###-##-###-#. Seller disclosure forms occasionally
// echo the DL number in the identity section.
const FL_DL_PATTERN =
  /\b[A-Z]\d{3}-?\d{3}-?\d{2}-?\d{3}-?\d\b/g;
const FL_DL_REDACTED = "[FL-DL]";

// Bank / escrow account numbers typically appear alongside the word
// "Account". Match a 9–17 digit run within ~24 chars of "account" or
// "acct" (case insensitive). The lookbehind keeps us from wiping any
// long numeric string — only those adjacent to the keyword.
const BANK_ACCT_PATTERN =
  /\b(acc(?:ount|t)\.?\s*(?:number|#|no\.?)?[:\s]*)(\d{9,17})\b/gi;
const BANK_ACCT_REDACTED = "$1[ACCT]";

// Date of birth patterns near DOB / "Date of Birth" / "Born" keywords.
// Matches MM/DD/YYYY, MM-DD-YYYY, or "Month DD, YYYY" forms that
// follow the keyword within ~16 chars.
const DOB_PATTERN =
  /\b(dob|date\s*of\s*birth|born)\b[:\s]*((?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*\d{4}))/gi;
const DOB_REDACTED = "$1 [DOB]";

/**
 * Replace PII patterns inside a string value with [REDACTED]. Operates
 * on the raw text — use this for free-text fields where the key name
 * can't reveal whether the value is safe.
 *
 * Ordering note: the BANK_ACCT and FL_DL patterns run BEFORE PHONE
 * because the generic 10-digit phone regex would otherwise consume
 * the leading digits of a longer account or DL number and leave a
 * nonsensical tail. Email still runs first because it's the only
 * pattern that cares about the @ boundary.
 */
export function scrubPiiFromString(text: string): string {
  return text
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(FL_DL_PATTERN, FL_DL_REDACTED)
    .replace(BANK_ACCT_PATTERN, BANK_ACCT_REDACTED)
    .replace(DOB_PATTERN, DOB_REDACTED)
    .replace(PHONE_PATTERN, REDACTED)
    .replace(SSN_PATTERN, REDACTED);
}

/**
 * Recursively strip PII from an object using BOTH field-name redaction
 * (like stripPii) AND value-level scrubbing on string values (like
 * scrubPiiFromString). Use this for any payload that contains free-text
 * fields — analytics events with error messages, user-entered reasons,
 * or parsed document content.
 */
export function deepScrubPii<T extends Record<string, unknown>>(
  obj: T,
  additionalFields: string[] = [],
): T {
  const piiFields = new Set([
    ...PII_FIELD_PATTERNS,
    ...getAllPiiFields(),
    ...additionalFields,
  ]);

  return deepScrubValue(obj, piiFields) as T;
}

function deepScrubValue(
  value: unknown,
  piiFields: Set<string>,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubPiiFromString(value);
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => deepScrubValue(item, piiFields));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const keyLower = key.toLowerCase();
    if (
      piiFields.has(key) ||
      piiFields.has(keyLower) ||
      PII_FIELD_PATTERNS.some((pattern) =>
        keyLower.includes(pattern.toLowerCase()),
      )
    ) {
      result[key] = REDACTED;
    } else if (typeof val === "string") {
      result[key] = scrubPiiFromString(val);
    } else if (typeof val === "object" && val !== null) {
      result[key] = deepScrubValue(val, piiFields);
    } else {
      result[key] = val;
    }
  }
  return result;
}
