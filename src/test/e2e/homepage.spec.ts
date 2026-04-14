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

test.describe("homepage #how-it-works section", () => {
  test("renders exactly 4 steps with semantic <ol> / <li>", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("section#how-it-works");
    await expect(section).toBeVisible();
    const heading = section.locator("h2#how-it-works-heading");
    await expect(heading).toHaveText("Every step has an owner");
    const steps = section.locator("ol > li");
    await expect(steps).toHaveCount(4);
  });

  test("renders all 4 step titles in order", async ({ page }) => {
    await page.goto("/");
    const titles = page.locator("section#how-it-works ol > li h3");
    await expect(titles).toHaveCount(4);
    await expect(titles.nth(0)).toHaveText("Analyze");
    await expect(titles.nth(1)).toHaveText("Tour");
    await expect(titles.nth(2)).toHaveText("Offer");
    await expect(titles.nth(3)).toHaveText("Close");
  });

  test("Florida appears in at least 2 of the 4 step descriptions", async ({ page }) => {
    await page.goto("/");
    const descriptions = await page
      .locator("section#how-it-works ol > li")
      .allTextContents();
    const floridaMentions = descriptions.filter((d) => /Florida/.test(d));
    expect(floridaMentions.length).toBeGreaterThanOrEqual(2);
  });

  test("exposes [Brand] AI placeholder in the Analyze byline", async ({ page }) => {
    await page.goto("/");
    const analyze = page.locator("section#how-it-works ol > li").nth(0);
    // Body should contain the [Brand] AI literal placeholder pending product naming
    await expect(analyze).toContainText("[Brand] AI");
    // And MUST NOT leak a naked "Kin AI"
    const analyzeText = (await analyze.textContent()) ?? "";
    expect(analyzeText).not.toMatch(/Kin AI/);
  });

  test("CTA after the steps deep-links to the hero paste input area", async ({ page }) => {
    await page.goto("/");
    const cta = page.locator(
      "section#how-it-works a:has-text(\"Paste your first property link\")",
    );
    await expect(cta).toBeVisible();
    // href should target the homepage root (or an anchor on it) — no second paste form
    const href = await cta.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toMatch(/^\/(#|$)/); // "/" or "/#<anchor>"
  });

  test("embeds HowTo JSON-LD with 4 steps", async ({ page }) => {
    await page.goto("/");
    // Find all ld+json scripts and pick the HowTo one
    const scripts = page.locator("script[type=\"application/ld+json\"]");
    const count = await scripts.count();
    let howToRaw: string | null = null;
    for (let i = 0; i < count; i++) {
      const raw = await scripts.nth(i).textContent();
      if (raw && /"@type"\s*:\s*"HowTo"/.test(raw)) {
        howToRaw = raw;
        break;
      }
    }
    expect(howToRaw, "Expected a HowTo JSON-LD script on the homepage").not.toBeNull();
    const parsed = JSON.parse(howToRaw!);
    expect(parsed["@type"]).toBe("HowTo");
    expect(parsed.name).toBeTruthy();
    expect(parsed.description).toBeTruthy();
    expect(Array.isArray(parsed.step)).toBe(true);
    expect(parsed.step).toHaveLength(4);
    expect(parsed.step[0]["@type"]).toBe("HowToStep");
    expect(parsed.step[0].position).toBe(1);
    expect(parsed.step[0].name).toBe("Analyze");
    expect(parsed.step[3].name).toBe("Close");
  });

  test("renders 4 steps with JS disabled (server-side)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    const steps = page.locator("section#how-it-works ol > li");
    await expect(steps).toHaveCount(4);
    // All 4 titles should be readable without JS
    const titles = page.locator("section#how-it-works ol > li h3");
    await expect(titles.nth(0)).toHaveText("Analyze");
    await expect(titles.nth(3)).toHaveText("Close");
    await context.close();
  });

  test("section is mobile-friendly at 375px width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const section = page.locator("section#how-it-works");
    await expect(section).toBeVisible();
    const steps = section.locator("ol > li");
    await expect(steps).toHaveCount(4);
  });

  test("section is accessible — h2 + 4 h3 + aria-labelledby", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("section#how-it-works");
    await expect(section).toHaveAttribute("aria-labelledby", "how-it-works-heading");
    const h2 = section.locator("h2#how-it-works-heading");
    await expect(h2).toBeVisible();
    const h3s = section.locator("h3");
    await expect(h3s).toHaveCount(4);
  });
});
