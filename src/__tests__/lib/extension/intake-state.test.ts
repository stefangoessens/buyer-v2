import { describe, expect, it } from "vitest";
import {
  buildExtensionIntakeRedirectUrl,
  getExtensionIntakeViewModel,
} from "@/lib/extension/intake-state";

describe("buildExtensionIntakeRedirectUrl", () => {
  it("encodes the typed extension intake state into the landing URL", () => {
    const url = buildExtensionIntakeRedirectUrl("https://buyer-v2.app", {
      kind: "created",
      authState: "signed_out",
      platform: "zillow",
      listingId: "12345",
      normalizedUrl: "https://www.zillow.com/homedetails/12345_zpid/",
      sourceListingId: "sl_123",
    });

    expect(url).toContain("/intake?");
    expect(url).toContain("source=extension");
    expect(url).toContain("result=created");
    expect(url).toContain("auth=signed_out");
  });
});

describe("getExtensionIntakeViewModel", () => {
  it("renders a signed-out created state explicitly", () => {
    const viewModel = getExtensionIntakeViewModel({
      kind: "created",
      authState: "signed_out",
      platform: "redfin",
      listingId: "9988",
      normalizedUrl: "https://www.redfin.com/FL/Miami/home/9988",
      sourceListingId: "sl_1",
    });

    expect(viewModel.title).toContain("Saved from Redfin");
    expect(viewModel.body).toContain("Sign in");
    expect(viewModel.primaryHref).toBe("/");
    expect(viewModel.statusLabel).toBe("Saved to intake");
  });

  it("renders a signed-in duplicate state explicitly", () => {
    const viewModel = getExtensionIntakeViewModel({
      kind: "duplicate",
      authState: "signed_in",
      platform: "realtor",
      listingId: "M123",
      normalizedUrl:
        "https://www.realtor.com/realestateandhomes-detail/example_M123",
      sourceListingId: "sl_existing",
    });

    expect(viewModel.title).toContain("already in buyer-v2");
    expect(viewModel.primaryHref).toBe("/dashboard");
    expect(viewModel.statusLabel).toBe("Duplicate listing");
  });
});
