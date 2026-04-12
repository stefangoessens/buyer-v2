/**
 * Manual address entry normalization and match confidence (KIN-775).
 *
 * Pure TypeScript. Used by web, internal tools, and iOS intake surfaces.
 * No Convex, no network calls, no geocoding API — that's a future-scope
 * enrichment layer. This module just cleans up user-entered strings into
 * a canonical shape and rates the match confidence against a candidate set.
 */

/** Canonical address shape used by the rest of the intake pipeline. */
export interface CanonicalAddress {
  street: string; // "123 Main St"
  unit?: string; // "4B"
  city: string;
  state: string; // "FL" (2-letter code)
  zip: string; // "33131" or "33131-1234"
  county?: string;
  formatted: string; // "123 Main St, Unit 4B, Miami, FL 33131"
}

export type AddressValidationErrorCode =
  | "missing_street"
  | "missing_city"
  | "missing_state"
  | "missing_zip"
  | "invalid_zip"
  | "invalid_state"
  | "empty_input";

export interface AddressValidationError {
  code: AddressValidationErrorCode;
  message: string;
}

export type AddressNormalizationResult =
  | { valid: true; canonical: CanonicalAddress }
  | { valid: false; errors: AddressValidationError[] };

/** Match confidence levels returned by the matcher. */
export type MatchConfidence = "exact" | "high" | "medium" | "low" | "none";

export interface AddressMatchCandidate {
  id: string; // external property ID
  canonical: CanonicalAddress;
  score?: number; // optional external score 0-1
}

export interface AddressMatchResult {
  confidence: MatchConfidence;
  /** 0-1 — numerical score for the best candidate. */
  score: number;
  /** The best matching candidate, or null if none. */
  bestMatch: AddressMatchCandidate | null;
  /** All candidates that scored above the minimum threshold, sorted desc. */
  candidates: Array<AddressMatchCandidate & { score: number }>;
  /**
   * If true, multiple candidates scored similarly high and the caller
   * should prompt the user to disambiguate.
   */
  ambiguous: boolean;
}

/**
 * US state abbreviations keyed by normalized full name. Normalization
 * accepts either 2-letter codes or full names in any case.
 */
export const US_STATES: Readonly<Record<string, string>> = Object.freeze({
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
  "PUERTO RICO": "PR",
});

/** Set of valid 2-letter state codes for quick membership checks. */
const STATE_CODES: ReadonlySet<string> = new Set(Object.values(US_STATES));

/**
 * Street suffix normalization map. Accepts common variants and returns
 * the USPS-standard short form.
 */
export const STREET_SUFFIX_MAP: Readonly<Record<string, string>> = Object.freeze({
  STREET: "St",
  ST: "St",
  AVENUE: "Ave",
  AVE: "Ave",
  BOULEVARD: "Blvd",
  BLVD: "Blvd",
  DRIVE: "Dr",
  DR: "Dr",
  ROAD: "Rd",
  RD: "Rd",
  LANE: "Ln",
  LN: "Ln",
  COURT: "Ct",
  CT: "Ct",
  CIRCLE: "Cir",
  CIR: "Cir",
  PLACE: "Pl",
  PL: "Pl",
  TERRACE: "Ter",
  TER: "Ter",
  PARKWAY: "Pkwy",
  PKWY: "Pkwy",
  HIGHWAY: "Hwy",
  HWY: "Hwy",
  TRAIL: "Trl",
  TRL: "Trl",
  WAY: "Way",
  SQUARE: "Sq",
  SQ: "Sq",
  ALLEY: "Aly",
  ALY: "Aly",
});

const ZIP_REGEX = /^\d{5}(-\d{4})?$/;

/** Normalize whitespace: collapse runs and trim. */
function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Normalize a street string: trim, collapse whitespace, and standardize
 * the final suffix token ("Street" → "St", etc.). Preserves case on
 * primary tokens, but the suffix is rewritten to USPS standard form.
 */
