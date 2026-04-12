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
  test("dashboard redirects unauthenticated users to onboarding", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.locator("h1")).toContainText("Register once");
  });

  test("dashboard loads for a registered onboarding session", async ({ page }) => {
    const session = {
      version: 1,
      status: "registered",
      registeredAt: "2026-04-12T00:00:00.000Z",
      buyerName: "Avery Chen",
      buyerEmail: "avery@buyerv2.com",
      buyerPhone: "(305) 555-0182",
      buyerBasics: {
        budgetMin: 500000,
        budgetMax: 900000,
        timeline: "90_plus_days",
        financing: "conventional",
        preferredAreas: "Miami Beach, Coral Gables",
      },
      firstSearch: {
        id: "search-zillow-123456",
        propertyId: "zillow-123456",
        listingUrl: "https://www.zillow.com/homedetails/123-Main-St-Miami-FL/123456_zpid/",
        portal: "zillow",
        address: "1823 Bayshore Drive",
        city: "Miami Beach, FL",
        price: 1385000,
        score: 9.2,
        lastActivity: "Updated 3 minutes ago",
        imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
        status: "analysis_ready",
        summary: "Strong waterfront value with high walkability and low flood risk.",
      },
      searches: [
        {
          id: "search-zillow-123456",
          propertyId: "zillow-123456",
          listingUrl: "https://www.zillow.com/homedetails/123-Main-St-Miami-FL/123456_zpid/",
          portal: "zillow",
          address: "1823 Bayshore Drive",
          city: "Miami Beach, FL",
          price: 1385000,
          score: 9.2,
          lastActivity: "Updated 3 minutes ago",
          imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
          status: "analysis_ready",
          summary: "Strong waterfront value with high walkability and low flood risk.",
        },
      ],
    };
    const cookieValue = encodeURIComponent(
      JSON.stringify({
        version: 1,
        status: "registered",
        buyerName: session.buyerName,
        buyerEmail: session.buyerEmail,
        firstPropertyId: session.firstSearch.propertyId,
      }),
    );

    await page.addInitScript((payload) => {
      window.localStorage.setItem("buyer-v2:buyer-session", JSON.stringify(payload));
    }, session);
    await page.context().addCookies([
      {
        name: "buyer_v2_session",
        value: cookieValue,
        url: "http://localhost:3000",
      },
    ]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /welcome back, avery/i })).toBeVisible();
  });

  test("console page loads", async ({ page }) => {
    await page.goto("/console");
    await expect(page.locator("h1")).toContainText("Broker Console");
  });
});
