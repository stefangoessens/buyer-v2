import { describe, expect, it } from "vitest";
import {
  buildReplyForStoredMessage,
  buildSmsHelpReply,
  mapSmsTemplateToTransportCategory,
  parseSupportedSmsListingUrl,
} from "../../../convex/sms/inboundHandler";

describe("sms inbound helper logic", () => {
  it("parses supported Zillow listing URLs", () => {
    const parsed = parseSupportedSmsListingUrl(
      "https://www.zillow.com/homedetails/123-Main-St-Miami-FL-33101/123456_zpid/",
    );

    expect(parsed).toMatchObject({
      portal: "zillow",
      listingId: "123456",
      normalizedUrl:
        "https://www.zillow.com/homedetails/123-Main-St-Miami-FL-33101/123456_zpid/",
    });
    expect(parsed?.addressHint).toBe("123 Main St Miami FL 33101");
  });

  it("recognizes unsupported portal hosts without pretending they are parseable", () => {
    const parsed = parseSupportedSmsListingUrl(
      "https://www.homes.com/property/123-main-st-miami-fl/example/",
    );

    expect(parsed).toEqual({
      rawUrl: "https://www.homes.com/property/123-main-st-miami-fl/example/",
      portal: "homes",
    });
  });

  it("prefers a ready deal-room reply when a room already exists", () => {
    const reply = buildReplyForStoredMessage({
      brandName: "buyer-v2",
      supportEmail: "support@example.com",
      enrollmentUrl: "http://localhost:3000/dashboard",
      dealRoomBaseUrl: "http://localhost:3000/dealroom",
      row: {
        status: "duplicate",
        dealRoomId: "deal_room_123",
      },
    });

    expect(reply).toBe(
      "Got it! Your analysis is ready: http://localhost:3000/dealroom/deal_room_123",
    );
  });

  it("builds CTIA-style help copy", () => {
    expect(
      buildSmsHelpReply("buyer-v2", "support@buyer-v2.com"),
    ).toContain("Reply STOP to opt out");
  });

  it("routes safety templates through the transactional transport rail", () => {
    expect(mapSmsTemplateToTransportCategory("wire-fraud-warning")).toBe(
      "transactional",
    );
    expect(
      mapSmsTemplateToTransportCategory("tour-reminder-2h"),
    ).toBe("relationship");
  });
});
