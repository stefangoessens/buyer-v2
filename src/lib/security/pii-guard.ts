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
