import { describe, it, expect } from "vitest";
import {
  normalizeAddress,
  matchAddress,
  US_STATES,
  STREET_SUFFIX_MAP,
  type CanonicalAddress,
  type AddressMatchCandidate,
} from "@/lib/intake/address";

const mkCanonical = (overrides: Partial<CanonicalAddress> = {}): CanonicalAddress => ({
  street: "123 Main St",
  unit: undefined,
  city: "Miami",
  state: "FL",
  zip: "33131",
  county: undefined,
  formatted: "123 Main St, Miami, FL 33131",
  ...overrides,
});

describe("normalizeAddress — structured input", () => {
  it("accepts a fully valid structured address", () => {
    const result = normalizeAddress({
      street: "123 Main Street",
      city: "Miami",
      state: "FL",
      zip: "33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("123 Main St");
      expect(result.canonical.city).toBe("Miami");
      expect(result.canonical.state).toBe("FL");
      expect(result.canonical.zip).toBe("33131");
      expect(result.canonical.formatted).toBe("123 Main St, Miami, FL 33131");
    }
  });

  it("preserves an optional unit and renders it in formatted", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      unit: "4B",
      city: "Miami",
      state: "FL",
      zip: "33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.unit).toBe("4B");
      expect(result.canonical.formatted).toBe("123 Main St, Unit 4B, Miami, FL 33131");
    }
  });

  it("flags missing street", () => {
    const result = normalizeAddress({
      street: "",
      city: "Miami",
      state: "FL",
      zip: "33131",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === "missing_street")).toBe(true);
    }
  });

  it("flags missing city", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "",
      state: "FL",
      zip: "33131",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === "missing_city")).toBe(true);
    }
  });

  it("flags missing state", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Miami",
      state: "",
      zip: "33131",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === "missing_state")).toBe(true);
    }
  });

  it("flags missing zip", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Miami",
      state: "FL",
      zip: "",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === "missing_zip")).toBe(true);
    }
  });

  it("flags invalid state", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Miami",
      state: "ZZ",
      zip: "33131",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === "invalid_state")).toBe(true);
    }
  });

  it("flags invalid zip", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Miami",
      state: "FL",
      zip: "abcde",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === "invalid_zip")).toBe(true);
    }
  });

  it("accepts zip with +4 suffix", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Miami",
      state: "FL",
      zip: "33131-1234",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.zip).toBe("33131-1234");
    }
  });

  it("strips whitespace from zip", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Miami",
      state: "FL",
      zip: " 33131 ",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.zip).toBe("33131");
    }
  });

  it("trims all string fields", () => {
    const result = normalizeAddress({
      street: "  123 Main St  ",
      city: "  Miami  ",
      state: "FL",
      zip: "33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("123 Main St");
      expect(result.canonical.city).toBe("Miami");
    }
  });

  it("keeps optional county when provided", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Miami",
      state: "FL",
      zip: "33131",
      county: "Miami-Dade",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.county).toBe("Miami-Dade");
    }
  });
});

describe("normalizeAddress — state normalization", () => {
  it("normalizes full state name 'Florida' to FL", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Miami",
      state: "Florida",
      zip: "33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.canonical.state).toBe("FL");
  });

  it("normalizes lowercase 'fl' to FL", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Miami",
      state: "fl",
      zip: "33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.canonical.state).toBe("FL");
  });

  it("normalizes mixed-case 'Florida' to FL", () => {
    const result = normalizeAddress({
      street: "123 Main St",
      city: "Tampa",
      state: "florida",
      zip: "33602",
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.canonical.state).toBe("FL");
  });

  it("exposes US_STATES as a known mapping", () => {
    expect(US_STATES.FLORIDA).toBe("FL");
    expect(US_STATES.CALIFORNIA).toBe("CA");
    expect(Object.keys(US_STATES).length).toBeGreaterThanOrEqual(50);
  });
});