function normalizeStreet(value: string): string {
  const cleaned = cleanWhitespace(value);
  if (!cleaned) return "";
  const tokens = cleaned.split(" ");
  const last = tokens[tokens.length - 1];
  const lastKey = last.replace(/\.$/, "").toUpperCase();
  if (lastKey in STREET_SUFFIX_MAP) {
    tokens[tokens.length - 1] = STREET_SUFFIX_MAP[lastKey];
  }
  return tokens.join(" ");
}

/** Normalize a state token into a 2-letter code (or empty string). */
function normalizeState(value: string): string {
  const cleaned = cleanWhitespace(value).toUpperCase();
  if (!cleaned) return "";
  if (STATE_CODES.has(cleaned)) return cleaned;
  if (cleaned in US_STATES) return US_STATES[cleaned];
  return cleaned; // return the upper-cased raw so caller can flag "invalid_state"
}

/** Normalize a zip string: strip whitespace and any trailing junk. */
function normalizeZip(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

/**
 * Build a "formatted" one-line representation that matches our canonical
 * display pattern: "<street>[, Unit <unit>], <city>, <state> <zip>".
 */
function formatCanonical(
  street: string,
  unit: string | undefined,
  city: string,
  state: string,
  zip: string,
): string {
  const parts = [street];
  if (unit) parts.push(`Unit ${unit}`);
  parts.push(city);
  parts.push(`${state} ${zip}`);
  return parts.join(", ");
}

/**
 * Parse a single-line "street, city, state zip" address. Returns the
 * structured tokens, or null if we can't find the required anchors.
 *
 * Strategy: split on commas first. If that yields 3+ parts, the last
 * chunk holds "<state> <zip>"; the second to last is the city; everything
 * before that is the street. Otherwise, scan from the end of the string
 * for a trailing zip + state pair.
 */
function parseRawAddress(raw: string): {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
} | null {
  const cleaned = cleanWhitespace(raw);
  if (!cleaned) return null;

  // Try comma-separated split first — the common "paste from Google" form.
  const commaParts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (commaParts.length >= 3) {
    const tail = commaParts[commaParts.length - 1];
    const tailMatch = tail.match(/^([A-Za-z.\s]+?)\s+(\d{5}(?:-\d{4})?)$/);
    if (tailMatch) {
      const state = tailMatch[1].trim();
      const zip = tailMatch[2];
      const city = commaParts[commaParts.length - 2];
      // Street may include unit via further comma splits — join any
      // leading chunks with ", " so "123 Main St, Apt 4B, Miami, FL 33131"
      // keeps the apartment piece with the street.
      const streetChunks = commaParts.slice(0, commaParts.length - 2);
      const streetJoined = streetChunks.join(", ");
      const { street, unit } = extractUnit(streetJoined);
      return { street, unit, city, state, zip };
    }
  }

  // Fallback: single-string regex over the whole cleaned form.
  // Look for trailing zip and the two-letter or full-name state directly before it.
  const tailRegex = /^(.+?)[\s,]+([A-Za-z][A-Za-z.\s]*?)\s+(\d{5}(?:-\d{4})?)$/;
  const tailMatch = cleaned.match(tailRegex);
  if (!tailMatch) return null;

  const beforeState = tailMatch[1].trim();
  const state = tailMatch[2].trim();
  const zip = tailMatch[3];

  // Walk back from beforeState to peel a city off. We expect the city to
  // be the last 1-3 word chunk before the state; split on comma if present.
  const beforeParts = beforeState
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (beforeParts.length === 0) return null;

  let city: string;
  let streetJoined: string;
  if (beforeParts.length >= 2) {
    city = beforeParts[beforeParts.length - 1];
    streetJoined = beforeParts.slice(0, -1).join(", ");
  } else {
    // No comma between street and city — split on whitespace and assume
    // the last 1-2 tokens are the city. This is lossy and covers the
    // "123 Main St Miami FL 33131" free-form case.
    const words = beforeParts[0].split(" ");
    if (words.length < 3) return null;
    city = words[words.length - 1];
    streetJoined = words.slice(0, -1).join(" ");
  }

  const { street, unit } = extractUnit(streetJoined);
  return { street, unit, city, state, zip };
}

/**
 * Extract an optional "Unit/Apt/Suite" token out of a street string.
 * Returns the cleaned street without the unit and the unit value.
 */
function extractUnit(street: string): { street: string; unit?: string } {
  const cleaned = cleanWhitespace(street);
  // Common unit markers: "Unit 4B", "Apt 4B", "Suite 300", "# 4B", "#4B"
  const unitRegex = /[,\s](?:Unit|Apt|Apartment|Suite|Ste|#)\s*([A-Za-z0-9-]+)$/i;
  const match = cleaned.match(unitRegex);
  if (!match) return { street: cleaned };
  const unit = match[1];
  const streetOnly = cleaned.slice(0, match.index).replace(/[,\s]+$/, "");
  return { street: streetOnly, unit };
}

/**
 * Normalize a free-form user-entered address into the canonical shape.
 * Accepts either a structured input or a single string.
 */
export function normalizeAddress(
  input:
    | {
        street: string;
        unit?: string;
        city: string;
        state: string;
        zip: string;
        county?: string;
      }
    | { raw: string },
): AddressNormalizationResult {
  let street: string;
  let unit: string | undefined;
  let city: string;
  let rawState: string;
  let zip: string;
  let county: string | undefined;

  if ("raw" in input) {
    const raw = (input.raw ?? "").trim();
    if (!raw) {
      return {
        valid: false,
        errors: [
          {
            code: "empty_input",
            message: "Address input is empty",
          },
        ],
      };
    }
    const parsed = parseRawAddress(raw);
    if (!parsed) {
      // Can't split into parts — report each missing required field so the
      // caller can show an inline form.
      return {
        valid: false,
        errors: [
          {
            code: "missing_street",
            message: "Could not identify the street portion of the address",
          },
          {
            code: "missing_city",
            message: "Could not identify the city portion of the address",
          },
          {
            code: "missing_state",
            message: "Could not identify the state portion of the address",
          },
          {
            code: "missing_zip",
            message: "Could not identify the ZIP portion of the address",
          },
        ],
      };
    }
    street = parsed.street;
    unit = parsed.unit;
    city = parsed.city;
    rawState = parsed.state;
    zip = parsed.zip;
  } else {
    street = input.street ?? "";
    unit = input.unit;
    city = input.city ?? "";
    rawState = input.state ?? "";
    zip = input.zip ?? "";
    county = input.county;
  }

  const errors: AddressValidationError[] = [];

  const streetNorm = normalizeStreet(street);
  const unitNorm = unit ? cleanWhitespace(unit) : undefined;
  const cityNorm = cleanWhitespace(city);
  const stateNorm = normalizeState(rawState);
  const zipNorm = normalizeZip(zip);
  const countyNorm = county ? cleanWhitespace(county) : undefined;

  if (!streetNorm) {
    errors.push({
      code: "missing_street",
      message: "Street is required",
    });
  }
  if (!cityNorm) {
    errors.push({
      code: "missing_city",
      message: "City is required",
    });
  }
  if (!stateNorm) {
    errors.push({
      code: "missing_state",
      message: "State is required",
    });
  } else if (!STATE_CODES.has(stateNorm)) {
    errors.push({
      code: "invalid_state",
      message: `"${rawState}" is not a recognized US state`,
    });
  }
  if (!zipNorm) {
    errors.push({
      code: "missing_zip",
      message: "ZIP is required",
    });
  } else if (!ZIP_REGEX.test(zipNorm)) {
    errors.push({
      code: "invalid_zip",
      message: `"${zip}" is not a valid US ZIP code`,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const canonical: CanonicalAddress = {
    street: streetNorm,
    unit: unitNorm && unitNorm.length > 0 ? unitNorm : undefined,
    city: cityNorm,
    state: stateNorm,
    zip: zipNorm,
    county: countyNorm,
    formatted: formatCanonical(
      streetNorm,
      unitNorm && unitNorm.length > 0 ? unitNorm : undefined,
      cityNorm,
      stateNorm,
      zipNorm,
    ),
  };

  return { valid: true, canonical };
}

/** Normalize a street for comparison only — lowercase, no punctuation. */
function compareStreet(value: string): string {
  return normalizeStreet(value)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First 5 digits of a zip for comparison ("33131-1234" → "33131"). */
function zipBase(value: string): string {
  return value.slice(0, 5);
}

/** Build a single numerical score 0-1 comparing two canonical addresses. */
function scoreCandidate(
  subject: CanonicalAddress,
  candidate: CanonicalAddress,
): number {
  let score = 0;

  if (
    compareStreet(subject.street) &&
    compareStreet(subject.street) === compareStreet(candidate.street)
  ) {
    score += 0.5;
  }

  if (
    subject.city &&
    subject.city.toLowerCase() === candidate.city.toLowerCase()
  ) {
    score += 0.15;
  }

  if (
    subject.state &&
    subject.state.toUpperCase() === candidate.state.toUpperCase()
  ) {
    score += 0.15;
  }

  if (subject.zip && zipBase(subject.zip) === zipBase(candidate.zip)) {
    score += 0.15;
  }

  const subjectUnit = subject.unit?.toLowerCase() ?? "";
  const candidateUnit = candidate.unit?.toLowerCase() ?? "";
  if (subjectUnit === candidateUnit) {
    score += 0.05;
  }

  // Clamp to [0, 1] — protects against any future additive changes.
  return Math.min(1, Math.max(0, Number(score.toFixed(4))));
}

/** Map a raw score to a confidence bucket. */
function confidenceFor(score: number): MatchConfidence {
  if (score >= 1) return "exact";
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "medium";
  if (score >= 0.4) return "low";
  return "none";
}

/**
 * Compute a match confidence between a canonical address and a set of
 * candidate addresses (from the properties table). Returns the best
 * match plus ambiguity metadata so the caller can prompt for disambig.
 */
export function matchAddress(
  subject: CanonicalAddress,
  candidates: AddressMatchCandidate[],
): AddressMatchResult {
  if (candidates.length === 0) {
    return {
      confidence: "none",
      score: 0,
      bestMatch: null,
      candidates: [],
      ambiguous: false,
    };
  }

  const scored = candidates
    .map((c) => ({
      ...c,
      score: scoreCandidate(subject, c.canonical),
    }))
    .sort((a, b) => b.score - a.score);

  // Drop candidates below the lowest confidence floor (0.4) — they're
  // neither useful matches nor meaningful ambiguity signals.
  const aboveFloor = scored.filter((c) => c.score >= 0.4);

  if (aboveFloor.length === 0) {
    // Still return the best (even if it's "none") so the caller can show
    // "closest match" UI if they want to.
    const best = scored[0];
    return {
      confidence: "none",
      score: best.score,
      bestMatch: {
        id: best.id,
        canonical: best.canonical,
        score: best.score,
      },
      candidates: [],
      ambiguous: false,
    };
  }

  const best = aboveFloor[0];
  const confidence = confidenceFor(best.score);

  // Ambiguous: 2+ candidates within 0.05 of the top score. We only flag
  // it if the best isn't already "exact" — an exact match resolves
  // disambiguation on its own.
  const ambiguous =
    confidence !== "exact" &&
    aboveFloor.filter((c) => best.score - c.score <= 0.05).length >= 2;

  return {
    confidence,
    score: best.score,
    bestMatch: {
      id: best.id,
      canonical: best.canonical,
      score: best.score,
    },
    candidates: aboveFloor,
    ambiguous,
  };
}
