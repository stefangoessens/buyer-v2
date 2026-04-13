import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { extractRealtorListingHtml } from "@/lib/intake";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../python-workers/fixtures/html/realtor",
);

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

describe("extractRealtorListingHtml", () => {
  it("extracts a condo listing from JSON-LD data", () => {
    const result = extractRealtorListingHtml({
      html: loadFixture("realtor_condo_hollywood.html"),
      sourceUrl:
        "https://www.realtor.com/realestateandhomes-detail/2450-Oceanfront-Blvd-Apt-503_Hollywood_FL_33019_M30001-12345",
      fetchedAt: "2024-12-30T10:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.address.formatted).toBe(
      "2450 Oceanfront Blvd, Unit 503, Hollywood, FL 33019",
    );
    expect(result.payload.data.coordinates).toEqual({
      lat: 26.0112,
      lng: -80.1185,
    });
    expect(result.payload.data.realtorId).toBe("M30001-12345");
    expect(result.payload.data.status).toBe("active");
    expect(result.payload.data.listPrice).toBe(550000);
    expect(result.payload.data.propertyType).toBe("Condo");
    expect(result.payload.data.beds).toBe(2);
    expect(result.payload.data.bathsFull).toBe(2);
    expect(result.payload.data.bathsHalf).toBe(0);
    expect(result.payload.data.sqftLiving).toBe(950);
    expect(result.payload.data.yearBuilt).toBe(2014);
    expect(result.payload.data.photoCount).toBe(4);
    expect(result.payload.data.description).toContain("Hollywood Beach");
    expect(result.payload.source.strategiesUsed).toContain("json-ld");
    expect(result.payload.source.fieldStrategies.listPrice).toBe("json-ld");
  });

  it("extracts a single-family listing from __NEXT_DATA__", () => {
    const result = extractRealtorListingHtml({
      html: loadFixture("realtor_sfh_kendall.html"),
      sourceUrl:
        "https://www.realtor.com/realestateandhomes-detail/14322-SW-112th-St_Miami_FL_33196_M60004-11223",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.address.city).toBe("Miami");
    expect(result.payload.data.realtorId).toBe("M60004-11223");
    expect(result.payload.data.listPrice).toBe(615000);
    expect(result.payload.data.propertyType).toBe("Single Family");
    expect(result.payload.data.beds).toBe(4);
    expect(result.payload.data.bathsFull).toBe(2);
    expect(result.payload.data.bathsHalf).toBe(0);
    expect(result.payload.data.sqftLiving).toBe(1980);
    expect(result.payload.data.lotSize).toBe(8250);
    expect(result.payload.data.daysOnMarket).toBe(18);
    expect(result.payload.data.mlsNumber).toBe("A11700004");
    expect(result.payload.source.strategiesUsed).toContain("next-data");
    expect(result.payload.source.fieldStrategies.mlsNumber).toBe("next-data");
  });

  it("falls back to HTML-only parsing for a townhome page variant", () => {
    const result = extractRealtorListingHtml({
      html: loadFixture("realtor_townhome_sunrise.html"),
      sourceUrl:
        "https://www.realtor.com/realestateandhomes-detail/9840-Sawgrass-Point-Dr_Sunrise_FL_33323_M50003-24680",
      fetchedAt: "2025-01-20T09:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.address.city).toBe("Sunrise");
    expect(result.payload.data.realtorId).toBe("M50003-24680");
    expect(result.payload.data.listPrice).toBe(475000);
    expect(result.payload.data.propertyType).toBe("Townhouse");
    expect(result.payload.data.beds).toBe(3);
    expect(result.payload.data.bathsFull).toBe(2);
    expect(result.payload.data.bathsHalf).toBe(1);
    expect(result.payload.data.sqftLiving).toBe(1620);
    expect(result.payload.data.yearBuilt).toBe(2013);
    expect(result.payload.data.hoaFee).toBe(295);
    expect(result.payload.data.daysOnMarket).toBe(22);
    expect(result.payload.source.fieldStrategies.realtorId).toBeUndefined();
    expect(result.payload.source.strategiesUsed).toEqual(["html-text"]);
    expect(result.payload.source.fieldStrategies.hoaFee).toBe("html-text");
  });

  it("prefers a richer __NEXT_DATA__ property type over generic JSON-LD", () => {
    const result = extractRealtorListingHtml({
      html: loadFixture("realtor_new_construction_palm_beach_gardens.html"),
      sourceUrl:
        "https://www.realtor.com/realestateandhomes-detail/7411-Avenir-Grove-Way_Palm-Beach-Gardens_FL_33418_M70005-99887",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.propertyType).toBe("New Construction");
    expect(result.payload.source.fieldStrategies.propertyType).toBe(
      "next-data",
    );
  });

  it("scans past stub __NEXT_DATA__ blobs and preserves zero values", () => {
    const result = extractRealtorListingHtml({
      html: `
        <html>
          <head>
            <script id="__NEXT_DATA__" type="application/json">
              {"props":{"pageProps":{"property":{"listing_id":"stub-only"}}}}
            </script>
            <script id="__NEXT_DATA__" type="application/json">
              {
                "props": {
                  "pageProps": {
                    "listing": {
                      "href": "https://www.realtor.com/realestateandhomes-detail/88-Harbor-Point-Way_Tampa_FL_33602_M80006-44556",
                      "address": {
                        "line": "88 Harbor Point Way",
                        "city": "Tampa",
                        "state_code": "FL",
                        "postal_code": "33602"
                      },
                      "coordinate": {
                        "lat": 27.95,
                        "lon": -82.46
                      },
                      "status": "for_sale",
                      "list_price": 725000,
                      "days_on_market": 0,
                      "type": "NEW_CONSTRUCTION",
                      "public_remarks": "Fresh listing with a waterfront clubhouse.",
                      "photos": [
                        { "href": "https://cdn.example.com/photo-1.jpg" }
                      ],
                      "hoa": {
                        "fee": 0,
                        "fee_frequency": "monthly"
                      },
                      "description": {
                        "beds": 4,
                        "baths": 3.5,
                        "baths_full": 3,
                        "baths_half": 1,
                        "sqft": 2450,
                        "year_built": 2026
                      }
                    }
                  }
                }
              }
            </script>
          </head>
          <body></body>
        </html>
      `,
      sourceUrl:
        "https://www.realtor.com/realestateandhomes-detail/88-Harbor-Point-Way_Tampa_FL_33602_M80006-44556",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.address.city).toBe("Tampa");
    expect(result.payload.data.realtorId).toBe("M80006-44556");
    expect(result.payload.data.propertyType).toBe("New Construction");
    expect(result.payload.data.daysOnMarket).toBe(0);
    expect(result.payload.data.hoaFee).toBe(0);
    expect(result.payload.data.hoaFrequency).toBe("monthly");
    expect(result.payload.source.strategiesUsed).toEqual(["next-data"]);
    expect(result.payload.source.fieldStrategies.daysOnMarket).toBe(
      "next-data",
    );
    expect(result.payload.source.fieldStrategies.hoaFee).toBe("next-data");
  });

  it("returns a typed parser error when required fields are missing", () => {
    const result = extractRealtorListingHtml({
      html: `
        <html>
          <head>
            <meta property="og:title" content="11 Missing Rd, Melbourne, FL 32901" />
          </head>
          <body>
            <h1 data-testid="address-block">11 Missing Rd, Melbourne, FL 32901</h1>
          </body>
        </html>
      `,
      sourceUrl:
        "https://www.realtor.com/realestateandhomes-detail/11-Missing-Rd_Melbourne_FL_32901_M11122-23334",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe("missing_required_fields");
    expect(result.error.listingId).toBe("M11122-23334");
    expect(result.error.missingFields).toEqual(["listPrice"]);
    expect(result.error.attemptedStrategies).toContain("html-text");
  });

  it("returns a schema-drift error when no strategy yields listing fields", () => {
    const result = extractRealtorListingHtml({
      html: `
        <html>
          <head>
            <script id="__NEXT_DATA__" type="application/json">
              {"props":{"pageProps":{"property":{"listing_id":"stub-only"}}}}
            </script>
          </head>
          <body>
            <main>No listing details available.</main>
          </body>
        </html>
      `,
      sourceUrl:
        "https://www.realtor.com/realestateandhomes-detail/99-Unknown-St_Orlando_FL_32801_M99999-00001",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe("missing_structured_data");
    expect(result.error.listingId).toBe("M99999-00001");
    expect(result.error.attemptedStrategies).toEqual(["html-text"]);
  });

  it("rejects non-Realtor URLs before attempting extraction", () => {
    const result = extractRealtorListingHtml({
      html: loadFixture("realtor_condo_hollywood.html"),
      sourceUrl:
        "https://www.zillow.com/homedetails/100-Las-Olas-Blvd-Fort-Lauderdale-FL-33301/12345678_zpid/",
      fetchedAt: "2024-12-30T10:00:00Z",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe("unsupported_platform");
    expect(result.error.attemptedStrategies).toEqual([]);
  });
});
