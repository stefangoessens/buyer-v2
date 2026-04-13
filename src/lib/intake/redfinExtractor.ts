import { normalizeAddress, type CanonicalAddress } from "./address";
import { parseListingUrl } from "./parser";

export const REDFIN_EXTRACTION_STRATEGIES = [
  "json-ld",
  "redux-state",
  "html-text",
] as const;

export type RedfinExtractionStrategy =
  (typeof REDFIN_EXTRACTION_STRATEGIES)[number];

export type RedfinListingStatus =
  | "active"
  | "pending"
  | "contingent"
  | "sold"
  | "withdrawn";

export interface RedfinCanonicalListingData {
  address: CanonicalAddress;
  coordinates?: {
    lat: number;
    lng: number;
  };
  redfinId: string;
  status?: RedfinListingStatus;
  listPrice?: number;
  listDate?: string;
  daysOnMarket?: number;
  propertyType?: string;
  beds?: number;
  bathsFull?: number;
  bathsHalf?: number;
  sqftLiving?: number;
  lotSize?: number;
  yearBuilt?: number;
  stories?: number;
  hoaFee?: number;
  hoaFrequency?: string;
  description?: string;
  photoUrls?: string[];
  photoCount?: number;
  redfinEstimate?: number;
  mlsNumber?: string;
}

export type RedfinExtractionField = keyof RedfinCanonicalListingData;

export interface RedfinExtractionSourceMetadata {
  sourcePlatform: "redfin";
  sourceUrl: string;
  normalizedUrl: string;
  listingId: string;
  fetchedAt: string;
  parser: "redfin-deterministic-v1";
  parserVersion: 1;
  strategiesUsed: RedfinExtractionStrategy[];
  fieldStrategies: Partial<Record<RedfinExtractionField, RedfinExtractionStrategy>>;
}

export interface RedfinExtractionPayload {
  reviewState: "complete" | "partial";
  missingFields: RedfinExtractionField[];
  data: RedfinCanonicalListingData;
  source: RedfinExtractionSourceMetadata;
}

export type RedfinParserErrorCode =
  | "invalid_source_url"
  | "unsupported_platform"
  | "missing_structured_data"
  | "missing_required_fields";

export interface RedfinParserError {
  code: RedfinParserErrorCode;
  message: string;
  platform: "redfin";
  sourceUrl: string;
  listingId?: string;
  normalizedUrl?: string;
  attemptedStrategies: RedfinExtractionStrategy[];
  missingFields?: RedfinExtractionField[];
}

export type RedfinExtractionResult =
  | { success: true; payload: RedfinExtractionPayload }
  | { success: false; error: RedfinParserError };

export interface RedfinExtractionInput {
  html: string;
  sourceUrl: string;
  fetchedAt?: string;
}

const REQUIRED_SUCCESS_FIELDS = ["address", "listPrice"] as const satisfies ReadonlyArray<RedfinExtractionField>;
const COMMON_EXPECTED_FIELDS = [
  "propertyType",
  "description",
  "photoUrls",
  "photoCount",
  "daysOnMarket",
  "beds",
  "bathsFull",
  "sqftLiving",
  "yearBuilt",
] as const satisfies ReadonlyArray<RedfinExtractionField>;
const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": "\"",
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};
const REDFIN_ASSIGNMENT_MARKERS = [
  "window.__INITIAL_STATE__",
  "window.__REDUX_STATE__",
  "reactServerState",
] as const;
const LOT_SIZE_SQFT_PER_ACRE = 43_560;
const PROPERTY_TYPE_LABELS: Array<[needle: string, label: string]> = [
  ["townhouse", "Townhouse"],
  ["townhome", "Townhouse"],
  ["single family", "Single Family"],
  ["singlefamily", "Single Family"],
  ["house", "Single Family"],
  ["condo", "Condo"],
  ["co op", "Condo"],
  ["co-op", "Condo"],
  ["multi family", "Multi Family"],
  ["multifamily", "Multi Family"],
  ["duplex", "Multi Family"],
  ["triplex", "Multi Family"],
  ["fourplex", "Multi Family"],
  ["new construction", "New Construction"],
  ["vacant land", "Lot/Land"],
  ["land", "Lot/Land"],
];

