import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("renders all major sections", async ({ page }) => {
    await page.goto("/");

    // Nav header
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByText("buyer-v2").first()).toBeVisible();

    // Hero section
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Florida home");

    // Paste link input
    const input = page
      .locator('input[placeholder*="Paste"]')
      .or(page.locator('input[placeholder*="paste"]'))
      .or(page.locator('input[type="url"]'));
    await expect(input.first()).toBeVisible();

    // Trust bar
    await expect(
      page
        .getByText("Buyers served")
        .or(page.getByText("buyers served"))
    ).toBeVisible();

    // Features section
    await expect(
      page.getByText("AI-powered analysis").first()
    ).toBeVisible();
  });

  test("routes a pasted listing through the intake teaser into the deal room preview", async ({
    page,
  }) => {
    await page.goto("/");

    await page
      .locator(
        'input[placeholder*="Paste"], input[placeholder*="paste"], input[type="url"]',
      )
      .first()
      .fill("https://www.zillow.com/homedetails/Test/12345678_zpid/");

    await page
      .locator('button[type="submit"]')
      .or(page.getByRole("button", { name: /analyze|get/i }))
      .first()
      .click();

    await expect(page).toHaveURL(/\/intake\?/);
    await expect(
      page.getByRole("heading", { name: /Importing from Zillow/i }),
    ).toBeVisible();
    await expect(page.getByText("12345678")).toBeVisible();

    await page
      .getByRole("link", { name: /continue to deal room preview/i })
      .click();

    await expect(page).toHaveURL(/\/property\/12345678$/);
    await expect(page.getByRole("heading", { name: /Deal Room/i })).toBeVisible();
    await expect(page.getByText("Property: 12345678")).toBeVisible();
  });

  test("invalid intake links show a typed recovery message", async ({ page }) => {
    await page.goto(
      "/intake?url=https%3A%2F%2Fwww.example.com%2Funsupported-listing&source=e2e"
    );

    await expect(
      page.getByRole("heading", { name: /We couldn't import that link/i })
    ).toBeVisible();
    await expect(
      page.getByText(/supports Zillow, Redfin, and Realtor.com listings/i)
    ).toBeVisible();
  });

  test("footer renders with legal notice", async ({ page }) => {
    await page.goto("/");

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(
      page
        .getByText("Florida licensed")
        .or(page.getByText("florida licensed"))
    ).toBeVisible();
  });
});
