import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import IntakePage from "@/app/(marketing)/intake/page";
import { buildSignedLink } from "@/lib/intake/sms";

async function renderPage(
  searchParams: Record<string, string | undefined>,
): Promise<string> {
  const element = await IntakePage({
    searchParams: Promise.resolve(searchParams),
  });

  return renderToStaticMarkup(element);
}

describe("app/(marketing)/intake/page", () => {
  const previousSecret = process.env.SMS_SIGNED_LINK_SECRET;

  beforeEach(() => {
    process.env.SMS_SIGNED_LINK_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.SMS_SIGNED_LINK_SECRET = previousSecret;
  });

  it("accepts a valid signed SMS intake link", async () => {
    const link = await buildSignedLink(
      "https://app.example.com",
      "https://zillow.com/homedetails/Test-Home/12345_zpid/",
      process.env.SMS_SIGNED_LINK_SECRET!,
      Date.now(),
    );
    const params = Object.fromEntries(new URL(link).searchParams.entries());

    const html = await renderPage(params);

    expect(html).toContain("Importing from Zillow");
    expect(html).toContain("Listing ID");
    expect(html).toContain("12345");
  });

  it("rejects an unsigned SMS intake link", async () => {
    const html = await renderPage({
      url: "https://zillow.com/homedetails/Test-Home/12345_zpid/",
      source: "sms",
    });

    expect(html).toContain("This text link is invalid or expired");
    expect(html).not.toContain("Importing from Zillow");
  });

  it("still allows non-SMS intake forwards without a signature", async () => {
    const html = await renderPage({
      url: "https://zillow.com/homedetails/Test-Home/12345_zpid/",
      source: "extension",
    });

    expect(html).toContain("Importing from Zillow");
  });
});
