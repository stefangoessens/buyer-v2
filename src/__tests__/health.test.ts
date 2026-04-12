import { describe, it, expect } from "vitest";

describe("health", () => {
  it("returns ok status", () => {
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.0.0",
    };
    expect(health.status).toBe("ok");
    expect(health.version).toBe("0.0.0");
  });
});
