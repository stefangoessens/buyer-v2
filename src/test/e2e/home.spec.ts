import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("loads and shows hero heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Florida home");
  });

  test("health endpoint returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe("ok");
  });
});

test.describe("Route groups", () => {
  test("dashboard page loads", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Buyer Dashboard");
  });

  test("console page loads", async ({ page }) => {
    await page.goto("/console");
    await expect(page.locator("h1")).toContainText("Broker Console");
  });
});
