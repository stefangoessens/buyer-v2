import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env.server", () => ({
  serverEnv: {
    APP_ENV: "test",
    SERVICE_VERSION: "0.0.0",
  },
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns ok status with service metadata", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.service).toBe("web");
    expect(data.environment).toBe("test");
    expect(data.version).toBe("0.0.0");
    expect(data.timestamp).toBeDefined();
  });
});