interface CandidateState {
  values: Partial<RedfinCanonicalListingData>;
  fieldStrategies: Partial<Record<RedfinExtractionField, RedfinExtractionStrategy>>;
  strategiesUsed: Set<RedfinExtractionStrategy>;
  attemptedStrategies: Set<RedfinExtractionStrategy>;
}

type JsonRecord = Record<string, unknown>;

export function extractRedfinListingHtml(
  input: RedfinExtractionInput,
): RedfinExtractionResult {
  const parsedUrl = parseListingUrl(input.sourceUrl);
  if (!parsedUrl.success) {
    return {
      success: false,
      error: {
        code:
          parsedUrl.error.code === "unsupported_url"
            ? "unsupported_platform"
            : "invalid_source_url",
        message: parsedUrl.error.message,
        platform: "redfin",
        sourceUrl: input.sourceUrl,
        attemptedStrategies: [],
      },
    };
  }

  if (parsedUrl.data.platform !== "redfin") {
    return {
      success: false,
      error: {
        code: "unsupported_platform",
        message: `Expected a Redfin URL, received ${parsedUrl.data.platform}`,
        platform: "redfin",
        sourceUrl: input.sourceUrl,
        listingId: parsedUrl.data.listingId,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        attemptedStrategies: [],
      },
    };
  }

  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const state: CandidateState = {
    values: {
      redfinId: parsedUrl.data.listingId,
    },
    fieldStrategies: {},
    strategiesUsed: new Set(),
    attemptedStrategies: new Set(),
  };

  const jsonLdObjects = extractJsonLdObjects(input.html);
  if (jsonLdObjects.length > 0) {
    mergeCandidate(state, extractFromJsonLd(jsonLdObjects), "json-ld");
  }

  const reduxCandidates = extractRedfinStateObjects(input.html);
  for (const candidate of reduxCandidates) {
    mergeCandidate(
      state,
      extractFromEmbeddedState(candidate, parsedUrl.data.listingId),
      "redux-state",
    );
  }

  mergeCandidate(
    state,
    extractFromVisibleText(input.html, fetchedAt),
    "html-text",
  );

  const attemptedStrategies = Array.from(state.attemptedStrategies);
  const strategiesUsed = Array.from(state.strategiesUsed);
  if (attemptedStrategies.length === 0) {
    return {
      success: false,
      error: {
        code: "missing_structured_data",
        message: "No Redfin listing payload could be extracted from the fetched HTML",
        platform: "redfin",
        sourceUrl: input.sourceUrl,
        listingId: parsedUrl.data.listingId,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        attemptedStrategies,
      },
    };
  }

  const missingRequired = REQUIRED_SUCCESS_FIELDS.filter(
    (field) => state.values[field] == null,
  );
  if (missingRequired.length > 0) {
    return {
      success: false,
      error: {
        code: "missing_required_fields",
        message: `Missing required Redfin fields: ${missingRequired.join(", ")}`,
        platform: "redfin",
        sourceUrl: input.sourceUrl,
        listingId: parsedUrl.data.listingId,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        attemptedStrategies,
        missingFields: [...missingRequired],
      },
    };
  }

  const propertyType = state.values.propertyType?.toLowerCase() ?? "";
  const missingFields = [
    ...COMMON_EXPECTED_FIELDS,
    ...(propertyType.includes("land") ? (["lotSize"] as const) : []),
  ].filter((field) => state.values[field] == null);

  const data = state.values as RedfinCanonicalListingData;
  data.redfinId = parsedUrl.data.listingId;
  if (data.photoUrls && data.photoUrls.length > 0) {
    data.photoCount = data.photoCount ?? data.photoUrls.length;
  }
  data.hoaFrequency = data.hoaFrequency ?? inferHoaFrequency(data.hoaFee);
  const propertyTypeNeedsReview =
    data.propertyType === "Condo" && /condo\s*\/\s*co-?op/i.test(input.html);

  return {
    success: true,
    payload: {
      reviewState:
        missingFields.length === 0 && !propertyTypeNeedsReview
          ? "complete"
          : "partial",
      missingFields,
      data,
      source: {
        sourcePlatform: "redfin",
        sourceUrl: input.sourceUrl,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        listingId: parsedUrl.data.listingId,
        fetchedAt,
        parser: "redfin-deterministic-v1",
        parserVersion: 1,
        strategiesUsed,
        fieldStrategies: state.fieldStrategies,
      },
    },
  };
}

