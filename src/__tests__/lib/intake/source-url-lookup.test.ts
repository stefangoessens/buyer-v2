import { describe, expect, it } from "vitest";
import { buildSourceUrlLookupCandidates } from "../../../../convex/intake";

describe("buildSourceUrlLookupCandidates", () => {
  it("prefers the canonical normalized URL before the raw submitted URL", () => {
    expect(
      buildSourceUrlLookupCandidates(
        "https://www.zillow.com/homedetails/123-Main-St/12345_zpid/?utm_source=test",
        "https://zillow.com/homedetails/123-Main-St/12345_zpid/",
      ),
    ).toEqual([
      "https://zillow.com/homedetails/123-Main-St/12345_zpid/",
      "https://www.zillow.com/homedetails/123-Main-St/12345_zpid/?utm_source=test",
    ]);
  });

  it("de-duplicates identical raw and normalized URLs", () => {
    expect(
      buildSourceUrlLookupCandidates(
        "https://www.redfin.com/FL/Miami/home/9988",
        "https://www.redfin.com/FL/Miami/home/9988",
      ),
    ).toEqual(["https://www.redfin.com/FL/Miami/home/9988"]);
  });
});
