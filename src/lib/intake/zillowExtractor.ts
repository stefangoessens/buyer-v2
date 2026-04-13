import { normalizeAddress, type CanonicalAddress } from "./address";
import { parseListingUrl } from "./parser";

export const ZILLOW_EXTRACTION_STRATEGIES = [
  "next-data",
  "apollo-cache",
  "json-ld",
  "html-text",
] as const;

export type ZillowExtractionStrategy =
  (typeof ZILLOW_EXTRACTION_STRATEGIES)[number];

export type ZillowListingStatus =
  | "active"
  | "pending"
  | "contingent"
  | "sold"
  | "withdrawn";

export interface ZillowCanonicalListingData {
  address: CanonicalAddress;
  coordinates?: {
    lat: number;
    lng: number;
  };
  zillowId: string;
  status?: ZillowListingStatus;
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
  taxAnnual?: number;
  taxAssessedValue?: number;
  description?: string;
  photoUrls?: string[];
  photoCount?: number;
  zestimate?: number;
  mlsNumber?: string;
  listingAgentName?: string;
  listingBrokerage?: string;
  listingAgentPhone?: string;
  subdivision?: string;
  elementarySchool?: string;
  middleSchool?: string;
  highSchool?: string;
}

export type ZillowExtractionField = keyof ZillowCanonicalListingData;

export interface ZillowExtractionSourceMetadata {
  sourcePlatform: "zillow";
  sourceUrl: string;
  normalizedUrl: string;
  listingId: string;
  fetchedAt: string;
  parser: "zillow-deterministic-v1";
  parserVersion: 1;
  strategiesUsed: ZillowExtractionStrategy[];
  fieldStrategies: Partial<Record<ZillowExtractionField, ZillowExtractionStrategy>>;
}

export interface ZillowExtractionPayload {
  reviewState: "complete" | "partial";
  missingFields: ZillowExtractionField[];
  data: ZillowCanonicalListingData;
  source: ZillowExtractionSourceMetadata;
}

export type ZillowParserErrorCode =
  | "invalid_source_url"
  | "unsupported_platform"
  | "missing_structured_data"
  | "missing_required_fields";

export interface ZillowParserError {
  code: ZillowParserErrorCode;
  message: string;
  platform: "zillow";
  sourceUrl: string;
  listingId?: string;
  normalizedUrl?: string;
  attemptedStrategies: ZillowExtractionStrategy[];
  missingFields?: ZillowExtractionField[];
}

export type ZillowExtractionResult =
  | { success: true; payload: ZillowExtractionPayload }
  | { success: false; error: ZillowParserError };

export interface ZillowExtractionInput {
  html: string;
  sourceUrl: string;
  fetchedAt?: string;
}

const REQUIRED_SUCCESS_FIELDS = ["address", "listPrice"] as const satisfies ReadonlyArray<ZillowExtractionField>;
const COMMON_EXPECTED_FIELDS = [
  "propertyType",
  "description",
  "photoUrls",
  "photoCount",
  "listDate",
  "daysOnMarket",
  "mlsNumber",
  "listingAgentName",
  "listingBrokerage",
] as const satisfies ReadonlyArray<ZillowExtractionField>;
const RESIDENTIAL_EXPECTED_FIELDS = [
  "beds",
  "bathsFull",
  "sqftLiving",
  "yearBuilt",
] as const satisfies ReadonlyArray<ZillowExtractionField>;
const LOT_EXPECTED_FIELDS = ["lotSize"] as const satisfies ReadonlyArray<ZillowExtractionField>;
const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": "\"",
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};
const STRUCTURED_DATA_SCORE_KEYS = [
  "address",
  "price",
  "bedrooms",
  "bathrooms",
  "livingArea",
  "yearBuilt",
  "description",
  "photos",
  "attributionInfo",
  "schools",
  "daysOnZillow",
  "mlsId",
  "homeType",
  "homeStatus",
];

interface CandidateState {
  values: Partial<ZillowCanonicalListingData>;
  fieldStrategies: Partial<Record<ZillowExtractionField, ZillowExtractionStrategy>>;
  strategiesUsed: Set<ZillowExtractionStrategy>;
  attemptedStrategies: Set<ZillowExtractionStrategy>;
}

type JsonRecord = Record<string, unknown>;

interface StructuredExtraction {
  values: Partial<ZillowCanonicalListingData>;
}

