import { describe, it, expect } from "vitest";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";
import type { FAQTheme } from "@/lib/content/types";

/**
 * Regression guards for the themed FAQ catalog (KIN-1085).
 *
 * The /faq page reorganised around three editorial themes
 * (`how_it_works`, `how_you_save`, `protection`). These tests lock
 * the public-facing shape of the catalog so a typo in `theme` or a
 * loose underscore in an `id` fails CI loudly instead of silently
 * breaking jump-nav, FAQPage JSON-LD URLs, or the per-theme balance
 * the IA work was designed around.
 */

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VALID_THEMES: ReadonlySet<FAQTheme> = new Set([
  "how_it_works",
  "how_you_save",
  "protection",
]);

describe("themed FAQ catalog", () => {
  const publicEntries = filterPublic(FAQ_ENTRIES);

  it("ships exactly 18 public entries", () => {
    expect(publicEntries).toHaveLength(18);
  });

  it("ships exactly 20 entries total (18 public + 2 internal)", () => {
    expect(FAQ_ENTRIES).toHaveLength(20);
  });

  it("every public entry has a theme in the approved set", () => {
    for (const entry of publicEntries) {
      expect(VALID_THEMES.has(entry.theme)).toBe(true);
    }
  });

  it("balances themes across 7 / 4 / 7 public entries", () => {
    const counts: Record<FAQTheme, number> = {
      how_it_works: 0,
      how_you_save: 0,
      protection: 0,
    };
    for (const entry of publicEntries) {
      counts[entry.theme]++;
    }
    expect(counts.how_it_works).toBe(7);
    expect(counts.how_you_save).toBe(4);
    expect(counts.protection).toBe(7);
  });

  it("every entry id is kebab-case (no underscores, no uppercase)", () => {
    for (const entry of FAQ_ENTRIES) {
      expect(
        KEBAB_CASE.test(entry.id),
        `entry id "${entry.id}" must be kebab-case`
      ).toBe(true);
      expect(entry.id.includes("_")).toBe(false);
    }
  });

  it("every public entry id is unique", () => {
    const seen = new Set<string>();
    for (const entry of publicEntries) {
      expect(seen.has(entry.id), `duplicate public id "${entry.id}"`).toBe(
        false
      );
      seen.add(entry.id);
    }
  });

  it("filterPublic strips every internal entry", () => {
    for (const entry of publicEntries) {
      expect(entry.visibility).toBe("public");
    }
  });

  it("internal FAQ entries are still present in the unfiltered catalog", () => {
    const internals = FAQ_ENTRIES.filter((e) => e.visibility === "internal");
    expect(internals.length).toBeGreaterThan(0);
    // Both legacy internal entries survived the rename to kebab-case
    // ids — the UI never renders them, but ops still review them in
    // the source file.
    expect(internals.map((e) => e.id).sort()).toEqual([
      "internal-agent-bonus-split",
      "internal-eng-roadmap",
    ]);
  });
});
