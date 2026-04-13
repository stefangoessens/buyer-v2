import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

const queryMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({
    query: queryMock,
  })),
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    queryMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns ok status with rich health metadata", async () => {
    queryMock.mockResolvedValue({
      status: "ok",
      service: "convex",
      environment: "test",
      release: "0.0.0",
      version: "0.0.0",
      timestamp: Date.now(),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.version).toBe("0.0.0");
    expect(data.release).toBeDefined();
    expect(data.environment).toBe("test");
    expect(data.service).toBe("buyer-v2-web");
    expect(data.timestamp).toBeDefined();
    expect(data.checks.web.status).toBe("ok");
    expect(data.checks.convex.status).toBe("ok");
    expect(data.checks.observability.metadata).toMatchObject({
      sentryConfigured: true,
      posthogConfigured: true,
    });
  });

  it("returns degraded when Convex is configured but unreachable", async () => {
    queryMock.mockRejectedValue(new Error("convex offline"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.checks.convex.status).toBe("error");
    expect(data.checks.convex.detail).toContain("convex offline");
  });
});