export function extractZillowListingHtml(
  input: ZillowExtractionInput,
): ZillowExtractionResult {
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
        platform: "zillow",
        sourceUrl: input.sourceUrl,
        attemptedStrategies: [],
      },
    };
  }

  if (parsedUrl.data.platform !== "zillow") {
    return {
      success: false,
      error: {
        code: "unsupported_platform",
        message: `Expected a Zillow URL, received ${parsedUrl.data.platform}`,
        platform: "zillow",
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
      zillowId: `zpid-${parsedUrl.data.listingId}`,
    },
    fieldStrategies: {},
    strategiesUsed: new Set(),
    attemptedStrategies: new Set(),
  };

  const nextData = extractNextData(input.html);
  if (nextData) {
    mergeCandidate(
      state,
      extractFromStructuredObject(nextData, parsedUrl.data.listingId),
      "next-data",
    );
  }

  const apolloData = extractApolloCache(input.html);
  if (apolloData) {
    mergeCandidate(
      state,
      extractFromStructuredObject(apolloData, parsedUrl.data.listingId),
      "apollo-cache",
    );
  }

  const jsonLdObjects = extractJsonLdObjects(input.html);
  if (jsonLdObjects.length > 0) {
    mergeCandidate(
      state,
      extractFromJsonLd(jsonLdObjects),
      "json-ld",
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
        message: "No Zillow listing payload could be extracted from the fetched HTML",
        platform: "zillow",
        sourceUrl: input.sourceUrl,
        listingId: parsedUrl.data.listingId,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        attemptedStrategies: [],
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
        message: `Missing required Zillow fields: ${missingRequired.join(", ")}`,
        platform: "zillow",
        sourceUrl: input.sourceUrl,
        listingId: parsedUrl.data.listingId,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        attemptedStrategies,
        missingFields: [...missingRequired],
      },
    };
  }

  const propertyType = state.values.propertyType?.toLowerCase() ?? "";
  const completenessFields = [
    ...COMMON_EXPECTED_FIELDS,
    ...(propertyType.includes("land") || propertyType.includes("lot")
      ? LOT_EXPECTED_FIELDS
      : RESIDENTIAL_EXPECTED_FIELDS),
  ];
  const missingFields = completenessFields.filter(
    (field) => state.values[field] == null,
  );

  const data = state.values as ZillowCanonicalListingData;
  data.zillowId = `zpid-${parsedUrl.data.listingId}`;
  if (data.photoUrls && data.photoUrls.length > 0) {
    data.photoCount = data.photoCount ?? data.photoUrls.length;
  }

  return {
    success: true,
    payload: {
      reviewState: missingFields.length === 0 ? "complete" : "partial",
      missingFields,
      data,
      source: {
        sourcePlatform: "zillow",
        sourceUrl: input.sourceUrl,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        listingId: parsedUrl.data.listingId,
        fetchedAt,
        parser: "zillow-deterministic-v1",
        parserVersion: 1,
        strategiesUsed,
        fieldStrategies: state.fieldStrategies,
      },
    },
  };
}

