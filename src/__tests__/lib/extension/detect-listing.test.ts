import { describe, it, expect } from "vitest";
import {
  detectListingPage,
  buildIntakeForwardUrl,
} from "@/lib/extension/detect-listing";

describe("detectListingPage — empty / internal pages", () => {
  it("returns empty for undefined", () => {
    const result = detectListingPage(undefined);
    expect(result.status).toBe("empty");
  });

  it("returns empty for empty string", () => {
    const result = detectListingPage("");
    expect(result.status).toBe("empty");
  });

  it("returns empty for whitespace-only string", () => {
    const result = detectListingPage("   ");
    expect(result.status).toBe("empty");
  });

  it("returns empty for chrome:// URLs", () => {
    const result = detectListingPage("chrome://newtab");
    expect(result.status).toBe("empty");
    expect(result.message).toContain("Browser internal page");
  });

  it("returns empty for chrome-extension://", () => {
    const result = detectListingPage("chrome-extension://abc123/popup.html");
    expect(result.status).toBe("empty");
  });

  it("returns empty for about:blank", () => {
    const result = detectListingPage("about:blank");
    expect(result.status).toBe("empty");
  });

  it("returns empty for edge://", () => {
    const result = detectListingPage("edge://settings");
    expect(result.status).toBe("empty");
  });
});

describe("detectListingPage — supported listings (happy path)", () => {
  it("detects a Zillow listing URL", () => {
    const result = detectListingPage(
      "https://www.zillow.com/homedetails/123-Main-St-Miami-FL-33131/12345678_zpid/"
    );
    expect(result.status).toBe("supported_listing");
    expect(result.platform).toBe("zillow");
    expect(result.listingId).toBeDefined();
    expect(result.normalizedUrl).toBeDefined();
    expect(result.message).toContain("Zillow");
  });

  it("detects a Redfin listing URL", () => {
    const result = detectListingPage(
      "https://www.redfin.com/FL/Miami/123-Main-St-33131/home/12345678"
    );
    expect(result.status).toBe("supported_listing");
    expect(result.platform).toBe("redfin");
    expect(result.message).toContain("Redfin");
  });

  it("detects a Realtor.com listing URL", () => {
    const result = detectListingPage(
      "https://www.realtor.com/realestateandhomes-detail/123-Main-St_Miami_FL_33131_M12345-67890"
    );
    expect(result.status).toBe("supported_listing");
    expect(result.platform).toBe("realtor");
    expect(result.message).toContain("Realtor.com");
  });

  it("provides a forwardable normalizedUrl for listings", () => {
    const result = detectListingPage(
      "https://www.zillow.com/homedetails/123-Main-St-Miami-FL-33131/12345678_zpid/"
    );
    if (result.status !== "supported_listing") throw new Error("expected supported");
    expect(result.normalizedUrl).toMatch(/zillow\.com/);
  });

  it("message prompts user to click to save", () => {
    const result = detectListingPage(
      "https://www.zillow.com/homedetails/123-Main-St/12345678_zpid/"
    );
    expect(result.message).toMatch(/save to buyer-v2/i);
  });
});

describe("detectListingPage — unsupported or empty portal pages", () => {
  it("reports supported_portal_no_listing for Zillow index pages", () => {
    const result = detectListingPage("https://www.zillow.com/");
    expect(result.status).toBe("supported_portal_no_listing");
    expect(result.message).toContain("Open a listing");
  });

  it("reports unsupported_portal for non-listing domains", () => {
    const result = detectListingPage("https://www.google.com/");
    expect(result.status).toBe("unsupported_portal");
    expect(result.message).toContain("Zillow");
    expect(result.message).toContain("Redfin");
    expect(result.message).toContain("Realtor");
  });

  it("reports unsupported_portal for other real estate sites", () => {
    const result = detectListingPage("https://www.trulia.com/p/12345");
    expect(result.status).toBe("unsupported_portal");
  });
});

describe("detectListingPage — invalid URLs", () => {
  it("returns invalid_url for garbage input that can't be parsed as a URL", () => {
    const result = detectListingPage("not a url at all !!!");
    expect(result.status).toBe("invalid_url");
  });

  it("handles missing protocol gracefully", () => {
    // parseListingUrl prepends https:// if missing, so this should parse
    const result = detectListingPage(
      "zillow.com/homedetails/123-Main/12345_zpid/"
    );
    expect(result.status).toBe("supported_listing");
  });
});

describe("buildIntakeForwardUrl", () => {
  it("builds a well-formed intake URL", () => {
    const url = buildIntakeForwardUrl(
      "https://buyer-v2.app",
      "https://www.zillow.com/homedetails/123-Main-St/12345_zpid/"
    );
    expect(url).toMatch(/^https:\/\/buyer-v2\.app\/intake\?url=/);
    expect(url).toContain("source=extension");
  });

  it("URL-encodes the forwarded listing URL", () => {
    const url = buildIntakeForwardUrl(
      "https://buyer-v2.app",
      "https://www.zillow.com/homedetails/123 Main St/12345_zpid/"
    );
    expect(url).not.toContain("123 Main St");
    expect(url).toContain("123%20Main%20St");
  });

  it("strips trailing slash from base URL", () => {
    const url = buildIntakeForwardUrl(
      "https://buyer-v2.app/",
      "https://www.zillow.com/homedetails/123/12345_zpid/"
    );
    expect(url).toMatch(/^https:\/\/buyer-v2\.app\/intake\?/);
    expect(url).not.toMatch(/app\/\/intake/);
  });

  it("handles staging/preview subdomains", () => {
    const url = buildIntakeForwardUrl(
      "https://preview-abc123.buyer-v2.app",
      "https://www.redfin.com/FL/Miami/home/12345"
    );
    expect(url).toContain("preview-abc123.buyer-v2.app/intake");
  });
});

describe("detection states for extension popup rendering", () => {
  // These are the 5 states the popup needs to render distinct UI for.
  // The extension never lies about support — if the URL isn't a
  // listing on a supported portal, the popup says so explicitly.

  it("supported_listing enables the save CTA", () => {
    const result = detectListingPage(
      "https://www.zillow.com/homedetails/123/12345_zpid/"
    );
    expect(result.status).toBe("supported_listing");
    expect(result.normalizedUrl).toBeTruthy();
  });

  it("supported_portal_no_listing disables CTA, shows guidance", () => {
    const result = detectListingPage("https://www.redfin.com/");
    expect(result.status).toBe("supported_portal_no_listing");
    expect(result.normalizedUrl).toBeUndefined();
  });

  it("unsupported_portal disables CTA, lists supported portals", () => {
    const result = detectListingPage("https://www.bing.com/");
    expect(result.status).toBe("unsupported_portal");
    expect(result.normalizedUrl).toBeUndefined();
  });

  it("invalid_url disables CTA with clear error", () => {
    // An empty/internal page short-circuits to "empty" before parser runs.
    // The only way to hit invalid_url is a malformed but non-internal URL.
    const result = detectListingPage("https:///missing-host");
    expect(["invalid_url", "unsupported_portal"]).toContain(result.status);
  });

  it("empty disables CTA on internal pages", () => {
    const result = detectListingPage("chrome://extensions");
    expect(result.status).toBe("empty");
  });
});
