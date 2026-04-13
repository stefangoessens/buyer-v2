import { describe, expect, it } from "vitest";
import { appSurfaceDefinitions } from "@/lib/app-shell";

describe("app surface baseline", () => {
  it("defines the four route surfaces needed by the platform", () => {
    expect(appSurfaceDefinitions.marketing.rootPaths).toContain("/");
    expect(appSurfaceDefinitions.dealRoom.rootPaths).toContain("/property");
    expect(appSurfaceDefinitions.buyerApp.rootPaths).toContain("/dashboard");
    expect(appSurfaceDefinitions.internalConsole.rootPaths).toContain("/console");
  });

  it("keeps marketing public and static-ready", () => {
    expect(appSurfaceDefinitions.marketing.access).toBe("public");
    expect(appSurfaceDefinitions.marketing.runtime).toBe("nodejs");
    expect(appSurfaceDefinitions.marketing.dynamic).toBe("force-static");
  });

  it("marks gated and authenticated surfaces as node-only and non-indexable", () => {
    expect(appSurfaceDefinitions.dealRoom.runtime).toBe("nodejs");
    expect(appSurfaceDefinitions.buyerApp.runtime).toBe("nodejs");
    expect(appSurfaceDefinitions.internalConsole.runtime).toBe("nodejs");
    expect(appSurfaceDefinitions.dealRoom.metadata.robots).toMatchObject({
      index: false,
      follow: false,
    });
    expect(appSurfaceDefinitions.buyerApp.metadata.robots).toMatchObject({
      index: false,
      follow: false,
    });
    expect(appSurfaceDefinitions.internalConsole.metadata.robots).toMatchObject({
      index: false,
      follow: false,
    });
  });
});