function mergeCandidate(
  state: CandidateState,
  candidate: Partial<ZillowCanonicalListingData>,
  strategy: ZillowExtractionStrategy,
): void {
  state.attemptedStrategies.add(strategy);
  let contributed = false;

  for (const [field, rawValue] of Object.entries(candidate) as Array<
    [ZillowExtractionField, ZillowCanonicalListingData[ZillowExtractionField]]
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

function assignCandidateField<K extends ZillowExtractionField>(
  state: CandidateState,
  field: K,
  value: ZillowCanonicalListingData[K],
  strategy: ZillowExtractionStrategy,
): void {
  state.values[field] = value;
  state.fieldStrategies[field] = strategy;
}

function normalizeFieldValue<K extends ZillowExtractionField>(
  field: K,
  value: ZillowCanonicalListingData[K],
): ZillowCanonicalListingData[K] | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed as ZillowCanonicalListingData[K];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return value as ZillowCanonicalListingData[K];
  }
  if (field === "coordinates") {
    const coords = value as ZillowCanonicalListingData["coordinates"];
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

function extractNextData(html: string): unknown | undefined {
  for (const script of extractScriptBlocks(html)) {
    if (!/id=(["'])__NEXT_DATA__\1/i.test(script.attrs)) continue;
    const parsed = parseJsonValue(script.content);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function extractApolloCache(html: string): unknown | undefined {
  for (const script of extractScriptBlocks(html)) {
    if (!script.content.includes("hdpApolloPreloadedData")) continue;
    const extracted = extractAssignedJson(script.content, "hdpApolloPreloadedData");
    if (extracted !== undefined) return extracted;
  }
  return undefined;
}

function extractJsonLdObjects(html: string): unknown[] {
  const results: unknown[] = [];
  for (const script of extractScriptBlocks(html)) {
    if (!/application\/ld\+json/i.test(script.attrs)) continue;
    const parsed = parseJsonValue(script.content);
    if (parsed === undefined) continue;
    results.push(parsed);
  }
  return results;
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

function parseJsonValue(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    // ignore
  }

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1);
    const normalized = inner
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\")
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&");
    try {
      return JSON.parse(normalized);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function extractAssignedJson(
  script: string,
  marker: string,
): unknown | undefined {
  const markerIndex = script.indexOf(marker);
  if (markerIndex < 0) return undefined;

  const separatorIndexes = [
    script.indexOf("=", markerIndex),
    script.indexOf(":", markerIndex),
  ].filter((index) => index >= 0);
  if (separatorIndexes.length === 0) return undefined;

  let index = Math.min(...separatorIndexes) + 1;
  while (index < script.length && /\s/.test(script[index])) {
    index += 1;
  }

  const opener = script[index];
  if (opener === "{" || opener === "[") {
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let stringQuote = "";
    for (let cursor = index; cursor < script.length; cursor += 1) {
      const char = script[cursor];
      const previous = script[cursor - 1];
      if (inString) {
        if (char === stringQuote && previous !== "\\") {
          inString = false;
          stringQuote = "";
        }
        continue;
      }
      if (char === "\"" || char === "'") {
        inString = true;
        stringQuote = char;
        continue;
      }
      if (char === opener) depth += 1;
      if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          return parseJsonValue(script.slice(index, cursor + 1));
        }
      }
    }
    return undefined;
  }

  if (opener === "\"" || opener === "'") {
    let cursor = index + 1;
    while (cursor < script.length) {
      if (script[cursor] === opener && script[cursor - 1] !== "\\") {
        return parseJsonValue(script.slice(index, cursor + 1));
      }
      cursor += 1;
    }
  }

  return undefined;
}

function extractFromStructuredObject(
  raw: unknown,
  listingId: string,
): StructuredExtraction["values"] {
  const record = pickBestListingRecord(raw, listingId);
  if (!record) return {};

  const statusValue = firstValue(record, ["homeStatus", "listingStatus"]);
  const listDateValue = firstValue(record, [
    "datePostedString",
    "datePosted",
    "listingDate",
    "timeOnZillow",
  ]);
  const agentInfo = firstRecord(record, ["attributionInfo", "listingAgent"]);
  const resoFacts = firstRecord(record, ["resoFacts"]);
  const schoolEntries = firstArray(record, ["schools"]);
  const photoUrls = normalizePhotoUrls(
    firstValue(record, ["photos", "responsivePhotosOriginalRatio", "image"]),
  );

  const bathroomsFull = toNumber(
    firstValue(record, ["bathroomsFull", "bathsFull"]),
  );
  const bathroomsHalf = toNumber(
    firstValue(record, ["bathroomsHalf", "bathsHalf"]),
  );
  const derivedBaths = splitBathrooms(
    bathroomsFull,
    bathroomsHalf,
    toNumber(firstValue(record, ["bathrooms", "baths"])),
  );

  const schools = extractSchools(schoolEntries);
  const address = normalizeStructuredAddress(
    firstValue(record, ["address"]) ??
      buildAddressRecord(record),
  );

  return {
    address,
    coordinates: normalizeCoordinates(
      firstValue(record, ["latLong"]) ??
        buildCoordinatesRecord(record),
    ),
    status: mapStatus(statusValue),
    listPrice: toNumber(firstValue(record, ["price", "listPrice"])),
    listDate: toIsoDate(listDateValue),
    daysOnMarket: normalizeDaysOnMarket(
      firstValue(record, ["daysOnZillow", "daysOnMarket"]),
    ),
    propertyType: normalizePropertyType(
      firstValue(record, ["homeType", "propertyType", "homeTypeText"]),
    ),
    beds: toNumber(firstValue(record, ["bedrooms", "beds"])),
    bathsFull: derivedBaths.full,
    bathsHalf: derivedBaths.half,
    sqftLiving: toNumber(
      firstValue(record, ["livingArea", "livingAreaValue", "sqft"]),
    ),
    lotSize: toNumber(firstValue(record, ["lotSize", "lotAreaValue"])),
    yearBuilt: toNumber(firstValue(record, ["yearBuilt"])),
    stories: toNumber(firstValue(record, ["stories", "storiesTotal"])),
    hoaFee: toNumber(firstValue(record, ["monthlyHoaFee", "hoaFee"])),
    hoaFrequency:
      toStringValue(firstValue(record, ["hoaFeeFrequency"])) ??
      inferHoaFrequency(firstValue(record, ["monthlyHoaFee", "hoaFee"])),
    taxAnnual: toNumber(firstValue(record, ["taxAnnualAmount", "taxAnnual"])),
    taxAssessedValue: toNumber(
      firstValue(record, ["taxAssessedValue", "taxAssessedValueAmount"]),
    ),
    description: toStringValue(
      firstValue(record, ["description", "marketingDescription"]),
    ),
    photoUrls,
    photoCount:
      toNumber(firstValue(record, ["photosCount", "photoCount"])) ??
      (photoUrls.length > 0 ? photoUrls.length : undefined),
    zestimate: toNumber(firstValue(record, ["zestimate"])),
    mlsNumber: toStringValue(firstValue(record, ["mlsId", "mlsNumber"])),
    listingAgentName:
      toStringValue(firstValue(agentInfo, ["agentName", "name"])) ??
      toStringValue(firstValue(record, ["listingAgentName"])),
    listingBrokerage:
      toStringValue(firstValue(agentInfo, ["brokerName", "brokerageName"])) ??
      toStringValue(firstValue(record, ["brokerName", "listingBrokerage"])),
    listingAgentPhone:
      toStringValue(
        firstValue(agentInfo, ["agentPhoneNumber", "agentPhone", "phone"]),
      ) ?? toStringValue(firstValue(record, ["listingAgentPhone"])),
    subdivision:
      toStringValue(firstValue(record, ["subdivision"])) ??
      toStringValue(firstValue(resoFacts, ["subdivision", "subdivisionName"])),
    elementarySchool: schools.elementarySchool,
    middleSchool: schools.middleSchool,
    highSchool: schools.highSchool,
  };
}

function extractFromJsonLd(rawObjects: unknown[]): StructuredExtraction["values"] {
  const flattened = flattenJsonLd(rawObjects);
  const listing = flattened.find((entry) => {
    const type = toStringValue(entry["@type"]);
    return (
      type != null &&
      /(Residence|Apartment|House|Product|SingleFamilyResidence|Townhouse|Condominium)/i.test(
        type,
      )
    );
  });

  if (!listing) return {};

  const offers = asRecord(listing.offers);
  const geo = asRecord(listing.geo);
  const address = normalizeStructuredAddress(listing.address);
  const images = normalizePhotoUrls(listing.image);
  const derivedBaths = splitBathrooms(
    toNumber(listing.numberOfFullBathrooms),
    toNumber(listing.numberOfPartialBathrooms),
    toNumber(listing.numberOfBathroomsTotal),
  );

  return {
    address,
    coordinates: normalizeCoordinates(geo),
    listPrice: toNumber(offers?.price),
    propertyType: normalizePropertyType(listing["@type"]),
    beds:
      toNumber(listing.numberOfBedrooms) ??
      toNumber(listing.numberOfRooms),
    bathsFull: derivedBaths.full,
    bathsHalf: derivedBaths.half,
    sqftLiving: toNumber(asRecord(listing.floorSize)?.value),
    description: toStringValue(listing.description),
    photoUrls: images,
    photoCount: images.length > 0 ? images.length : undefined,
  };
}

function extractFromVisibleText(
  html: string,
  fetchedAt: string,
): StructuredExtraction["values"] {
  const text = stripVisibleText(html);

  const addressMatch = text.match(
    /#\s*([^#]+?,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/,
  );
  const listedByMatch = text.match(
    /Listed by:\s*([A-Za-z .'-]+)(?:\s+((?:\([0-9]{3}\)\s*)?[0-9\- ]+))?,\s*([^|]+?)(?=Source:|Facts & features|Financial & listing details|$)/i,
  );
  const propertyTypeMatch = text.match(
    /(?:Home type|Property type):\s*([A-Za-z /-]+)/i,
  );
  const descriptionMatch = text.match(
    /What's special\s+([\s\S]+?)(?=Show more|Facts & features|Listed by:|$)/i,
  );

  const address = normalizeStructuredAddress(
    addressMatch?.[1] ??
      text.match(
        /([0-9][^,]+?,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/,
      )?.[1],
  );
  const derivedBaths = splitBathrooms(
    undefined,
    undefined,
    toNumber(text.match(/([0-9]+(?:\.[0-9])?)\s+baths?/i)?.[1]),
  );

  return {
    address,
    listPrice: toNumber(text.match(/\$([\d,]+)(?:\s+|(?=#))/)?.[1]),
    listDate: toIsoDate(
      text.match(/(?:Date on market|Listed on):\s*([A-Za-z0-9, /-]+)/i)?.[1],
    ),
    daysOnMarket:
      normalizeDaysOnMarket(text.match(/([0-9]+)\s+days\s+on\s+Zillow/i)?.[1]) ??
      daysBetween(
        toIsoDate(
          text.match(/(?:Date on market|Listed on):\s*([A-Za-z0-9, /-]+)/i)?.[1],
        ),
        fetchedAt,
      ),
    propertyType:
      normalizePropertyType(propertyTypeMatch?.[1]) ??
      normalizePropertyType(
        text.match(
          /\b(Condo|Townhouse|Single Family|SingleFamily|House|Lot\/land|Unimproved Land)\b/i,
        )?.[1],
      ),
    beds: toNumber(text.match(/([0-9]+(?:\.[0-9])?)\s+beds?/i)?.[1]),
    bathsFull: derivedBaths.full,
    bathsHalf: derivedBaths.half,
    sqftLiving: toNumber(text.match(/([\d,]+)\s+sqft\b/i)?.[1]),
    lotSize: toNumber(
      text.match(/(?:Lot size|Lot):\s*([\d,.]+)\s*(?:sqft|acres?)/i)?.[1],
    ),
    yearBuilt: toNumber(text.match(/Built in\s+(\d{4})/i)?.[1]),
    hoaFee: toNumber(
      text.match(
        /\$([\d,]+)\s+(?:monthly\s+)?HOA\b|HOA fee:\s*\$([\d,]+)/i,
      )?.slice(1).find(Boolean),
    ),
    hoaFrequency:
      inferHoaFrequency(text.match(/\$([\d,]+)\s+(monthly|quarterly|yearly)\s+HOA/i)?.[2]),
    taxAnnual: toNumber(
      text.match(/Annual tax amount:\s*\$([\d,]+)/i)?.[1],
    ),
    taxAssessedValue: toNumber(
      text.match(/Tax assessed value:\s*\$([\d,]+)/i)?.[1],
    ),
    description: normalizeParagraph(descriptionMatch?.[1]),
    mlsNumber: toStringValue(text.match(/MLS#:\s*([A-Za-z0-9-]+)/i)?.[1]),
    listingAgentName: listedByMatch?.[1]?.trim(),
    listingAgentPhone: listedByMatch?.[2]?.trim(),
    listingBrokerage: listedByMatch?.[3]?.trim(),
  };
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

function pickBestListingRecord(raw: unknown, listingId: string): JsonRecord | undefined {
  const normalizedId = listingId.replace(/\D/g, "");
  let best: { record: JsonRecord; score: number } | undefined;

  walkRecords(raw, (record) => {
    const possibleId = [
      record.zpid,
      record.listingId,
      record.zillowId,
      asRecord(record.address)?.zpid,
    ]
      .map((value) => toStringValue(value))
      .find((value) => value != null);
    if (!possibleId) return;

    if (possibleId.replace(/\D/g, "") !== normalizedId) return;

    const score = STRUCTURED_DATA_SCORE_KEYS.reduce((total, key) => {
      return total + (key in record ? 1 : 0);
    }, 0);

    if (!best || score > best.score) {
      best = { record, score };
    }
  });

  if (best) return best.record;
  return asRecord(raw) ?? undefined;
}

function walkRecords(
  raw: unknown,
  visitor: (record: JsonRecord) => void,
): void {
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

function firstRecord(raw: unknown, keys: string[]): JsonRecord | undefined {
  const value = firstValue(raw, keys);
  return asRecord(value) ?? undefined;
}

function firstArray(raw: unknown, keys: string[]): unknown[] | undefined {
  const value = firstValue(raw, keys);
  return Array.isArray(value) ? value : undefined;
}

function buildAddressRecord(raw: unknown): JsonRecord | undefined {
  const street = toStringValue(
    firstValue(raw, ["streetAddress", "street", "line1", "address1"]),
  );
  const city = toStringValue(firstValue(raw, ["city", "addressLocality"]));
  const state = toStringValue(
    firstValue(raw, ["state", "addressRegion", "stateCode"]),
  );
  const zip = toStringValue(firstValue(raw, ["zipcode", "zip", "postalCode"]));
  const county = toStringValue(firstValue(raw, ["county"]));

  if (!street && !city && !state && !zip) return undefined;
  return {
    streetAddress: street,
    city,
    state,
    zipcode: zip,
    county,
  };
}

function normalizeStructuredAddress(raw: unknown): CanonicalAddress | undefined {
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
    toStringValue(record.zipcode) ??
    toStringValue(record.zip) ??
    toStringValue(record.postalCode);
  const county = toStringValue(record.county);

  if (!(street && city && state && zip)) return undefined;
  const normalized = normalizeAddress({
    raw: `${decodeHtmlEntities(street)}, ${decodeHtmlEntities(city)}, ${decodeHtmlEntities(state)} ${decodeHtmlEntities(zip)}`,
  });
  if (!normalized.valid) return undefined;
  if (county) {
    normalized.canonical.county = decodeHtmlEntities(county);
  }
  return normalized.canonical;
}

function buildCoordinatesRecord(raw: unknown): JsonRecord | undefined {
  const lat = toNumber(firstValue(raw, ["latitude", "lat"]));
  const lng = toNumber(firstValue(raw, ["longitude", "lng", "lon"]));
  if (lat == null || lng == null) return undefined;
  return { lat, lng };
}

function normalizeCoordinates(
  raw: unknown,
): ZillowCanonicalListingData["coordinates"] | undefined {
  const record = asRecord(raw);
  if (record) {
    const lat =
      toNumber(record.lat) ??
      toNumber(record.latitude);
    const lng =
      toNumber(record.lng) ??
      toNumber(record.longitude) ??
      toNumber(record.lon);
    if (lat != null && lng != null) {
      return { lat, lng };
    }
  }

  if (typeof raw === "string") {
    const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      return {
        lat: Number(match[1]),
        lng: Number(match[2]),
      };
    }
  }

  return undefined;
}

function normalizePhotoUrls(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
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
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function extractSchools(entries: unknown[] | undefined): {
  elementarySchool?: string;
  middleSchool?: string;
  highSchool?: string;
} {
  const result: {
    elementarySchool?: string;
    middleSchool?: string;
    highSchool?: string;
  } = {};
  if (!entries) return result;

  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record) continue;
    const name = toStringValue(record.name);
    if (!name) continue;
    const level = (
      toStringValue(record.level) ??
      toStringValue(record.schoolType) ??
      ""
    ).toLowerCase();

    if (!result.elementarySchool && level.includes("elementary")) {
      result.elementarySchool = name;
    } else if (!result.middleSchool && level.includes("middle")) {
      result.middleSchool = name;
    } else if (!result.highSchool && level.includes("high")) {
      result.highSchool = name;
    }
  }

  return result;
}

function splitBathrooms(
  full: number | undefined,
  half: number | undefined,
  total: number | undefined,
): { full?: number; half?: number } {
  if (full != null || half != null) {
    return {
      full,
      half,
    };
  }
  if (total == null) return {};
  const computedFull = Math.floor(total);
  const remainder = Number((total - computedFull).toFixed(1));
  return {
    full: computedFull,
    half: remainder >= 0.5 ? 1 : 0,
  };
}

function mapStatus(raw: unknown): ZillowListingStatus | undefined {
  const normalized = toStringValue(raw)?.toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized.includes("for_sale") ||
    normalized.includes("forsale") ||
    normalized.includes("active") ||
    normalized.includes("coming")
  ) {
    return "active";
  }
  if (normalized.includes("pending")) return "pending";
  if (normalized.includes("contingent")) return "contingent";
  if (normalized.includes("sold") || normalized.includes("off_market")) {
    return "sold";
  }
  if (normalized.includes("withdraw")) return "withdrawn";
  return undefined;
}

function normalizePropertyType(raw: unknown): string | undefined {
  const normalized = toStringValue(raw)?.trim();
  if (!normalized) return undefined;
  const compact = normalized.replace(/[_-]+/g, " ").toLowerCase();
  if (compact.includes("singlefamily")) return "Single Family";
  if (compact.includes("single family")) return "Single Family";
  if (compact.includes("townhouse") || compact.includes("townhome")) {
    return "Townhouse";
  }
  if (compact.includes("condo")) return "Condo";
  if (compact.includes("lot") || compact.includes("land")) return "Lot/Land";
  return compact.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeDaysOnMarket(raw: unknown): number | undefined {
  const value = toNumber(raw);
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
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function stripVisibleText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(?:p|div|section|article|li|h[1-6]|dd|dt|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
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
