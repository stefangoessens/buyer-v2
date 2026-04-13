/**
 * Convex-side mirror of src/lib/intake/address.ts (KIN-775).
 *
 * This file is an in-sync duplicate so Convex server mutations can run the
 * same normalization + match logic without a cross-bundle import. Keep the
 * two copies aligned whenever one changes.
 */

export interface CanonicalAddress {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  formatted: string;
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

export type MatchConfidence = "exact" | "high" | "medium" | "low" | "none";

export interface AddressMatchCandidate {
  id: string;
  canonical: CanonicalAddress;
  score?: number;
}

export interface AddressMatchResult {
  confidence: MatchConfidence;
  score: number;
  bestMatch: AddressMatchCandidate | null;
  candidates: Array<AddressMatchCandidate & { score: number }>;
  ambiguous: boolean;
}

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

const STATE_CODES: ReadonlySet<string> = new Set(Object.values(US_STATES));

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

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

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

function normalizeState(value: string): string {
  const cleaned = cleanWhitespace(value).toUpperCase();
  if (!cleaned) return "";
  if (STATE_CODES.has(cleaned)) return cleaned;
  if (cleaned in US_STATES) return US_STATES[cleaned];
  return cleaned;
}

function normalizeZip(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

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

function parseRawAddress(raw: string): {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
} | null {
  const cleaned = cleanWhitespace(raw);
  if (!cleaned) return null;

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
      const streetChunks = commaParts.slice(0, commaParts.length - 2);
      const streetJoined = streetChunks.join(", ");
      const { street, unit } = extractUnit(streetJoined);
      return { street, unit, city, state, zip };
    }
  }

  const zipRegex = /(\d{5}(?:-\d{4})?)$/;
  const zipMatch = cleaned.match(zipRegex);
  if (!zipMatch) return null;
  const zip = zipMatch[1];
  const withoutZip = cleaned.slice(0, cleaned.length - zip.length).trim();

  let state: string;
  let withoutState: string;
  const twoLetterMatch = withoutZip.match(/[\s,]+([A-Za-z]{2})$/);
  if (twoLetterMatch) {
    state = twoLetterMatch[1];
    withoutState = withoutZip.slice(0, twoLetterMatch.index).trim();
  } else {
    const tailWords = withoutZip.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    if (tailWords.length < 2) return null;

    const twoWord = `${tailWords[tailWords.length - 2]} ${tailWords[tailWords.length - 1]}`;
    const oneWord = tailWords[tailWords.length - 1];
    if (US_STATES[twoWord.toUpperCase()]) {
      state = twoWord;
      withoutState = tailWords.slice(0, -2).join(" ");
    } else if (US_STATES[oneWord.toUpperCase()]) {
      state = oneWord;
      withoutState = tailWords.slice(0, -1).join(" ");
    } else {
      return null;
    }
  }
  withoutState = withoutState.replace(/,$/, "").trim();
  if (!withoutState) return null;

  let city: string;
  let streetJoined: string;
  if (withoutState.includes(",")) {
    const parts = withoutState
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    city = parts[parts.length - 1];
    streetJoined = parts.slice(0, -1).join(", ");
  } else {
    const words = withoutState.split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    city = words[words.length - 1];
    streetJoined = words.slice(0, -1).join(" ");
  }

  if (!streetJoined) return null;

  const { street, unit } = extractUnit(streetJoined);
  return { street, unit, city, state, zip };
}

function extractUnit(street: string): { street: string; unit?: string } {
  const cleaned = cleanWhitespace(street);
  const unitRegex = /[,\s](?:Unit|Apt|Apartment|Suite|Ste|#)\s*([A-Za-z0-9-]+)$/i;
  const match = cleaned.match(unitRegex);
  if (!match) return { street: cleaned };
  const unit = match[1];
  const streetOnly = cleaned.slice(0, match.index).replace(/[,\s]+$/, "");
  return { street: streetOnly, unit };
}

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

function compareStreet(value: string): string {
  return normalizeStreet(value)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function zipBase(value: string): string {
  return value.slice(0, 5);
}

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

  return Math.min(1, Math.max(0, Number(score.toFixed(4))));
}

function confidenceFor(score: number): MatchConfidence {
  if (score >= 1) return "exact";
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "medium";
  if (score >= 0.4) return "low";
  return "none";
}

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

  const aboveFloor = scored.filter((c) => c.score >= 0.4);

  if (aboveFloor.length === 0) {
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
