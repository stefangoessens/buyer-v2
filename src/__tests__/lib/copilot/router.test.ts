import { describe, expect, it } from "vitest";
import {
  allRoutes,
  isEngineAvailable,
  routeForIntent,
} from "@/lib/copilot/router";
import { ALL_INTENTS } from "@/lib/copilot/intents";

describe("routeForIntent", () => {
  it("routes every intent to a defined engine", () => {
    for (const intent of ALL_INTENTS) {
      const route = routeForIntent(intent);
      expect(route.intent).toBe(intent);
      expect(route.engine).toBeTruthy();
      expect(route.description.length).toBeGreaterThan(0);
    }
  });

  it("routes pricing to the pricing engine", () => {
    expect(routeForIntent("pricing").engine).toBe("pricing");
  });

  it("routes offer to the offer engine", () => {
    expect(routeForIntent("offer").engine).toBe("offer");
  });

  it("routes other to guarded_general", () => {
    expect(routeForIntent("other").engine).toBe("guarded_general");
  });

  it("marks risks as planned (case synthesis not shipped)", () => {
    expect(routeForIntent("risks").availability).toBe("planned");
    expect(isEngineAvailable("risks")).toBe(false);
  });

  it("marks pricing/comps/costs/leverage/offer as available", () => {
    expect(isEngineAvailable("pricing")).toBe(true);
    expect(isEngineAvailable("comps")).toBe(true);
    expect(isEngineAvailable("costs")).toBe(true);
    expect(isEngineAvailable("leverage")).toBe(true);
    expect(isEngineAvailable("offer")).toBe(true);
  });
});

describe("allRoutes", () => {
  it("returns all 10 routes", () => {
    expect(allRoutes()).toHaveLength(10);
  });

  it("has one route per intent", () => {
    const routes = allRoutes();
    const intents = new Set(routes.map((r) => r.intent));
    expect(intents.size).toBe(10);
  });
});