function mergeCandidate(
  state: CandidateState,
  candidate: Partial<RedfinCanonicalListingData>,
  strategy: RedfinExtractionStrategy,
): void {
  state.attemptedStrategies.add(strategy);
  let contributed = false;

  for (const [field, rawValue] of Object.entries(candidate) as Array<
    [RedfinExtractionField, RedfinCanonicalListingData[RedfinExtractionField]]
  >) {
    const value = normalizeFieldValue(field, rawValue);
    if (value == null) continue;
    if (state.values[field] !== undefined) continue;
    assignCandidateField(state, field, value, strategy);
    contributed = true;
  }

  if (contributed) {
    state.strategiesUsed.add(strategy);
  }
}

function assignCandidateField<K extends RedfinExtractionField>(
  state: CandidateState,
  field: K,
  value: RedfinCanonicalListingData[K],
  strategy: RedfinExtractionStrategy,
): void {
  state.values[field] = value;
  state.fieldStrategies[field] = strategy;
}

function normalizeFieldValue<K extends RedfinExtractionField>(
  field: K,
  value: RedfinCanonicalListingData[K],
): RedfinCanonicalListingData[K] | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return (trimmed || undefined) as RedfinCanonicalListingData[K] | undefined;
  }
  if (Array.isArray(value)) {
    return (value.length > 0 ? value : undefined) as
      | RedfinCanonicalListingData[K]
      | undefined;
  }
  if (field === "coordinates") {
    const coords = value as RedfinCanonicalListingData["coordinates"];
    if (
      !coords ||
      !Number.isFinite(coords.lat) ||
      !Number.isFinite(coords.lng)
    ) {
      return undefined;
    }
  }
  return value;
}

function extractJsonLdObjects(html: string): unknown[] {
  const results: unknown[] = [];
  for (const script of extractScriptBlocks(html)) {
    if (!/application\/ld\+json/i.test(script.attrs)) continue;
    const parsed = parseJsonValue(script.content);
    if (parsed !== undefined) {
      results.push(parsed);
    }
  }
  return results;
}

function extractRedfinStateObjects(html: string): unknown[] {
  const candidates: unknown[] = [];
  for (const script of extractScriptBlocks(html)) {
    candidates.push(...extractAssignedObjects(script.content));
  }
  return candidates;
}

function extractAssignedObjects(script: string): unknown[] {
  const values: unknown[] = [];
  let index = 0;
  let inString = false;
  let quote = "";

  while (index < script.length) {
    const char = script[index];
    const previous = script[index - 1];
    if (inString) {
      if (char === quote && previous !== "\\") {
        inString = false;
        quote = "";
      }
      index += 1;
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      inString = true;
      quote = char;
      index += 1;
      continue;
    }

    const marker = REDFIN_ASSIGNMENT_MARKERS.find((candidate) =>
      script.startsWith(candidate, index),
    );
    if (!marker) {
      index += 1;
      continue;
    }

    let cursor = index + marker.length;
    while (cursor < script.length && /\s/.test(script[cursor])) {
      cursor += 1;
    }
    if (script[cursor] !== "=") {
      index += marker.length;
      continue;
    }
    cursor += 1;
    while (cursor < script.length && /\s/.test(script[cursor])) {
      cursor += 1;
    }

    const extracted = extractBalancedJson(script, cursor);
    if (!extracted) {
      index = cursor;
      continue;
    }

    try {
      values.push(JSON.parse(extracted.raw));
    } catch {
      // Ignore malformed early blobs and keep walking for a valid later one.
    }
    index = extracted.endIndex;
  }

  return values;
}

