import { describe, expect, it } from "vitest";
import {
  DEFAULT_BROKERAGE_EMAIL_SETTINGS,
  renderTemplate,
} from "@/lib/email/renderTemplate";

const settings = {
  ...DEFAULT_BROKERAGE_EMAIL_SETTINGS,
  outboundFromName: "Buyer V2 Brokerage",
  outboundFromEmail: "broker@buyer-v2.app",
  supportEmail: "support@buyer-v2.app",
  signaturePostalAddress: "121 Alhambra Plaza, Coral Gables, FL 33134",
  flLicenseNumber: "BK-1234567",
  unsubscribeUrl: "https://buyer-v2.app/dashboard/profile#notifications",
};

describe("renderTemplate", () => {
  it("renders the disclosure request template with brokerage footer text", async () => {
    const result = await renderTemplate("disclosure-request-to-agent", {
      listingAgentName: "Jordan Agent",
      buyerDisplayName: "Taylor Buyer",
      propertyAddress: "123 Ocean Drive, Miami Beach, FL 33139",
      personalNote: "Please send anything the seller already shared.",
      replyToAddress: "disclosures+deal-room-1@reply.buyer-v2.app",
      settings,
    });

    expect(result.stream).toBe("transactional");
    expect(result.subject).toBe(
      "Disclosure request — 123 Ocean Drive, Miami Beach, FL 33139",
    );
    expect(result.html).toContain("Jordan Agent");
    expect(result.html).toContain("disclosures+deal-room-1@reply.buyer-v2.app");
    expect(result.html).toContain(settings.unsubscribeUrl);
    expect(result.text).toContain("Personal note from the buyer");
    expect(result.text).toContain(settings.outboundFromName);
  });

  it("renders the waitlist template on the relationship stream", async () => {
    const result = await renderTemplate("waitlist-welcome", {
      buyerFirstName: "Alex",
      stateName: "Georgia",
      learnMoreUrl: "https://buyer-v2.app/waitlist",
      settings,
    });

    expect(result.stream).toBe("relationship");
    expect(result.subject).toBe("You're on the buyer-v2 waitlist for Georgia");
    expect(result.html).toContain("https://buyer-v2.app/waitlist");
    expect(result.html).toContain(settings.outboundFromEmail);
    expect(result.text).toContain("Georgia");
  });
});
