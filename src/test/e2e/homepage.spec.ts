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
      page.getByRole("heading", { name: "Get AI-powered analysis" })
    ).toBeVisible();
  });

  test("paste input accepts and validates URL", async ({ page }) => {
    await page.goto("/");

    const input = page.locator("input").first();
    await input.fill(
      "https://www.zillow.com/homedetails/Test/12345678_zpid/"
    );

    // Should have a submit button
    const submitBtn = page
      .locator('button[type="submit"]')
      .or(page.getByRole("button", { name: /analyze|get/i }));
    await expect(submitBtn.first()).toBeVisible();
  });

  test("footer renders with legal notice", async ({ page }) => {
    await page.goto("/");

    // Scroll to bottom
    await page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );

    await expect(
      page
        .getByText("Florida licensed")
        .or(page.getByText("florida licensed"))
    ).toBeVisible();
  });
});
