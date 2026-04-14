import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  HOME_HOW_IT_WORKS,
  homeHowItWorksStepsForSchema,
} from "@/content/home-how-it-works";
import { structuredDataForStaticPage } from "@/lib/seo/pageDefinitions";

let previousSiteUrl: string | undefined;

beforeEach(() => {
  previousSiteUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://buyerv2.com";
});

afterEach(() => {
  if (previousSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = previousSiteUrl;
  }
});

describe("HOME_HOW_IT_WORKS content", () => {
  it("has exactly 4 steps", () => {
    expect(HOME_HOW_IT_WORKS.steps).toHaveLength(4);
  });

  it("steps appear in canonical order: analyze → tour → offer → close", () => {
    expect(HOME_HOW_IT_WORKS.steps.map((s) => s.id)).toEqual([
      "analyze",
      "tour",
      "offer",
      "close",
    ]);
  });

  it("step numbers are 1..4 and match position", () => {
    HOME_HOW_IT_WORKS.steps.forEach((step, idx) => {
      expect(step.number).toBe(idx + 1);
    });
  });

  it("every step has non-empty title, description, and byline", () => {
    for (const step of HOME_HOW_IT_WORKS.steps) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.description.trim().length).toBeGreaterThan(0);
      expect(step.byline.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses [Brand] AI placeholder in the Analyze byline (not naked Kin AI)", () => {
    const analyze = HOME_HOW_IT_WORKS.steps.find((s) => s.id === "analyze");
    expect(analyze).toBeDefined();
    expect(analyze!.byline).toContain("[Brand] AI");
    expect(analyze!.byline).not.toMatch(/\bKin AI\b/);
  });

  it("Florida-first tone: at least 2 step descriptions mention Florida", () => {
    const floridaCount = HOME_HOW_IT_WORKS.steps.filter((s) =>
      s.description.includes("Florida"),
    ).length;
    expect(floridaCount).toBeGreaterThanOrEqual(2);
  });

  it("only the analyze step is bylined as AI; the rest are human", () => {
    const aiSteps = HOME_HOW_IT_WORKS.steps.filter(
      (s) => s.bylineKind === "ai",
    );
    expect(aiSteps).toHaveLength(1);
    expect(aiSteps[0]!.id).toBe("analyze");
  });

  it("ships an eyebrow, headline, intro, and cta", () => {
    expect(HOME_HOW_IT_WORKS.eyebrow.trim().length).toBeGreaterThan(0);
    expect(HOME_HOW_IT_WORKS.headline.trim().length).toBeGreaterThan(0);
    expect(HOME_HOW_IT_WORKS.intro.trim().length).toBeGreaterThan(0);
    expect(HOME_HOW_IT_WORKS.cta.label.trim().length).toBeGreaterThan(0);
    expect(HOME_HOW_IT_WORKS.cta.href.startsWith("/")).toBe(true);
  });
});

describe("homeHowItWorksStepsForSchema", () => {
  it("returns 4 schema entries with name + text", () => {
    const out = homeHowItWorksStepsForSchema();
    expect(out).toHaveLength(4);
    for (const entry of out) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.text).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.text.length).toBeGreaterThan(0);
    }
  });

  it("preserves step order", () => {
    const out = homeHowItWorksStepsForSchema();
    expect(out.map((e) => e.name)).toEqual([
      "Analyze",
      "Tour",
      "Offer",
      "Close",
    ]);
  });
});

describe("HowTo JSON-LD via structuredDataForStaticPage('home', ...)", () => {
  it("emits a HowTo schema with 4 ordered steps", () => {
    const ld = structuredDataForStaticPage("home", {
      howToSteps: homeHowItWorksStepsForSchema(),
    });

    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("HowTo");
    expect(typeof ld.name).toBe("string");
    expect(typeof ld.description).toBe("string");
    expect(ld.url).toBe("https://buyerv2.com/");

    const step = ld.step as Array<Record<string, unknown>>;
    expect(Array.isArray(step)).toBe(true);
    expect(step).toHaveLength(4);

    step.forEach((s, idx) => {
      expect(s["@type"]).toBe("HowToStep");
      expect(s.position).toBe(idx + 1);
      expect(typeof s.name).toBe("string");
      expect(typeof s.text).toBe("string");
      expect((s.name as string).length).toBeGreaterThan(0);
      expect((s.text as string).length).toBeGreaterThan(0);
    });
  });

  it("step names match the content step titles", () => {
    const ld = structuredDataForStaticPage("home", {
      howToSteps: homeHowItWorksStepsForSchema(),
    });
    const step = ld.step as Array<Record<string, unknown>>;
    expect(step.map((s) => s.name)).toEqual([
      "Analyze",
      "Tour",
      "Offer",
      "Close",
    ]);
  });

  it("returns an empty step array when howToSteps is omitted", () => {
    const ld = structuredDataForStaticPage("home");
    expect(ld["@type"]).toBe("HowTo");
    const step = ld.step as Array<unknown>;
    expect(Array.isArray(step)).toBe(true);
    expect(step).toHaveLength(0);
  });
});