function extractBalancedJson(
  script: string,
  startIndex: number,
): { raw: string; endIndex: number } | undefined {
  const opener = script[startIndex];
  if (opener !== "{" && opener !== "[") {
    return undefined;
  }

  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let quote = "";

  for (let cursor = startIndex; cursor < script.length; cursor += 1) {
    const char = script[cursor];
    const previous = script[cursor - 1];

    if (inString) {
      if (char === quote && previous !== "\\") {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === opener) {
      depth += 1;
      continue;
    }

    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return {
          raw: script.slice(startIndex, cursor + 1),
          endIndex: cursor + 1,
        };
      }
    }
  }

  return undefined;
}

function extractFromJsonLd(rawObjects: unknown[]): Partial<RedfinCanonicalListingData> {
  const records = flattenJsonLd(rawObjects);
  const listing = records.find((record) => looksLikeListing(record));
  if (!listing) return {};

  const offers = asRecord(listing.offers);
  const baths = splitBathrooms(
    undefined,
    undefined,
    toNumber(
      listing.numberOfBathroomsTotal ?? listing.numberOfFullBathrooms ?? listing.baths,
    ),
  );
  const photoUrls = normalizePhotoUrls(listing.image);

  return {
    address: normalizeStructuredAddress(listing.address),
    coordinates: normalizeCoordinates(listing.geo),
    status: mapStatus(offers?.availability ?? listing.availability),
    listPrice: toNumber(offers?.price ?? listing.price),
    listDate: toIsoDate(listing.datePosted ?? listing.datePublished),
    propertyType: normalizePropertyType(
      listing.additionalType ?? pickResidentialType(listing["@type"]),
    ),
    beds: toNumber(listing.numberOfBedrooms ?? listing.numberOfRooms),
    bathsFull: baths.full,
    bathsHalf: baths.half,
    sqftLiving: toNumber(asRecord(listing.floorSize)?.value),
    yearBuilt: toNumber(listing.yearBuilt),
    description: normalizeParagraph(toStringValue(listing.description)),
    photoUrls,
    photoCount: photoUrls.length > 0 ? photoUrls.length : undefined,
  };
}

function extractFromEmbeddedState(
  raw: unknown,
  listingId: string,
): Partial<RedfinCanonicalListingData> {
  const record = pickBestPropertyRecord(raw, listingId);
  if (!record) return {};

  const baths = splitBathrooms(
    undefined,
    undefined,
    toNumber(firstValue(record, ["baths", "bathrooms", "numberOfBathroomsTotal"])),
  );
  const photoUrls = normalizePhotoUrls(
    firstValue(record, ["photos", "images", "photoUrls"]),
  );
  const lotSizeRaw =
    firstValue(record, ["lotSizeSqFt", "lotSize", "lotSqFt"]) ??
    firstValue(record, ["lotSizeAcres"]);

  return {
    address: normalizeStructuredAddress(
      firstValue(record, ["address"]) ?? buildAddressRecord(record),
    ),
    coordinates: normalizeCoordinates(
      firstValue(record, ["coordinates", "geo"]) ?? buildCoordinatesRecord(record),
    ),
    status: mapStatus(firstValue(record, ["status", "listingStatus", "homeStatus"])),
    listPrice: toNumber(firstValue(record, ["price", "listPrice"])),
    listDate: toIsoDate(
      firstValue(record, ["listingDate", "listDate", "dateListed", "dateOnMarket"]),
    ),
    daysOnMarket: normalizeDaysOnMarket(
      firstValue(record, ["daysOnMarket", "daysOnRedfin"]),
    ),
    propertyType: normalizePropertyType(
      firstValue(record, ["propertyType", "homeType"]),
    ),
    beds: toNumber(firstValue(record, ["beds", "bedrooms"])),
    bathsFull: baths.full,
    bathsHalf: baths.half,
    sqftLiving: toNumber(firstValue(record, ["sqFt", "livingArea", "sqft"])),
    lotSize: normalizeLotSize(lotSizeRaw),
    yearBuilt: toNumber(firstValue(record, ["yearBuilt"])),
    stories: toNumber(firstValue(record, ["stories", "storiesTotal"])),
    hoaFee: toNumber(firstValue(record, ["hoaDues", "hoaFee", "hoaAmount"])),
    hoaFrequency: inferHoaFrequency(
      firstValue(record, ["hoaFrequency", "hoaFeeFrequency", "hoaPeriod"]),
    ),
    description: normalizeParagraph(
      toStringValue(firstValue(record, ["description", "remarks", "publicRemarks"])),
    ),
    photoUrls,
    photoCount:
      toNumber(firstValue(record, ["photoCount", "photosCount"])) ??
      (photoUrls.length > 0 ? photoUrls.length : undefined),
    redfinEstimate: toNumber(
      firstValue(record, [
        "redfinEstimate",
        "estimateValue",
        "avmValue",
        "estimatedValue",
      ]),
    ),
    mlsNumber: toStringValue(firstValue(record, ["mlsId", "mlsNumber"])),
  };
}

