import { describe, it, expect } from "vitest";
import {
  SEO_ROUTES,
  publicSitemapRoutes,
  gatedRouteDisallowPaths,
  findRouteByPath,
} from "@/lib/seo/routes";

describe("SEO_ROUTES registry", () => {
  it("contains the homepage", () => {
    expect(findRouteByPath("/")).toBeDefined();
  });

  it("contains the core marketing routes", () => {
    expect(findRouteByPath("/pricing")).toBeDefined();
    expect(findRouteByPath("/savings")).toBeDefined();
    expect(findRouteByPath("/faq")).toBeDefined();
  });

  it("contains the three legal routes", () => {
    expect(findRouteByPath("/legal/terms")).toBeDefined();
    expect(findRouteByPath("/legal/privacy")).toBeDefined();
    expect(findRouteByPath("/legal/brokerage-disclosures")).toBeDefined();
  });

  it("contains gated/private routes so robots.txt can disallow them", () => {
    expect(findRouteByPath("/dashboard")).toBeDefined();
    expect(findRouteByPath("/property")).toBeDefined();
    expect(findRouteByPath("/console")).toBeDefined();
  });

  it("every route starts with /", () => {
    for (const r of SEO_ROUTES) {
      expect(r.path.startsWith("/")).toBe(true);
    }
  });

  it("every route has a non-negative priority", () => {
    for (const r of SEO_ROUTES) {
      expect(r.priority).toBeGreaterThanOrEqual(0);
      expect(r.priority).toBeLessThanOrEqual(1);
    }
  });

  it("homepage has the highest priority", () => {
    const home = findRouteByPath("/");
    expect(home?.priority).toBe(1.0);
  });

  it("every path is unique", () => {
    const paths = new Set<string>();
    for (const r of SEO_ROUTES) {
      expect(paths.has(r.path)).toBe(false);
      paths.add(r.path);
    }
  });
});

describe("publicSitemapRoutes", () => {
  it("returns only public routes", () => {
    for (const r of publicSitemapRoutes()) {
      expect(r.visibility).toBe("public");
    }
  });

  it("does not include gated or private routes", () => {
    const paths = publicSitemapRoutes().map((r) => r.path);
    expect(paths).not.toContain("/dashboard");
    expect(paths).not.toContain("/property");
    expect(paths).not.toContain("/console");
  });

  it("includes every marketing + legal public path", () => {
    const paths = publicSitemapRoutes().map((r) => r.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/savings");
    expect(paths).toContain("/faq");
    expect(paths).toContain("/legal/terms");
    expect(paths).toContain("/legal/privacy");
    expect(paths).toContain("/legal/brokerage-disclosures");
  });
});

describe("gatedRouteDisallowPaths", () => {
  it("returns only gated/private paths", () => {
    const disallow = gatedRouteDisallowPaths();
    expect(disallow).toContain("/dashboard");
    expect(disallow).toContain("/property");
    expect(disallow).toContain("/console");
  });

  it("does not include public paths", () => {
    const disallow = gatedRouteDisallowPaths();
    expect(disallow).not.toContain("/");
    expect(disallow).not.toContain("/pricing");
    expect(disallow).not.toContain("/faq");
  });

  it("public + gated = full registry size", () => {
    const pub = publicSitemapRoutes().length;
    const gated = gatedRouteDisallowPaths().length;
    expect(pub + gated).toBe(SEO_ROUTES.length);
  });
});

describe("findRouteByPath", () => {
  it("returns undefined for unknown path", () => {
    expect(findRouteByPath("/nope")).toBeUndefined();
  });

  it("is case-sensitive (fail-fast on casing drift)", () => {
    expect(findRouteByPath("/Pricing")).toBeUndefined();
    expect(findRouteByPath("/pricing")).toBeDefined();
  });
});