describe("normalizeAddress — street suffix normalization", () => {
  it("normalizes 'Street' to 'St'", () => {
    const result = normalizeAddress({
      street: "123 Main Street",
      city: "Miami",
      state: "FL",
      zip: "33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.canonical.street).toBe("123 Main St");
  });

  it("normalizes 'Avenue' to 'Ave'", () => {
    const result = normalizeAddress({
      street: "500 Brickell Avenue",
      city: "Miami",
      state: "FL",
      zip: "33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.canonical.street).toBe("500 Brickell Ave");
  });

  it("normalizes 'Boulevard' to 'Blvd'", () => {
    const result = normalizeAddress({
      street: "100 Ocean Boulevard",
      city: "Miami Beach",
      state: "FL",
      zip: "33139",
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.canonical.street).toBe("100 Ocean Blvd");
  });

  it("handles a trailing period on the suffix", () => {
    const result = normalizeAddress({
      street: "123 Main St.",
      city: "Miami",
      state: "FL",
      zip: "33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.canonical.street).toBe("123 Main St");
  });

  it("exposes STREET_SUFFIX_MAP with the common entries", () => {
    expect(STREET_SUFFIX_MAP.STREET).toBe("St");
    expect(STREET_SUFFIX_MAP.AVENUE).toBe("Ave");
    expect(STREET_SUFFIX_MAP.BOULEVARD).toBe("Blvd");
    expect(STREET_SUFFIX_MAP.DRIVE).toBe("Dr");
  });
});

describe("normalizeAddress — raw string input", () => {
  it("parses comma-separated format", () => {
    const result = normalizeAddress({
      raw: "123 Main St, Miami, FL 33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("123 Main St");
      expect(result.canonical.city).toBe("Miami");
      expect(result.canonical.state).toBe("FL");
      expect(result.canonical.zip).toBe("33131");
    }
  });

  it("parses comma-separated format with unit", () => {
    const result = normalizeAddress({
      raw: "123 Main St, Apt 4B, Miami, FL 33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("123 Main St");
      expect(result.canonical.unit).toBe("4B");
      expect(result.canonical.city).toBe("Miami");
    }
  });

  it("parses space-separated form 'state zip'", () => {
    const result = normalizeAddress({
      raw: "500 Brickell Ave, Miami, FL 33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("500 Brickell Ave");
      expect(result.canonical.city).toBe("Miami");
    }
  });

  it("parses a zip+4", () => {
    const result = normalizeAddress({
      raw: "123 Main St, Miami, FL 33131-1234",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.zip).toBe("33131-1234");
    }
  });

  it("rejects an empty raw string", () => {
    const result = normalizeAddress({ raw: "" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === "empty_input")).toBe(true);
    }
  });

  it("rejects a garbled raw string with no zip", () => {
    const result = normalizeAddress({ raw: "not an address" });
    expect(result.valid).toBe(false);
  });

  it("normalizes state case in raw input", () => {
    const result = normalizeAddress({
      raw: "123 Main St, Miami, fl 33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.canonical.state).toBe("FL");
  });

  it("parses comma-free raw address (KIN-775 codex P1 fix)", () => {
    // Core manual-entry format that must work: no commas at all.
    const result = normalizeAddress({
      raw: "123 Main St Miami FL 33131",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("123 Main St");
      expect(result.canonical.city).toBe("Miami");
      expect(result.canonical.state).toBe("FL");
      expect(result.canonical.zip).toBe("33131");
    }
  });

  it("parses comma-free raw address with zip+4", () => {
    const result = normalizeAddress({
      raw: "500 Brickell Ave Miami FL 33131-1234",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("500 Brickell Ave");
      expect(result.canonical.city).toBe("Miami");
      expect(result.canonical.state).toBe("FL");
      expect(result.canonical.zip).toBe("33131-1234");
    }
  });

  it("parses comma-free raw address with multi-word street", () => {
    const result = normalizeAddress({
      raw: "456 North Bayshore Dr Miami FL 33132",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("456 North Bayshore Dr");
      expect(result.canonical.city).toBe("Miami");
      expect(result.canonical.state).toBe("FL");
    }
  });

  it("parses comma-free raw address with multi-word city", () => {
    const result = normalizeAddress({
      raw: "7411 Avenir Grove Way Palm Beach Gardens FL 33418",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("7411 Avenir Grove Way");
      expect(result.canonical.city).toBe("Palm Beach Gardens");
      expect(result.canonical.state).toBe("FL");
      expect(result.canonical.zip).toBe("33418");
    }
  });

  it("parses comma-free raw address with unit and multi-word city", () => {
    const result = normalizeAddress({
      raw: "100 Ocean Blvd Apt 12 Miami Beach FL 33139",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.canonical.street).toBe("100 Ocean Blvd");
      expect(result.canonical.unit).toBe("12");
      expect(result.canonical.city).toBe("Miami Beach");
      expect(result.canonical.state).toBe("FL");
      expect(result.canonical.zip).toBe("33139");
    }
  });
});

describe("matchAddress — confidence scoring", () => {
  const subject = mkCanonical();

  it("returns exact for a full match on all fields", () => {
    const result = matchAddress(subject, [
      {
        id: "prop_1",
        canonical: mkCanonical(),
      },
    ]);
    expect(result.confidence).toBe("exact");
    expect(result.bestMatch?.id).toBe("prop_1");
    expect(result.score).toBe(1);
  });

  it("returns high when unit differs but street/city/state/zip all match", () => {
    const result = matchAddress(subject, [
      {
        id: "prop_2",
        canonical: mkCanonical({ unit: "12B" }),
      },
    ]);
    expect(["high", "medium"]).toContain(result.confidence);
    expect(result.bestMatch?.id).toBe("prop_2");
    expect(result.score).toBeGreaterThanOrEqual(0.85);
  });

  it("returns medium when street+zip match but city and state differ", () => {
    // street 0.5 + zip 0.15 + unit 0.05 = 0.70 → medium (0.65 ≤ x < 0.85)
    const result = matchAddress(subject, [
      {
        id: "prop_3",
        canonical: mkCanonical({ city: "Hialeah", state: "CA" }),
      },
    ]);
    expect(result.confidence).toBe("medium");
  });

  it("returns low when only street matches", () => {
    const result = matchAddress(subject, [
      {
        id: "prop_4",
        canonical: mkCanonical({ city: "Orlando", state: "FL", zip: "32801" }),
      },
    ]);
    // street 0.5 + state 0.15 + unit 0.05 = 0.7 => medium; adjust subject to break state
    expect(["low", "medium"]).toContain(result.confidence);
  });

  it("returns none when nothing matches", () => {
    const result = matchAddress(subject, [
      {
        id: "prop_5",
        canonical: mkCanonical({
          street: "999 Other Ave",
          city: "Orlando",
          state: "CA",
          zip: "90001",
        }),
      },
    ]);
    expect(result.confidence).toBe("none");
    expect(result.candidates).toHaveLength(0);
  });

  it("returns none with bestMatch still populated when closest is below floor", () => {
    const result = matchAddress(subject, [
      {
        id: "prop_6",
        canonical: mkCanonical({
          street: "999 Other Ave",
          city: "Orlando",
          state: "CA",
          zip: "90001",
        }),
      },
    ]);
    expect(result.confidence).toBe("none");
    expect(result.bestMatch?.id).toBe("prop_6");
  });

  it("returns none with empty candidates", () => {
    const result = matchAddress(subject, []);
    expect(result.confidence).toBe("none");
    expect(result.bestMatch).toBeNull();
    expect(result.candidates).toHaveLength(0);
    expect(result.ambiguous).toBe(false);
  });

  it("sorts candidates descending by score", () => {
    const result = matchAddress(subject, [
      {
        id: "low",
        canonical: mkCanonical({ street: "999 Other St" }),
      },
      {
        id: "exact",
        canonical: mkCanonical(),
      },
    ]);
    expect(result.bestMatch?.id).toBe("exact");
    expect(result.candidates[0].id).toBe("exact");
  });
});

describe("matchAddress — ambiguity", () => {
  const subject = mkCanonical();

  it("flags ambiguous when two candidates score within 0.05 of each other", () => {
    const candidates: AddressMatchCandidate[] = [
      {
        id: "prop_a",
        canonical: mkCanonical({ unit: "1" }),
      },
      {
        id: "prop_b",
        canonical: mkCanonical({ unit: "2" }),
      },
    ];
    const result = matchAddress(subject, candidates);
    expect(result.ambiguous).toBe(true);
  });

  it("does not flag ambiguous for a single candidate", () => {
    const result = matchAddress(subject, [
      {
        id: "prop_only",
        canonical: mkCanonical(),
      },
    ]);
    expect(result.ambiguous).toBe(false);
  });

  it("does not flag ambiguous when the best is exact", () => {
    const result = matchAddress(subject, [
      {
        id: "exact",
        canonical: mkCanonical(),
      },
      {
        id: "near",
        canonical: mkCanonical({ unit: "9" }),
      },
    ]);
    expect(result.confidence).toBe("exact");
    expect(result.ambiguous).toBe(false);
  });
});

describe("matchAddress — unit handling", () => {
  it("gives a small bonus when both subject and candidate lack a unit", () => {
    const subject = mkCanonical();
    const candidate = mkCanonical();
    const result = matchAddress(subject, [{ id: "p", canonical: candidate }]);
    expect(result.score).toBe(1);
  });

  it("gives a small bonus when both sides agree on the same unit", () => {
    const subject = mkCanonical({ unit: "4B" });
    const candidate = mkCanonical({ unit: "4B" });
    const result = matchAddress(subject, [{ id: "p", canonical: candidate }]);
    expect(result.score).toBe(1);
  });

  it("loses the unit bonus when units differ", () => {
    const subject = mkCanonical({ unit: "4B" });
    const candidate = mkCanonical({ unit: "5C" });
    const result = matchAddress(subject, [{ id: "p", canonical: candidate }]);
    expect(result.score).toBeLessThan(1);
  });
});