function extractFromVisibleText(
  html: string,
  fetchedAt: string,
): Partial<RedfinCanonicalListingData> {
  const street = captureClassText(html, "street-address");
  const cityStateZip = captureClassText(html, "citystatezip");
  const address = normalizeStructuredAddress(
    street && cityStateZip
      ? `${street}, ${cityStateZip}`
      : findMetaContent(html, "property", "og:title") ??
          captureTagText(html, "h1"),
  );
  const baths = splitBathrooms(
    undefined,
    undefined,
    captureStatValue(html, "Baths"),
  );
  const priceMeta = findMetaContent(html, "name", "twitter:data1");
  const photoUrls = Array.from(
    html.matchAll(
      /<img[^>]*class="[^"]*InlinePhotoViewer_image[^"]*"[^>]*src="([^"]+)"[^>]*>/gi,
    ),
    (match) => decodeHtmlEntities(match[1]).trim(),
  ).filter(Boolean);
  const description =
    findMetaContent(html, "property", "og:description") ??
    captureTagText(html, "section", "remarks");
  const listDate =
    findFactValue(html, "Listed on") ?? findFactValue(html, "List date");

  return {
    address,
    listPrice:
      parsePrice(priceMeta) ??
      parsePrice(captureClassText(html, "homecard-price")),
    listDate: toIsoDate(listDate),
    daysOnMarket:
      normalizeDaysOnMarket(findFactValue(html, "Days on Redfin")) ??
      normalizeDaysOnMarket(findFactValue(html, "Days on Market")) ??
      daysBetween(toIsoDate(listDate), fetchedAt),
    propertyType: normalizePropertyType(findFactValue(html, "Property Type")),
    beds: captureStatValue(html, "Beds"),
    bathsFull: baths.full,
    bathsHalf: baths.half,
    sqftLiving: captureStatValue(html, "Sq Ft"),
    lotSize: parseLotSize(findFactValue(html, "Lot Size")),
    yearBuilt: toNumber(findFactValue(html, "Year Built")),
    hoaFee: extractNumericValue(findFactValue(html, "HOA Dues")),
    hoaFrequency: inferHoaFrequency(findFactValue(html, "HOA Dues")),
    description: normalizeParagraph(description),
    photoUrls,
    photoCount: photoUrls.length > 0 ? photoUrls.length : undefined,
    mlsNumber: extractMlsNumber(html),
  };
}

function captureStatValue(html: string, label: string): number | undefined {
  const blocks = html.match(
    /<div[^>]*class="[^"]*stat-block[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi,
  );
  if (!blocks) return undefined;

  for (const block of blocks) {
    const blockLabel = normalizeParagraph(
      stripTags(
        block.match(
          /<div[^>]*class="[^"]*statsLabel[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        )?.[1],
      ),
    );
    if (blockLabel?.toLowerCase() !== label.toLowerCase()) continue;

    return toNumber(
      stripTags(
        block.match(
          /<div[^>]*class="[^"]*statsValue[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        )?.[1],
      ),
    );
  }

  return undefined;
}

function findFactValue(html: string, label: string): string | undefined {
  const escaped = escapeForRegExp(label);
  const match = html.match(
    new RegExp(
      `<div[^>]*class="[^"]*home-facts-row[^"]*"[^>]*>[\\s\\S]*?<span[^>]*class="[^"]*home-facts-label[^"]*"[^>]*>\\s*${escaped}\\s*<\\/span>[\\s\\S]*?<span[^>]*class="[^"]*home-facts-value[^"]*"[^>]*>(.*?)<\\/span>[\\s\\S]*?<\\/div>`,
      "i",
    ),
  );
  return normalizeParagraph(stripTags(match?.[1]));
}

