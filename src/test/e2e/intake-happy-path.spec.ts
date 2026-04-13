import { expect, test } from "@playwright/test";

const listingUrl =
  "https://www.zillow.com/homedetails/100-Las-Olas-Blvd-1001-Fort-Lauderdale-FL-33301/12345678_zpid/";

test.describe("Intake happy path", () => {
  test("covers homepage paste submit and intake teaser handoff", async ({
    page,
  }) => {
    await page.goto("/");

    const pasteForm = page.locator("form").filter({
      has: page.locator('input[type="url"]'),
    }).first();

    await pasteForm.locator('input[type="url"]').fill(listingUrl);
    await pasteForm
      .getByRole("button", { name: /get free analysis/i })
      .click();

    await expect(page.getByText("Analyzing your property...")).toBeVisible();

    await page.goto(
      `/intake?url=${encodeURIComponent(listingUrl)}&source=playwright`,
    );

    await expect(
      page.getByRole("heading", { name: /Importing from Zillow/i }),
    ).toBeVisible();
    await expect(page.getByText("12345678")).toBeVisible();

    const continueLink = page.getByRole("link", {
      name: /Continue to buyer-v2/i,
    });
    await expect(continueLink).toBeVisible();
    await expect(continueLink).toHaveAttribute("href", /\/\?intake=/);
  });
});
