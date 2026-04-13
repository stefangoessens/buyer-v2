import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mutationMock,
  setAuthMock,
  trackServerEventMock,
} = vi.hoisted(() => ({
  mutationMock: vi.fn(),
  setAuthMock: vi.fn(),
  trackServerEventMock: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({
    mutation: mutationMock,
    setAuth: setAuthMock,
  })),
}));

vi.mock("@/lib/analytics.server", () => ({
  trackServerEvent: trackServerEventMock,
}));

import { POST } from "@/app/api/extension/intake/route";

describe("POST /api/extension/intake", () => {
  beforeEach(() => {
    mutationMock.mockReset();
    setAuthMock.mockReset();
    trackServerEventMock.mockReset();
  });

  it("returns a redirect for a signed-out created intake", async () => {
    mutationMock.mockResolvedValue({
      kind: "created",
      authState: "signed_out",
      platform: "zillow",
      listingId: "12345",
      normalizedUrl: "https://www.zillow.com/homedetails/12345_zpid/",
      sourceListingId: "sl_1",
    });

    const response = await POST(
      new Request("http://localhost/api/extension/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://www.zillow.com/homedetails/12345_zpid/",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      kind: "created",
      authState: "signed_out",
      platform: "zillow",
    });
    expect(data.redirectUrl).toContain("/intake?");
    expect(data.redirectUrl).toContain("result=created");
    expect(data.redirectUrl).toContain("auth=signed_out");
    expect(trackServerEventMock).toHaveBeenCalledWith(
      "extension_intake_succeeded",
      expect.objectContaining({
        platform: "zillow",
        outcome: "created",
        authState: "signed_out",
      }),
    );
  });

  it("returns duplicate deterministically", async () => {
    mutationMock.mockResolvedValue({
      kind: "duplicate",
      authState: "signed_in",
      platform: "redfin",
      listingId: "9988",
      normalizedUrl: "https://www.redfin.com/FL/Miami/home/9988",
      sourceListingId: "sl_existing",
    });

    const response = await POST(
      new Request("http://localhost/api/extension/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://www.redfin.com/FL/Miami/home/9988",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      kind: "duplicate",
      authState: "signed_in",
      platform: "redfin",
    });
    expect(data.redirectUrl).toContain("result=duplicate");
    expect(data.redirectUrl).toContain("auth=signed_in");
  });

  it("returns unsupported_page deterministically", async () => {
    mutationMock.mockResolvedValue({
      kind: "unsupported",
      code: "unsupported_url",
      error: "Unsupported portal",
    });

    const response = await POST(
      new Request("http://localhost/api/extension/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://www.trulia.com/p/123",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data).toMatchObject({
      ok: false,
      kind: "unsupported",
      code: "unsupported_url",
    });
    expect(trackServerEventMock).toHaveBeenCalledWith(
      "extension_intake_failed",
      expect.objectContaining({
        code: "unsupported_url",
        stage: "submit",
      }),
    );
  });

  it("forwards bearer auth when present", async () => {
    mutationMock.mockResolvedValue({
      kind: "created",
      authState: "signed_in",
      platform: "realtor",
      listingId: "M123",
      normalizedUrl:
        "https://www.realtor.com/realestateandhomes-detail/example_M123",
      sourceListingId: "sl_auth",
    });

    await POST(
      new Request("http://localhost/api/extension/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          url: "https://www.realtor.com/realestateandhomes-detail/example_M123",
        }),
      }),
    );

    expect(setAuthMock).toHaveBeenCalledWith("test-token");
  });

  it("falls back to the Clerk session cookie for extension-origin requests", async () => {
    mutationMock.mockResolvedValue({
      kind: "created",
      authState: "signed_in",
      platform: "zillow",
      listingId: "12345",
      normalizedUrl: "https://www.zillow.com/homedetails/12345_zpid/",
      sourceListingId: "sl_cookie",
    });

    await POST(
      new Request("http://localhost/api/extension/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "__session=clerk-session-token; theme=dark",
        },
        body: JSON.stringify({
          url: "https://www.zillow.com/homedetails/12345_zpid/",
        }),
      }),
    );

    expect(setAuthMock).toHaveBeenCalledWith("clerk-session-token");
  });

  it("rejects invalid request payloads before hitting Convex", async () => {
    const response = await POST(
      new Request("http://localhost/api/extension/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "" }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      ok: false,
      code: "invalid_request",
    });
    expect(mutationMock).not.toHaveBeenCalled();
  });
});
