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

/**
 * Replace PII patterns inside a string value with [REDACTED]. Operates
 * on the raw text — use this for free-text fields where the key name
 * can't reveal whether the value is safe.
 */
export function scrubPiiFromString(text: string): string {
  return text
    .replace(EMAIL_PATTERN, REDACTED)
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
