import { normalizeAddress, type CanonicalAddress } from "./address";
import { parseListingUrl } from "./parser";

export const REALTOR_EXTRACTION_STRATEGIES = [
  "json-ld",
  "next-data",
  "html-text",
] as const;

export type RealtorExtractionStrategy =
  (typeof REALTOR_EXTRACTION_STRATEGIES)[number];

export type RealtorListingStatus =
  | "active"
  | "pending"
  | "contingent"
  | "sold"
  | "withdrawn";

export interface RealtorCanonicalListingData {
  address: CanonicalAddress;
  coordinates?: {
    lat: number;
    lng: number;
  };
  realtorId: string;
  status?: RealtorListingStatus;
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
  description?: string;
  photoUrls?: string[];
  photoCount?: number;
  realtorEstimate?: number;
  mlsNumber?: string;
  listingAgentName?: string;
  listingBrokerage?: string;
}

export type RealtorExtractionField = keyof RealtorCanonicalListingData;

export interface RealtorExtractionSourceMetadata {
  sourcePlatform: "realtor";
  sourceUrl: string;
  normalizedUrl: string;
  listingId: string;
  fetchedAt: string;
  parser: "realtor-deterministic-v1";
  parserVersion: 1;
  strategiesUsed: RealtorExtractionStrategy[];
  fieldStrategies: Partial<
    Record<RealtorExtractionField, RealtorExtractionStrategy>
  >;
}

export interface RealtorExtractionPayload {
  reviewState: "complete" | "partial";
  missingFields: RealtorExtractionField[];
  data: RealtorCanonicalListingData;
  source: RealtorExtractionSourceMetadata;
}

export type RealtorParserErrorCode =
  | "invalid_source_url"
  | "unsupported_platform"
  | "missing_structured_data"
  | "missing_required_fields";

export interface RealtorParserError {
  code: RealtorParserErrorCode;
  message: string;
  platform: "realtor";
  sourceUrl: string;
  listingId?: string;
  normalizedUrl?: string;
  attemptedStrategies: RealtorExtractionStrategy[];
  missingFields?: RealtorExtractionField[];
}

export type RealtorExtractionResult =
  | { success: true; payload: RealtorExtractionPayload }
  | { success: false; error: RealtorParserError };

export interface RealtorExtractionInput {
  html: string;
  sourceUrl: string;
  fetchedAt?: string;
}

const REQUIRED_SUCCESS_FIELDS = ["address", "listPrice"] as const satisfies ReadonlyArray<RealtorExtractionField>;
const COMMON_EXPECTED_FIELDS = [
  "propertyType",
  "description",
  "photoUrls",
  "photoCount",
] as const satisfies ReadonlyArray<RealtorExtractionField>;
const RESIDENTIAL_EXPECTED_FIELDS = [
  "beds",
  "bathsFull",
  "sqftLiving",
  "yearBuilt",
] as const satisfies ReadonlyArray<RealtorExtractionField>;
const LOT_EXPECTED_FIELDS = ["lotSize"] as const satisfies ReadonlyArray<RealtorExtractionField>;
const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": "\"",
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};
const RESIDENTIAL_TYPE_MAP: Record<string, string> = {
  condo: "Condo",
  condominium: "Condo",
  condo_townhome_rowhome_coop: "Condo",
  condo_co_op: "Condo",
  co_op: "Condo",
  single_family: "Single Family",
  single_family_home: "Single Family",
  singlefamilyresidence: "Single Family",
  singlefamily: "Single Family",
  house: "Single Family",
  townhome: "Townhouse",
  townhouse: "Townhouse",
  multi_family: "Multi-Family",
  multi_family_home: "Multi-Family",
  duplex: "Multi-Family",
  triplex: "Multi-Family",
  fourplex: "Multi-Family",
  mobile: "Mobile Home",
  mobile_home: "Mobile Home",
  manufactured: "Mobile Home",
  land: "Lot/Land",
  vacantland: "Lot/Land",
  vacant_land: "Lot/Land",
  farms_ranches: "Lot/Land",
  new_construction: "New Construction",
};

type JsonRecord = Record<string, unknown>;