function captureClassText(html: string, className: string): string | undefined {
  const escaped = escapeForRegExp(className);
  const match = html.match(
    new RegExp(
      `<[^>]+class="[^"]*${escaped}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`,
      "i",
    ),
  );
  return normalizeParagraph(stripTags(match?.[1]));
}

function captureTagText(
  html: string,
  tagName: string,
  className?: string,
): string | undefined {
  const classFragment = className
    ? `[^>]*class="[^"]*${escapeForRegExp(className)}[^"]*"[^>]*`
    : "[^>]*";
  const match = html.match(
    new RegExp(
      `<${tagName}${classFragment}>([\\s\\S]*?)<\\/${tagName}>`,
      "i",
    ),
  );
  return normalizeParagraph(stripTags(match?.[1]));
}

function findMetaContent(
  html: string,
  attribute: "name" | "property",
  value: string,
): string | undefined {
  const escaped = escapeForRegExp(value);
  const match = html.match(
    new RegExp(
      `<meta[^>]*${attribute}="${escaped}"[^>]*content="([^"]*)"[^>]*>`,
      "i",
    ),
  );
  return normalizeParagraph(match?.[1]);
}

function extractMlsNumber(html: string): string | undefined {
  const title = captureTagText(html, "title");
  const match = title?.match(/MLS\s+#([A-Za-z0-9-]+)/i);
  return match?.[1];
}

function flattenJsonLd(rawObjects: unknown[]): JsonRecord[] {
  const flattened: JsonRecord[] = [];
  for (const entry of rawObjects) {
    if (Array.isArray(entry)) {
      flattened.push(...flattenJsonLd(entry));
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    if (Array.isArray(record["@graph"])) {
      flattened.push(...flattenJsonLd(record["@graph"]));
    }
    flattened.push(record);
  }
  return flattened;
}

function looksLikeListing(record: JsonRecord): boolean {
  const typeValues = toTypeArray(record["@type"]);
  if (typeValues.some((value) => /listing|residence|house|product/i.test(value))) {
    return true;
  }
  return asRecord(record.offers) != null;
}

function pickBestPropertyRecord(
  raw: unknown,
  listingId: string,
): JsonRecord | undefined {
  const normalizedId = listingId.replace(/\D/g, "");
  let best: { record: JsonRecord; score: number } | undefined;

  walkRecords(raw, (record) => {
    const candidateId = [
      record.propertyId,
      record.listingId,
      record.mlsId,
      asRecord(record.address)?.propertyId,
    ]
      .map((value) => toStringValue(value))
      .find(Boolean);
    if (!candidateId) return;
    if (candidateId.replace(/\D/g, "") !== normalizedId) return;

    const score = [
      "price",
      "beds",
      "baths",
      "sqFt",
      "yearBuilt",
      "address",
      "propertyType",
      "daysOnMarket",
    ].reduce((total, key) => total + (key in record ? 1 : 0), 0);

    if (!best || score > best.score) {
      best = { record, score };
    }
  });

  if (best) return best.record;

  let fallback: JsonRecord | undefined;
  walkRecords(raw, (record) => {
    if (fallback) return;
    if ("price" in record && "address" in record) {
      fallback = record;
    }
  });
  return fallback;
}

function walkRecords(raw: unknown, visitor: (record: JsonRecord) => void): void {
  if (Array.isArray(raw)) {
    raw.forEach((entry) => walkRecords(entry, visitor));
    return;
  }
  const record = asRecord(raw);
  if (!record) return;
  visitor(record);
  Object.values(record).forEach((value) => walkRecords(value, visitor));
}

function firstValue(raw: unknown, keys: string[]): unknown {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [raw];

  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const record = asRecord(current);
    if (!record) continue;

    for (const [key, value] of Object.entries(record)) {
      if (keySet.has(key.toLowerCase())) {
        return value;
      }
      if (Array.isArray(value) || asRecord(value)) {
        queue.push(value);
      }
    }
  }

  return undefined;
}

function buildAddressRecord(raw: unknown): JsonRecord | undefined {
  const street = toStringValue(
    firstValue(raw, ["streetAddress", "street", "line1", "address1"]),
  );
  const city = toStringValue(firstValue(raw, ["city", "addressLocality"]));
  const state = toStringValue(
    firstValue(raw, ["state", "addressRegion", "stateCode"]),
  );
  const zip = toStringValue(firstValue(raw, ["zip", "zipCode", "postalCode"]));

  if (!street && !city && !state && !zip) return undefined;
  return {
    streetAddress: street,
    city,
    state,
    zip,
  };
}

function normalizeStructuredAddress(
  raw: unknown,
): CanonicalAddress | undefined {
  if (typeof raw === "string") {
    const normalized = normalizeAddress({ raw: decodeHtmlEntities(raw) });
    return normalized.valid ? normalized.canonical : undefined;
  }

  const record = asRecord(raw);
  if (!record) return undefined;

  const street =
    toStringValue(record.streetAddress) ??
    toStringValue(record.street) ??
    toStringValue(record.line1) ??
    toStringValue(record.address1);
  const city =
    toStringValue(record.city) ?? toStringValue(record.addressLocality);
  const state =
    toStringValue(record.state) ??
    toStringValue(record.addressRegion) ??
    toStringValue(record.stateCode);
  const zip =
    toStringValue(record.zip) ??
    toStringValue(record.zipCode) ??
    toStringValue(record.postalCode);

  if (!(street && city && state && zip)) return undefined;
  const normalized = normalizeAddress({
    raw: `${street}, ${city}, ${state} ${zip}`,
  });
  return normalized.valid ? normalized.canonical : undefined;
}

function buildCoordinatesRecord(raw: unknown): JsonRecord | undefined {
  const lat = toNumber(firstValue(raw, ["latitude", "lat"]));
  const lng = toNumber(firstValue(raw, ["longitude", "lng", "lon"]));
  if (lat == null || lng == null) return undefined;
  return { lat, lng };
}

function normalizeCoordinates(
  raw: unknown,
): RedfinCanonicalListingData["coordinates"] | undefined {
  const record = asRecord(raw);
  if (record) {
    const lat = toNumber(record.lat ?? record.latitude);
    const lng = toNumber(record.lng ?? record.longitude ?? record.lon);
    if (lat != null && lng != null) {
      return { lat, lng };
    }
  }
  return undefined;
}

function normalizePhotoUrls(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (typeof entry === "string") return decodeHtmlEntities(entry).trim();
        const record = asRecord(entry);
        return (
          toStringValue(record?.url) ??
          toStringValue(record?.href) ??
          toStringValue(record?.src)
        );
      })
      .filter((entry): entry is string => Boolean(entry));
  }
  if (typeof raw === "string") {
    const trimmed = decodeHtmlEntities(raw).trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function splitBathrooms(
  full: number | undefined,
  half: number | undefined,
  total: number | undefined,
): { full?: number; half?: number } {
  if (full != null || half != null) {
    return { full, half };
  }
  if (total == null) return {};
  const computedFull = Math.floor(total);
  const remainder = Number((total - computedFull).toFixed(1));
  return {
    full: computedFull,
    half: remainder >= 0.5 ? 1 : 0,
  };
}

function mapStatus(raw: unknown): RedfinListingStatus | undefined {
  const normalized = toStringValue(raw)?.toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized.includes("instock") ||
    normalized.includes("for sale") ||
    normalized.includes("active") ||
    normalized.includes("coming")
  ) {
    return "active";
  }
  if (normalized.includes("pending")) return "pending";
  if (normalized.includes("contingent")) return "contingent";
  if (normalized.includes("sold") || normalized.includes("off market")) {
    return "sold";
  }
  if (normalized.includes("withdraw")) return "withdrawn";
  return undefined;
}

