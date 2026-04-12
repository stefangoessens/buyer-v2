import { describe, it, expect } from "vitest";
import { parseListingUrl } from "@/lib/intake";

describe("parseListingUrl", () => {
  describe("Zillow URLs", () => {
    it("parses standard homedetails URL", () => {
      const result = parseListingUrl(
        "https://www.zillow.com/homedetails/100-Las-Olas-Blvd-Fort-Lauderdale-FL-33301/12345678_zpid/",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platform).toBe("zillow");
        expect(result.data.listingId).toBe("12345678");
        expect(result.data.addressHint).toContain("Las Olas");
      }
    });

    it("parses short Zillow URL", () => {
      const result = parseListingUrl(
        "https://zillow.com/homes/87654321_zpid/",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platform).toBe("zillow");
        expect(result.data.listingId).toBe("87654321");
      }
    });

    it("strips tracking query params", () => {
      const result = parseListingUrl(
        "https://www.zillow.com/homedetails/Test/99999999_zpid/?utm_source=email&fbclid=abc",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.normalizedUrl).not.toContain("utm_source");
        expect(result.data.normalizedUrl).not.toContain("fbclid");
      }
    });

    it("handles Zillow URL without zpid", () => {
      const result = parseListingUrl(
        "https://www.zillow.com/homes/Fort-Lauderdale-FL/",
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("missing_listing_id");
      }
    });
  });

  describe("Redfin URLs", () => {
    it("parses standard Redfin URL", () => {
      const result = parseListingUrl(
        "https://www.redfin.com/FL/Fort-Lauderdale/100-Las-Olas-Blvd/home/123456",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platform).toBe("redfin");
        expect(result.data.listingId).toBe("123456");
        expect(result.data.addressHint).toBeTruthy();
      }
    });

    it("handles Redfin URL without home ID", () => {
      const result = parseListingUrl(
        "https://www.redfin.com/FL/Fort-Lauderdale/",
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("missing_listing_id");
      }
    });
  });

  describe("Realtor.com URLs", () => {
    it("parses standard Realtor URL", () => {
      const result = parseListingUrl(
        "https://www.realtor.com/realestateandhomes-detail/100-Las-Olas-Blvd_Fort-Lauderdale_FL_33301",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platform).toBe("realtor");
        expect(result.data.listingId).toBeTruthy();
      }
    });

    it("handles Realtor MLS ID URL", () => {
      const result = parseListingUrl(
        "https://realtor.com/realestateandhomes-detail/M12345-67890",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platform).toBe("realtor");
        expect(result.data.addressHint).toBeNull();
      }
    });
  });

  describe("Error cases", () => {
    it("rejects non-URL input", () => {
      const result = parseListingUrl("not a url at all");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("malformed_url");
      }
    });

    it("rejects empty string", () => {
      const result = parseListingUrl("");
      expect(result.success).toBe(false);
    });

    it("rejects unsupported domains", () => {
      const result = parseListingUrl(
        "https://www.google.com/search?q=homes",
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("unsupported_url");
      }
    });

    it("rejects other real estate sites", () => {
      const result = parseListingUrl(
        "https://www.trulia.com/p/fl/miami/123-main-st",
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("unsupported_url");
      }
    });
  });

  describe("Edge cases", () => {
    it("handles URL without protocol", () => {
      const result = parseListingUrl(
        "zillow.com/homedetails/Test/11111111_zpid/",
      );
      expect(result.success).toBe(true);
    });

    it("handles URL with trailing whitespace", () => {
      const result = parseListingUrl(
        "  https://zillow.com/homedetails/Test/22222222_zpid/  ",
      );
      expect(result.success).toBe(true);
    });

    it("preserves rawUrl", () => {
      const raw =
        "https://www.zillow.com/homedetails/Test/33333333_zpid/";
      const result = parseListingUrl(raw);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rawUrl).toBe(raw);
      }
    });
  });
});
