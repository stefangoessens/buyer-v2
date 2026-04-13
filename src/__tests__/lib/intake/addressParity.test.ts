import { describe, expect, it } from "vitest";
import {
  matchAddress as matchAddressClient,
  normalizeAddress as normalizeAddressClient,
  type AddressMatchCandidate,
  type CanonicalAddress,
} from "@/lib/intake/address";
import {
  matchAddress as matchAddressServer,
  normalizeAddress as normalizeAddressServer,
} from "../../../../convex/lib/addressMatch";

const canonical = (overrides: Partial<CanonicalAddress> = {}): CanonicalAddress => ({
  street: "123 Main St",
  city: "Miami",
  state: "FL",
  zip: "33131",
  formatted: "123 Main St, Miami, FL 33131",
  ...overrides,
});

describe("manual address normalization parity", () => {
  it.each([
    "500 Brickell Avenue Miami FL 33131",
    "7411 Avenir Grove Way, Palm Beach Gardens, Florida 33418",
    "7411 Avenir Grove Way Palm Beach Gardens FL 33418",
    "2450 Oceanfront Blvd Apt 503, Hollywood, FL 33019",
    "100 Ocean Blvd Apt 12 Miami Beach FL 33139",
    "123 Main St Suite 4B Miami FL 33131-1234",
  ])("normalizes %s the same way in web and Convex", (raw) => {
    expect(normalizeAddressServer({ raw })).toEqual(
      normalizeAddressClient({ raw }),
    );
  });

  it("returns the same validation errors for unparseable raw input", () => {
    expect(normalizeAddressServer({ raw: "not an address" })).toEqual(
      normalizeAddressClient({ raw: "not an address" }),
    );
  });
});

describe("manual address match parity", () => {
  it("scores and buckets candidates identically in web and Convex", () => {
    const subject = canonical({
      street: "7411 Avenir Grove Way",
      city: "Palm Beach Gardens",
      zip: "33418",
      formatted: "7411 Avenir Grove Way, Palm Beach Gardens, FL 33418",
    });
    const candidates: AddressMatchCandidate[] = [
      {
        id: "prop_exact",
        canonical: subject,
      },
      {
        id: "prop_close",
        canonical: canonical({
          street: "7411 Avenir Grove Way",
          city: "Palm Beach Gardens",
          zip: "33418-1200",
          formatted:
            "7411 Avenir Grove Way, Palm Beach Gardens, FL 33418-1200",
        }),
      },
      {
        id: "prop_far",
        canonical: canonical({
          street: "999 Biscayne Blvd",
          city: "Miami",
          zip: "33132",
          formatted: "999 Biscayne Blvd, Miami, FL 33132",
        }),
      },
    ];

    expect(matchAddressServer(subject, candidates)).toEqual(
      matchAddressClient(subject, candidates),
    );
  });
});