function normalizePropertyType(raw: unknown): string | undefined {
  const normalized = toStringValue(raw)?.replace(/[_-]+/g, " ").toLowerCase();
  if (!normalized) return undefined;
  for (const [needle, label] of PROPERTY_TYPE_LABELS) {
    if (normalized.includes(needle)) {
      return label;
    }
  }
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeDaysOnMarket(raw: unknown): number | undefined {
  const value = extractNumericValue(raw) ?? toNumber(raw);
  if (value == null) return undefined;
  return Math.max(0, Math.round(value));
}

function inferHoaFrequency(raw: unknown): string | undefined {
  const normalized = toStringValue(raw)?.toLowerCase();
  if (!normalized) return raw != null ? "monthly" : undefined;
  if (
    normalized.includes("month") ||
    normalized === "mo" ||
    normalized === "monthly"
  ) {
    return "monthly";
  }
  if (normalized.includes("quarter")) return "quarterly";
  if (normalized.includes("year") || normalized.includes("annual")) {
    return "yearly";
  }
  return normalized;
}

function daysBetween(
  startDate: string | undefined,
  fetchedAt: string,
): number | undefined {
  if (!startDate) return undefined;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(fetchedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return undefined;
  }
  const delta = end.getTime() - start.getTime();
  return delta >= 0 ? Math.floor(delta / 86_400_000) : undefined;
}

function toIsoDate(raw: unknown): string | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const value = String(raw).trim();
  if (!value) return undefined;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const usMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function toNumber(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw !== "string") return undefined;

  const normalized = raw.replace(/[$,%\s]/g, "").replace(/,/g, "");
  const suffixMatch = normalized.match(/^(-?\d+(?:\.\d+)?)([KMB])$/i);
  if (suffixMatch) {
    const multiplier =
      suffixMatch[2].toUpperCase() === "K"
        ? 1_000
        : suffixMatch[2].toUpperCase() === "M"
          ? 1_000_000
          : 1_000_000_000;
    return Number(suffixMatch[1]) * multiplier;
  }

  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePrice(raw: unknown): number | undefined {
  const value = toStringValue(raw);
  return value ? toNumber(value) : undefined;
}

function extractNumericValue(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw !== "string") return undefined;

  const match = raw.match(/-?\d[\d,]*(?:\.\d+)?(?:\s*[KMB])?/i);
  if (!match) return undefined;
  return toNumber(match[0].replace(/\s+/g, ""));
}

