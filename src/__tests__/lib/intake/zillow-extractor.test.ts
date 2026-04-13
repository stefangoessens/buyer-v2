import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { extractZillowListingHtml } from "@/lib/intake";

const TS_FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../test/fixtures/zillow",
);
const WORKER_FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../python-workers/fixtures/html/zillow",
);

const SOUTH_FLORIDA_FIXTURES = [
  {
    name: "zillow_condo_miami.html",
    address: "482 Bayshore Ct, Unit 1204, Miami, FL 33131",
    city: "Miami",
    price: 675000,
    propertyType: "Condo",
    beds: 2,
    bathsFull: 2,
    bathsHalf: 0,
    sqftLiving: 1080,
    primaryStrategy: "apollo-cache",
  },
  {
    name: "zillow_sfh_boca_raton.html",
    address: "7421 Mirabella Way, Boca Raton, FL 33433",
    city: "Boca Raton",
    price: 1250000,
    propertyType: "Single Family",
    beds: 4,
    bathsFull: 3,
    bathsHalf: 0,
    sqftLiving: 2800,
    primaryStrategy: "apollo-cache",
  },
  {
    name: "zillow_townhome_fort_lauderdale.html",
    address: "1150 Riverwalk Ln, Fort Lauderdale, FL 33301",
    city: "Fort Lauderdale",
    price: 540000,
    propertyType: "Townhouse",
    beds: 3,
    bathsFull: 2,
    bathsHalf: 1,
    sqftLiving: 1750,
    primaryStrategy: "html-text",
  },
  {
    name: "zillow_new_construction_doral.html",
    address: "9088 Palmera Isle Blvd, Doral, FL 33172",
    city: "Doral",
    price: 1450000,
    propertyType: "New Construction",
    beds: 5,
    bathsFull: 4,
    bathsHalf: 0,
    sqftLiving: 3400,
    primaryStrategy: "apollo-cache",
  },
  {
    name: "zillow_sfh_homestead.html",
    address: "2644 SW 145th Pl, Homestead, FL 33032",
    city: "Homestead",
    price: 395000,
    propertyType: "Single Family",
    beds: 3,
    bathsFull: 2,
    bathsHalf: 0,
    sqftLiving: 1440,
    primaryStrategy: "apollo-cache",
  },
] as const;

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(TS_FIXTURE_DIR, name), "utf8");
}

function loadWorkerFixture(name: string): string {
  return fs.readFileSync(path.join(WORKER_FIXTURE_DIR, name), "utf8");
}

function workerFixtureUrl(html: string): string {
  const sourceUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  if (!sourceUrl) {
    throw new Error("Worker fixture is missing og:url metadata");
  }
  return sourceUrl;
}