interface CandidateState {
  values: Partial<RealtorCanonicalListingData>;
  fieldStrategies: Partial<
    Record<RealtorExtractionField, RealtorExtractionStrategy>
  >;
  strategiesUsed: Set<RealtorExtractionStrategy>;
  attemptedStrategies: Set<RealtorExtractionStrategy>;
}

export function extractRealtorListingHtml(
  input: RealtorExtractionInput,
): RealtorExtractionResult {
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
        platform: "realtor",
        sourceUrl: input.sourceUrl,
        attemptedStrategies: [],
      },
    };
  }

  if (parsedUrl.data.platform !== "realtor") {
    return {
      success: false,
      error: {
        code: "unsupported_platform",
        message: `Expected a Realtor.com URL, received ${parsedUrl.data.platform}`,
        platform: "realtor",
        sourceUrl: input.sourceUrl,
        listingId: parsedUrl.data.listingId,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        attemptedStrategies: [],
      },
    };
  }

  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const listingId = extractRealtorListingId(parsedUrl.data.normalizedUrl);
  const state: CandidateState = {
    values: {},
    fieldStrategies: {},
    strategiesUsed: new Set(),
    attemptedStrategies: new Set(),
  };

  const jsonLdObjects = extractJsonLdObjects(input.html);
  if (jsonLdObjects.length > 0) {
    mergeCandidate(state, extractFromJsonLd(jsonLdObjects), "json-ld");
  }

  const nextData = extractNextData(input.html);
  if (nextData) {
    mergeCandidate(state, extractFromNextData(nextData), "next-data");
  }

  mergeCandidate(state, extractFromVisibleHtml(input.html), "html-text");

  const attemptedStrategies = Array.from(state.attemptedStrategies);
  const strategiesUsed = Array.from(state.strategiesUsed);
  if (attemptedStrategies.length === 0) {
    return {
      success: false,
      error: {
        code: "missing_structured_data",
        message:
          "No Realtor.com listing payload could be extracted from the fetched HTML",
        platform: "realtor",
        sourceUrl: input.sourceUrl,
        listingId,
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
        message: `Missing required Realtor.com fields: ${missingRequired.join(", ")}`,
        platform: "realtor",
        sourceUrl: input.sourceUrl,
        listingId,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        attemptedStrategies,
        missingFields: [...missingRequired],
      },
    };
  }

  if (!state.values.realtorId && listingId) {
    state.values.realtorId = listingId;
  }

  const propertyType = state.values.propertyType?.toLowerCase() ?? "";
  const completenessFields = [
    ...COMMON_EXPECTED_FIELDS,
    ...(propertyType.includes("land") ? LOT_EXPECTED_FIELDS : RESIDENTIAL_EXPECTED_FIELDS),
  ];
  const missingFields = completenessFields.filter(
    (field) => state.values[field] == null,
  );

  const data = state.values as RealtorCanonicalListingData;
  if (listingId) {
    data.realtorId = listingId;
  }
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
        sourcePlatform: "realtor",
        sourceUrl: input.sourceUrl,
        normalizedUrl: parsedUrl.data.normalizedUrl,
        listingId: listingId ?? parsedUrl.data.listingId,
        fetchedAt,
        parser: "realtor-deterministic-v1",
        parserVersion: 1,
        strategiesUsed,
        fieldStrategies: state.fieldStrategies,
      },
    },
  };
}

function mergeCandidate(
  state: CandidateState,
  candidate: Partial<RealtorCanonicalListingData>,
  strategy: RealtorExtractionStrategy,
): void {
  state.attemptedStrategies.add(strategy);
  let contributed = false;

  for (const [field, rawValue] of Object.entries(candidate) as Array<
    [RealtorExtractionField, RealtorCanonicalListingData[RealtorExtractionField]]
  >) {
    const value = normalizeFieldValue(field, rawValue);
    if (value == null) continue;
    if (
      state.values[field] !== undefined &&
      !shouldReplaceExistingValue(state, field, value)
    ) {
      continue;
    }
    assignCandidateField(state, field, value, strategy);
    contributed = true;
  }

  if (contributed) {
    state.strategiesUsed.add(strategy);
  }
}

function assignCandidateField<K extends RealtorExtractionField>(
  state: CandidateState,
  field: K,
  value: RealtorCanonicalListingData[K],
  strategy: RealtorExtractionStrategy,
): void {
  state.values[field] = value;
  state.fieldStrategies[field] = strategy;
}