function parseLotSize(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.round(raw) : undefined;
  }
  const value = toStringValue(raw);
  if (!value) return undefined;
  return normalizeLotSize(value);
}

function normalizeLotSize(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.round(raw) : undefined;
  }
  if (typeof raw !== "string") return undefined;
  const match = raw.match(/([\d,]+(?:\.\d+)?)\s*(sq\s*ft|sqft|acres?)/i);
  if (!match) {
    return toNumber(raw);
  }
  const magnitude = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(magnitude)) return undefined;
  const unit = match[2].toLowerCase().replace(/\s+/g, "");
  if (unit.startsWith("acre")) {
    return Math.round(magnitude * LOT_SIZE_SQFT_PER_ACRE);
  }
  return Math.round(magnitude);
}

function toStringValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const decoded = decodeHtmlEntities(raw).trim();
  return decoded || undefined;
}

function normalizeParagraph(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const normalized = decodeHtmlEntities(raw)
    .replace(/\s+/g, " ")
    .trim();
  return normalized || undefined;
}

function stripTags(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return decodeHtmlEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&nbsp;|&amp;|&quot;|&#39;|&apos;|&lt;|&gt;/g,
    (entity) => ENTITY_MAP[entity] ?? entity,
  );
}

function asRecord(raw: unknown): JsonRecord | null {
  return raw != null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as JsonRecord)
    : null;
}

function toTypeArray(raw: unknown): string[] {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function pickResidentialType(raw: unknown): string | undefined {
  const types = toTypeArray(raw);
  const specific = types.find((entry) => normalizePropertyType(entry) != null);
  return specific ?? types[types.length - 1];
}

function parseJsonValue(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function extractScriptBlocks(
  html: string,
): Array<{ attrs: string; content: string }> {
  const scripts: Array<{ attrs: string; content: string }> = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    scripts.push({
      attrs: match[1] ?? "",
      content: match[2] ?? "",
    });
  }
  return scripts;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