describe("extractZillowListingHtml", () => {
  it("extracts a condo listing from __NEXT_DATA__", () => {
    const result = extractZillowListingHtml({
      html: loadFixture("condo-next-data.html"),
      sourceUrl:
        "https://www.zillow.com/homedetails/100-Las-Olas-Blvd-1001-Fort-Lauderdale-FL-33301/12345678_zpid/",
      fetchedAt: "2024-12-30T10:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.address.formatted).toBe(
      "100 Las Olas Blvd, Unit 1001, Fort Lauderdale, FL 33301",
    );
    expect(result.payload.data.listPrice).toBe(875000);
    expect(result.payload.data.propertyType).toBe("Condo");
    expect(result.payload.data.bathsHalf).toBe(1);
    expect(result.payload.data.hoaFee).toBe(850);
    expect(result.payload.data.zestimate).toBe(890000);
    expect(result.payload.data.listingAgentName).toBe("Jane Smith");
    expect(result.payload.data.elementarySchool).toBe("Virginia Shuman Young");
    expect(result.payload.source.strategiesUsed).toContain("next-data");
    expect(result.payload.source.fieldStrategies.listPrice).toBe("next-data");
  });

  it.each(SOUTH_FLORIDA_FIXTURES)(
    "extracts canonical Zillow payloads from $name",
    ({
      name,
      address,
      city,
      price,
      propertyType,
      beds,
      bathsFull,
      bathsHalf,
      sqftLiving,
      primaryStrategy,
    }) => {
      const html = loadWorkerFixture(name);
      const sourceUrl = workerFixtureUrl(html);
      const result = extractZillowListingHtml({
        html,
        sourceUrl,
        fetchedAt: "2026-04-13T11:00:00Z",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.payload.data.address.formatted).toBe(address);
      expect(result.payload.data.address.city).toBe(city);
      expect(result.payload.data.listPrice).toBe(price);
      expect(result.payload.data.propertyType).toBe(propertyType);
      expect(result.payload.data.beds).toBe(beds);
      expect(result.payload.data.bathsFull).toBe(bathsFull);
      expect(result.payload.data.bathsHalf).toBe(bathsHalf);
      expect(result.payload.data.sqftLiving).toBe(sqftLiving);
      expect(result.payload.source.sourcePlatform).toBe("zillow");
      expect(result.payload.source.parser).toBe("zillow-deterministic-v1");
      expect(result.payload.source.listingId).toMatch(/^\d+$/);
      expect(result.payload.source.fieldStrategies.address).toBeDefined();
      expect(result.payload.source.strategiesUsed).toContain(primaryStrategy);
    },
  );

  it("extracts a single-family listing from Apollo cache data", () => {
    const result = extractZillowListingHtml({
      html: loadFixture("single-family-apollo.html"),
      sourceUrl:
        "https://www.zillow.com/homedetails/4321-Banyan-Dr-Coral-Gables-FL-33146/99887766_zpid/",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.address.city).toBe("Coral Gables");
    expect(result.payload.data.status).toBe("active");
    expect(result.payload.data.listPrice).toBe(2450000);
    expect(result.payload.data.propertyType).toBe("Single Family");
    expect(result.payload.data.beds).toBe(4);
    expect(result.payload.data.bathsFull).toBe(3);
    expect(result.payload.data.bathsHalf).toBe(1);
    expect(result.payload.data.taxAssessedValue).toBe(1240000);
    expect(result.payload.data.photoCount).toBe(3);
    expect(result.payload.data.listingBrokerage).toBe("Sunshore Realty");
    expect(result.payload.source.strategiesUsed).toContain("apollo-cache");
    expect(result.payload.source.fieldStrategies.taxAssessedValue).toBe(
      "apollo-cache",
    );
  });

  it("merges JSON-LD with visible text fallback for a townhouse page variant", () => {
    const result = extractZillowListingHtml({
      html: loadFixture("townhouse-jsonld-text.html"),
      sourceUrl:
        "https://www.zillow.com/homedetails/8102-Palm-Gate-Ct-Boca-Raton-FL-33433/55667788_zpid/",
      fetchedAt: "2025-01-20T09:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.address.city).toBe("Boca Raton");
    expect(result.payload.data.listPrice).toBe(639000);
    expect(result.payload.data.propertyType).toBe("Townhouse");
    expect(result.payload.data.beds).toBe(3);
    expect(result.payload.data.bathsFull).toBe(2);
    expect(result.payload.data.sqftLiving).toBe(1725);
    expect(result.payload.data.hoaFee).toBe(425);
    expect(result.payload.data.mlsNumber).toBe("RX-10987654");
    expect(result.payload.data.listingAgentPhone).toBe("(561) 555-0102");
    expect(result.payload.source.strategiesUsed).toEqual(
      expect.arrayContaining(["json-ld", "html-text"]),
    );
    expect(result.payload.source.fieldStrategies.address).toBe("json-ld");
    expect(result.payload.source.fieldStrategies.hoaFee).toBe("html-text");
  });

  it("returns missing_structured_data when no strategy can extract any fields", () => {
    const result = extractZillowListingHtml({
      html: "<html><body><main>totally unrelated</main></body></html>",
      sourceUrl:
        "https://www.zillow.com/homedetails/101-Nowhere-Ln-Miami-FL-33101/12312312_zpid/",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe("missing_structured_data");
    expect(result.error.listingId).toBe("12312312");
    expect(result.error.normalizedUrl).toBe(
      "https://zillow.com/homedetails/101-Nowhere-Ln-Miami-FL-33101/12312312_zpid/",
    );
    expect(result.error.attemptedStrategies).toEqual(["html-text"]);
  });

  it("returns a typed parser error when required fields are missing", () => {
    const result = extractZillowListingHtml({
      html: loadFixture("missing-required-fields.html"),
      sourceUrl:
        "https://www.zillow.com/homedetails/999-Mystery-Rd-Miami-FL-33101/44556677_zpid/",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe("missing_required_fields");
    expect(result.error.listingId).toBe("44556677");
    expect(result.error.normalizedUrl).toBe(
      "https://zillow.com/homedetails/999-Mystery-Rd-Miami-FL-33101/44556677_zpid/",
    );
    expect(result.error.missingFields).toEqual(["listPrice"]);
    expect(result.error.attemptedStrategies).toEqual(["html-text"]);
  });

  it("rejects non-Zillow URLs before attempting extraction", () => {
    const result = extractZillowListingHtml({
      html: loadFixture("condo-next-data.html"),
      sourceUrl:
        "https://www.redfin.com/FL/Fort-Lauderdale/100-Las-Olas-Blvd/home/123456",
      fetchedAt: "2024-12-30T10:00:00Z",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe("unsupported_platform");
    expect(result.error.attemptedStrategies).toEqual([]);
  });
});