function shouldReplaceExistingValue<K extends RealtorExtractionField>(
  state: CandidateState,
  field: K,
  incoming: RealtorCanonicalListingData[K],
): boolean {
  if (field !== "propertyType") return false;

  const current = state.values.propertyType;
  if (!current || typeof incoming !== "string") {
    return false;
  }

  return (
    propertyTypeSpecificity(incoming) > propertyTypeSpecificity(current)
  );
}

function normalizeFieldValue<K extends RealtorExtractionField>(
  field: K,
  value: RealtorCanonicalListingData[K],
): RealtorCanonicalListingData[K] | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed as RealtorCanonicalListingData[K];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return value as RealtorCanonicalListingData[K];
  }
  if (field === "coordinates") {
    const coords = value as RealtorCanonicalListingData["coordinates"];
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

function extractNextData(html: string): unknown | undefined {
  for (const script of extractScriptBlocks(html)) {
    if (!/id=(["'])__NEXT_DATA__\1/i.test(script.attrs)) continue;
    const parsed = parseJsonValue(script.content);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
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
    return undefined;
  }
}

function extractFromJsonLd(rawObjects: unknown[]): Partial<RealtorCanonicalListingData> {
  const listing = flattenJsonLd(rawObjects).find((entry) => {
    const typeTokens = [
      entry["@type"],
      entry.additionalType,
    ].flatMap(normalizeTypeTokens);

    return typeTokens.some((token) =>
      /(realestatelisting|residence|singlefamilyresidence|house|product|condo|townhouse)/i.test(
        token,
      ),
    );
  });

  if (!listing) return {};

  const offers = Array.isArray(listing.offers)
    ? asRecord(listing.offers[0])
    : asRecord(listing.offers);
  const address = normalizeStructuredAddress(listing.address);
  const coordinates = normalizeCoordinates(listing.geo);
  const photoUrls = normalizePhotoUrls(listing.image);
  const status = mapStatus(
    offers?.availability ?? listing.availability ?? listing.status,
  );
  const derivedBaths = splitBathrooms(
    toNumber(listing.numberOfFullBathrooms),
    toNumber(listing.numberOfPartialBathrooms),
    toNumber(listing.numberOfBathroomsTotal),
  );

  return {
    address,
    coordinates,
    status,
    listPrice: toNumber(offers?.price),
    propertyType: normalizePropertyType(
      listing.additionalType ?? listing["@type"],
    ),
    beds:
      toNumber(listing.numberOfBedrooms) ??
      toNumber(listing.numberOfRooms),
    bathsFull: derivedBaths.full,
    bathsHalf: derivedBaths.half,
    sqftLiving: toNumber(asRecord(listing.floorSize)?.value),
    yearBuilt: toNumber(listing.yearBuilt),
    description: normalizeParagraph(toStringValue(listing.description)),
    photoUrls,
    photoCount: photoUrls.length > 0 ? photoUrls.length : undefined,
  };
}

function extractFromNextData(raw: unknown): Partial<RealtorCanonicalListingData> {
  const record = pickBestNextDataListing(raw);
  if (!record) return {};

  const addressRecord = asRecord(record.address);
  const descriptionRecord = asRecord(record.description);
  const coordinateRecord = asRecord(record.coordinate);
  const hoaRecord = asRecord(record.hoa);
  const photoUrls = normalizePhotoUrls(record.photos);
  const derivedBaths = splitBathrooms(
    toNumber(descriptionRecord?.baths_full),
    toNumber(descriptionRecord?.baths_half),
    toNumber(
      descriptionRecord?.baths ??
        descriptionRecord?.baths_total ??
        descriptionRecord?.bathsFull,
    ),
  );

  return {
    realtorId:
      extractRealtorListingId(toStringValue(record.href) ?? "") ??
      extractRealtorListingId(toStringValue(record.url) ?? ""),
    address: normalizeStructuredAddress({
      streetAddress:
        addressRecord?.line ??
        addressRecord?.street_address ??
        addressRecord?.line1,
      city: addressRecord?.city,
      state: addressRecord?.state_code ?? addressRecord?.state,
      zip: addressRecord?.postal_code ?? addressRecord?.zip,
    }),
    coordinates: normalizeCoordinates({
      lat: coordinateRecord?.lat,
      lng: coordinateRecord?.lon ?? coordinateRecord?.lng,
    }),
    status: mapStatus(
      record.status ?? record.listing_status ?? record.product_type,
    ),
    listPrice: toNumber(
      record.list_price ?? record.price ?? record.current_price,
    ),
    listDate: toIsoDate(
      record.list_date ?? record.listed_date ?? record.last_update_date,
    ),
    daysOnMarket: normalizeDaysOnMarket(
      record.days_on_market ?? record.list_date_days,
    ),
    propertyType: normalizePropertyType(
      record.type ?? record.prop_type ?? record.sub_type,
    ),
    beds: toNumber(
      descriptionRecord?.beds ??
        descriptionRecord?.beds_max ??
        descriptionRecord?.beds_min ??
        record.beds,
    ),
    bathsFull: derivedBaths.full,
    bathsHalf: derivedBaths.half,
    sqftLiving: toNumber(
      descriptionRecord?.sqft ??
        descriptionRecord?.sqft_max ??
        descriptionRecord?.sqft_min ??
        record.sqft,
    ),
    lotSize: toNumber(
      descriptionRecord?.lot_sqft ??
        descriptionRecord?.lot_size ??
        record.lot_size,
    ),
    yearBuilt: toNumber(
      descriptionRecord?.year_built ?? record.year_built,
    ),
    stories: toNumber(
      descriptionRecord?.stories ?? record.stories,
    ),
    hoaFee: toNumber(hoaRecord?.fee ?? record.hoa_fee),
    hoaFrequency: inferHoaFrequency(
      hoaRecord?.fee_frequency ?? record.hoa_fee_frequency ?? hoaRecord?.fee,
    ),
    description: normalizeParagraph(
      toStringValue(record.public_remarks) ??
        toStringValue(record.description_text),
    ),
    photoUrls,
    photoCount: photoUrls.length > 0 ? photoUrls.length : undefined,
    mlsNumber: toStringValue(
      record.mls_number ?? record.mls_id ?? record.mls,
    ),
    listingAgentName: toStringValue(
      record.agent_name ?? record.listing_agent_name,
    ),
    listingBrokerage: toStringValue(
      record.broker_name ?? record.listing_brokerage,
    ),
  };
}

function pickBestNextDataListing(raw: unknown): JsonRecord | undefined {
  const root = asRecord(raw);
  const pageProps = safeRecord(root, "props", "pageProps");
  if (!pageProps) return undefined;

  const candidates: JsonRecord[] = [];
  for (const key of ["property", "listing", "home"]) {
    const candidate = asRecord(pageProps[key]);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  const redux = safeRecord(pageProps, "initialReduxState", "propertyDetails");
  if (redux) {
    for (const key of ["listing", "property", "home"]) {
      const candidate = asRecord(redux[key]);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  let best: { record: JsonRecord; score: number } | undefined;
  for (const candidate of candidates) {
    if (!hasSubstantiveListingFields(candidate)) continue;
    const score = [
      "list_price",
      "price",
      "current_price",
      "address",
      "coordinate",
      "description",
      "photos",
      "mls_number",
    ].reduce((total, key) => total + (candidate[key] != null ? 1 : 0), 0);

    if (!best || score > best.score) {
      best = { record: candidate, score };
    }
  }

  return best?.record;
}

function hasSubstantiveListingFields(record: JsonRecord): boolean {
  for (const key of [
    "list_price",
    "price",
    "current_price",
    "address",
    "description",
    "public_remarks",
  ]) {
    const value = record[key];
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as JsonRecord).length === 0) {
      continue;
    }
    return true;
  }
  return false;
}

function extractFromVisibleHtml(
  html: string,
): Partial<RealtorCanonicalListingData> {
  const address = normalizeStructuredAddress(
    extractNodeTextByAttribute(html, "data-testid", "address-block") ??
      extractMetaContent(html, "property", "og:title"),
  );
  const propertyMeta = parseBedsBathsSqft(
    extractNodeTextByAttribute(html, "data-testid", "property-meta"),
  );
  const description =
    normalizeParagraph(
      extractSectionTextByClass(html, "remarks"),
    ) ??
    toStringValue(extractMetaContent(html, "property", "og:description"));
  const price =
    parsePrice(extractNodeTextByAttribute(html, "data-testid", "price")) ??
    parsePrice(extractMetaContent(html, "name", "twitter:data1"));
  const facts = extractDataLabelFacts(html);
  const photoUrls = extractPhotoUrls(html);
  const derivedBaths = splitBathrooms(
    undefined,
    undefined,
    propertyMeta.baths,
  );

  return {
    address,
    listPrice: price,
    daysOnMarket: parseFirstNumber(facts["days-on-market"]),
    propertyType: normalizePropertyType(facts["property-type"]),
    beds: propertyMeta.beds,
    bathsFull: derivedBaths.full,
    bathsHalf: derivedBaths.half,
    sqftLiving: propertyMeta.sqft,
    lotSize: parseLotSize(facts["lot-size"]),
    yearBuilt: toNumber(facts["year-built"]),
    hoaFee: parseFirstNumber(facts["hoa-fee"]),
    hoaFrequency: inferHoaFrequency(facts["hoa-fee"]),
    description,
    photoUrls,
    photoCount: photoUrls.length > 0 ? photoUrls.length : undefined,
  };
}

function extractDataLabelFacts(html: string): Record<string, string> {
  const facts: Record<string, string> = {};
  const regex =
    /<[^>]*data-label=["']([^"']+)["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  for (const match of html.matchAll(regex)) {
    const label = match[1]?.trim().toLowerCase();
    const text = normalizeParagraph(stripTags(match[2] ?? ""));
    if (label && text) {
      facts[label] = text;
    }
  }
  return facts;
}

function extractNodeTextByAttribute(
  html: string,
  attribute: string,
  value: string,
): string | undefined {
  const escapedValue = escapeRegExp(value);
  const regex = new RegExp(
    `<[^>]*${attribute}=["']${escapedValue}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "i",
  );
  const match = html.match(regex);
  return normalizeParagraph(stripTags(match?.[1] ?? ""));
}

function extractSectionTextByClass(html: string, className: string): string | undefined {
  const escaped = escapeRegExp(className);
  const regex = new RegExp(
    `<section[^>]*class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/section>`,
    "i",
  );
  const match = html.match(regex);
  return normalizeParagraph(stripTags(match?.[1] ?? ""));
}

function extractMetaContent(
  html: string,
  attrName: "property" | "name",
  attrValue: string,
): string | undefined {
  const escaped = escapeRegExp(attrValue);
  const doubleQuoted = new RegExp(
    `<meta[^>]*${attrName}="${escaped}"[^>]*content="([^"]*)"[^>]*>`,
    "i",
  );
  const singleQuoted = new RegExp(
    `<meta[^>]*${attrName}='${escaped}'[^>]*content='([^']*)'[^>]*>`,
    "i",
  );
  const match = html.match(doubleQuoted) ?? html.match(singleQuoted);
  return toStringValue(match?.[1]);
}

function extractPhotoUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /<img\b([^>]*)>/gi;
  for (const match of html.matchAll(regex)) {
    const attrs = match[1] ?? "";
    if (
      !/data-testid=["']photo-\d+["']/i.test(attrs) &&
      !/class=["'][^"']*photo-card[^"']*["']/i.test(attrs)
    ) {
      continue;
    }
    const srcMatch =
      attrs.match(/\bsrc=["']([^"']+)["']/i) ??
      attrs.match(/\bdata-src=["']([^"']+)["']/i);
    const src = srcMatch?.[1]?.trim();
    if (src) {
      urls.push(src);
    }
  }
  return Array.from(new Set(urls));
}

function parseBedsBathsSqft(
  raw: string | undefined,
): { beds?: number; baths?: number; sqft?: number } {
  if (!raw) return {};

  return {
    beds: toNumber(raw.match(/(\d+(?:\.\d+)?)\s*bed/i)?.[1]),
    baths: toNumber(raw.match(/(\d+(?:\.\d+)?)\s*bath/i)?.[1]),
    sqft: toNumber(raw.match(/([\d,]+)\s*sqft/i)?.[1]),
  };
}

function parseLotSize(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  const value = toNumber(normalized.match(/([\d,.]+)/)?.[1]);
  if (value == null) return undefined;
  if (normalized.includes("acre")) {
    return Math.round(value * 43_560);
  }
  return Math.round(value);
}

function parseFirstNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  return toNumber(raw.match(/([\d,.]+)/)?.[1]);
}

function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/\$?\s*(\d+(?:[.,]\d+)*)\s*([kmb])?/i);
  if (!match) return undefined;

  const base = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return undefined;

  const suffix = match[2]?.toLowerCase();
  if (suffix === "k") return Math.round(base * 1_000);
  if (suffix === "m") return Math.round(base * 1_000_000);
  if (suffix === "b") return Math.round(base * 1_000_000_000);
  return Math.round(base);
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
    toStringValue(record.line) ??
    toStringValue(record.line1) ??
    toStringValue(record.street_address);
  const city =
    toStringValue(record.city) ?? toStringValue(record.addressLocality);
  const state =
    toStringValue(record.state) ??
    toStringValue(record.addressRegion) ??
    toStringValue(record.state_code) ??
    toStringValue(record.stateCode);
  const zip =
    toStringValue(record.zip) ??
    toStringValue(record.postalCode) ??
    toStringValue(record.postal_code) ??
    toStringValue(record.zip_code);
  const county = toStringValue(record.county);

  if (!(street && city && state && zip)) return undefined;

  const normalized = normalizeAddress({
    raw: `${street}, ${city}, ${state} ${zip}`,
  });
  if (!normalized.valid) return undefined;

  if (county) {
    normalized.canonical.county = county;
  }

  return normalized.canonical;
}

function normalizeCoordinates(
  raw: unknown,
): RealtorCanonicalListingData["coordinates"] | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const lat = toNumber(record.lat) ?? toNumber(record.latitude);
  const lng =
    toNumber(record.lng) ??
    toNumber(record.longitude) ??
    toNumber(record.lon);
  if (lat == null || lng == null) return undefined;
  return { lat, lng };
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

function normalizeTypeTokens(raw: unknown): string[] {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) =>
      typeof entry === "string" ? [entry] : [],
    );
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

