import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { extractRedfinListingHtml } from "@/lib/intake";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../python-workers/fixtures/html/redfin",
);

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

describe("extractRedfinListingHtml", () => {
  it("extracts a condo listing from JSON-LD first", () => {
    const result = extractRedfinListingHtml({
      html: loadFixture("redfin_condo_miami_beach.html"),
      sourceUrl:
        "https://www.redfin.com/FL/Miami-Beach/1420-Ocean-Dr-33139/unit-402/home/20000001",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("partial");
    expect(result.payload.data.address.formatted).toBe(
      "1420 Ocean Dr, Unit 402, Miami Beach, FL 33139",
    );
    expect(result.payload.data.coordinates).toEqual({
      lat: 25.783,
      lng: -80.13,
    });
    expect(result.payload.data.listPrice).toBe(725000);
    expect(result.payload.data.propertyType).toBe("Condo");
    expect(result.payload.data.beds).toBe(2);
    expect(result.payload.data.bathsFull).toBe(2);
    expect(result.payload.data.bathsHalf).toBe(0);
    expect(result.payload.data.sqftLiving).toBe(1150);
    expect(result.payload.data.hoaFee).toBe(675);
    expect(result.payload.data.daysOnMarket).toBe(9);
    expect(result.payload.data.mlsNumber).toBe("A11500001");
    expect(result.payload.data.photoCount).toBe(4);
    expect(result.payload.source.strategiesUsed).toContain("json-ld");
    expect(result.payload.source.fieldStrategies.listPrice).toBe("json-ld");
  });

  it("extracts a single-family listing from Redux state", () => {
    const result = extractRedfinListingHtml({
      html: loadFixture("redfin_sfh_cutler_bay.html"),
      sourceUrl:
        "https://www.redfin.com/FL/Cutler-Bay/19850-Old-Cutler-Rd-33189/home/20000005",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.redfinId).toBe("20000005");
    expect(result.payload.data.address.formatted).toBe(
      "19850 Old Cutler Rd, Cutler Bay, FL 33189",
    );
    expect(result.payload.data.listPrice).toBe(485000);
    expect(result.payload.data.propertyType).toBe("Single Family");
    expect(result.payload.data.beds).toBe(4);
    expect(result.payload.data.bathsFull).toBe(3);
    expect(result.payload.data.bathsHalf).toBe(0);
    expect(result.payload.data.sqftLiving).toBe(1680);
    expect(result.payload.data.lotSize).toBe(8712);
    expect(result.payload.data.yearBuilt).toBe(2000);
    expect(result.payload.data.daysOnMarket).toBe(34);
    expect(result.payload.data.mlsNumber).toBe("A11777005");
    expect(result.payload.source.strategiesUsed).toContain("redux-state");
    expect(result.payload.source.fieldStrategies.lotSize).toBe("redux-state");
  });

  it("falls back to HTML-only markup for townhouse variants", () => {
    const result = extractRedfinListingHtml({
      html: loadFixture("redfin_townhome_delray.html"),
      sourceUrl:
        "https://www.redfin.com/FL/Delray-Beach/710-Palm-Trail-33444/home/20000003",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.reviewState).toBe("complete");
    expect(result.payload.data.address.formatted).toBe(
      "710 Palm Trl, Delray Beach, FL 33444",
    );
    expect(result.payload.data.listPrice).toBe(620000);
    expect(result.payload.data.propertyType).toBe("Townhouse");
    expect(result.payload.data.beds).toBe(3);
    expect(result.payload.data.bathsFull).toBe(2);
    expect(result.payload.data.bathsHalf).toBe(1);
    expect(result.payload.data.sqftLiving).toBe(1850);
    expect(result.payload.data.yearBuilt).toBe(2018);
    expect(result.payload.data.hoaFee).toBe(320);
    expect(result.payload.data.hoaFrequency).toBe("monthly");
    expect(result.payload.data.daysOnMarket).toBe(15);
    expect(result.payload.data.photoCount).toBe(3);
    expect(result.payload.source.strategiesUsed).toContain("html-text");
    expect(result.payload.source.fieldStrategies.description).toBe("html-text");
  });

  it("returns a typed parser error when required fields are missing", () => {
    const result = extractRedfinListingHtml({
      html: "<html><body><main><h1>Nothing useful here</h1></main></body></html>",
      sourceUrl:
        "https://www.redfin.com/FL/Miami/999-Mystery-Rd-33101/home/44556677",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe("missing_required_fields");
    expect(result.error.listingId).toBe("44556677");
    expect(result.error.missingFields).toEqual(
      expect.arrayContaining(["address", "listPrice"]),
    );
    expect(result.error.attemptedStrategies).toContain("html-text");
  });

  it("rejects non-Redfin URLs before attempting extraction", () => {
    const result = extractRedfinListingHtml({
      html: loadFixture("redfin_condo_miami_beach.html"),
      sourceUrl:
        "https://www.zillow.com/homedetails/100-Las-Olas-Blvd-Fort-Lauderdale-FL-33301/12345678_zpid/",
      fetchedAt: "2026-04-12T12:00:00Z",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe("unsupported_platform");
    expect(result.error.attemptedStrategies).toEqual([]);
  });
});