function mapStatus(raw: unknown): RealtorListingStatus | undefined {
  const normalized = toStringValue(raw)?.toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized.includes("instock") ||
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
  const normalized = pickBestPropertyTypeToken(normalizeTypeTokens(raw));
  if (!normalized) return undefined;

  const compact = normalized.replace(/[\s-]+/g, "_").toLowerCase();
  const mapped = RESIDENTIAL_TYPE_MAP[compact];
  if (mapped) return mapped;

  if (compact.includes("single_family")) return "Single Family";
  if (compact.includes("townhome") || compact.includes("townhouse")) {
    return "Townhouse";
  }
  if (compact.includes("condo")) return "Condo";
  if (compact.includes("new_construction")) return "New Construction";
  if (compact.includes("land")) return "Lot/Land";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function propertyTypeSpecificity(value: string): number {
  return isGenericPropertyType(value) ? 1 : 2;
}

function isGenericPropertyType(value: string): boolean {
  const compact = value.replace(/[\s-]+/g, "_").toLowerCase();
  return (
    compact === "realestatelisting" ||
    compact === "real_estate_listing" ||
    compact === "product" ||
    compact === "residence"
  );
}

function pickBestPropertyTypeToken(tokens: string[]): string | undefined {
  let fallback: string | undefined;

  for (const token of tokens) {
    const decoded = decodeHtmlEntities(token).trim();
    if (!decoded) continue;
    if (!fallback) {
      fallback = decoded;
    }
    if (!isGenericPropertyType(decoded)) {
      return decoded;
    }
  }

  return fallback;
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
    normalized.includes("/mo") ||
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

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&nbsp;|&amp;|&quot;|&#39;|&apos;|&lt;|&gt;/g,
    (entity) => ENTITY_MAP[entity] ?? entity,
  );
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "));
}

function extractRealtorListingId(url: string): string | undefined {
  if (!url) return undefined;
  const normalized = url.replace(/[/?#]+$/, "");
  const matches = normalized.match(/M\d[\w-]*/gi);
  return matches?.at(-1);
}

function safeRecord(raw: unknown, ...path: string[]): JsonRecord | undefined {
  let current: unknown = raw;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return asRecord(current) ?? undefined;
}

function asRecord(raw: unknown): JsonRecord | null {
  return raw != null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as JsonRecord)
    : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
