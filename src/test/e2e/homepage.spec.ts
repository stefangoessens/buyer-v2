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

test.describe("homepage buyer stories regression (KIN-1087)", () => {
  test("legacy hardcoded TestimonialCard quotes are GONE from the homepage", async ({
    page,
  }) => {
    await page.goto("/");
    // The deleted hardcoded testimonials block used canned copy that
    // mentioned "12,400" and a 5-star review. The new MarketingStoriesSection
    // is gated on approved stories and renders null until they land — so
    // the homepage MUST NOT carry any legacy testimonial-style 5-star
    // social-proof block from the pre-KIN-1087 hardcoded list.
    //
    // We assert no element carries a literal star image-role label that
    // belonged to the old TestimonialCard rendering, AND that no
    // hardcoded hero quote (the kind only the old block had) leaks.
    const legacyStars = page.getByRole("img", { name: /5 out of 5 stars/i });
    await expect(legacyStars).toHaveCount(0);
  });

  test("MarketingStoriesSection renders nothing while every story is a draft", async ({
    page,
  }) => {
    await page.goto("/");
    // Section heading: "Buyers saving real money" only appears when at
    // least one approved story is published. With three draft seeds today
    // the section returns null.
    await expect(
      page.getByRole("heading", { name: "Buyers saving real money" }),
    ).toHaveCount(0);
    // The "Browse all stories" link only renders inside the section.
    await expect(
      page.getByRole("link", { name: /Browse all stories/i }),
    ).toHaveCount(0);
  });
});

test.describe("homepage #how-we-compare section", () => {
  test("renders eyebrow, headline, semantic table, CTAs, and hero anchor", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const comparison = page.locator("#how-we-compare");
    await expect(comparison).toBeVisible();

    await expect(comparison.getByText("How we compare")).toBeVisible();
    await expect(
      comparison.getByText("Better than traditional. Safer than going alone."),
    ).toBeVisible();

    // Desktop semantic <table> exists at the 1280px viewport.
    const table = comparison.locator("table");
    await expect(table.first()).toBeAttached();

    // CTAs.
    const pricingCta = comparison.locator(
      'a[href="/pricing#savings-calculator"]',
    );
    await expect(pricingCta).toBeVisible();
    const intakeCta = comparison.locator('a[href="#hero-intake"]');
    await expect(intakeCta).toBeVisible();

    // The hero anchor target the secondary CTA jumps to must exist.
    const heroAnchor = page.locator("#hero-intake");
    await expect(heroAnchor).toBeAttached();
  });
});

test.describe("homepage #rebate-slider section", () => {
  test("renders eyebrow, default headline values, and CTA", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const section = page.locator("#rebate-slider");
    await expect(section).toBeVisible();

    await expect(section.getByText("Up to 2% back at closing")).toBeVisible();
    // Default $750k → $15k rebate (3% buyer-side − 1% buyer-v2 fee).
    await expect(section.getByText("$750,000").first()).toBeVisible();
    await expect(section.getByText("$15,000").first()).toBeVisible();

    const cta = section.locator('a[href="#hero-intake"]');
    await expect(cta).toBeVisible();
  });

  test("exposes a [role='slider'] with default aria-valuenow=750000", async ({
    page,
  }) => {
    await page.goto("/");
    const slider = page.locator("#rebate-slider [role='slider']");
    await expect(slider).toBeAttached();
    await expect(slider).toHaveAttribute("aria-valuenow", "750000");
  });

  test("the legacy $12,400 figure is no longer present anywhere on the homepage", async ({
    page,
  }) => {
    await page.goto("/");
    const body = await page.locator("body").textContent();
    expect(body ?? "").not.toContain("$12,400");
  });

  test("?price=850000#rebate-slider deep link reflects in aria-valuenow after hydration", async ({
    page,
  }) => {
    await page.goto("/?price=850000#rebate-slider");
    await page.waitForSelector("[role='slider'][aria-valuenow='850000']");
    const slider = page.locator("#rebate-slider [role='slider']");
    await expect(slider).toHaveAttribute("aria-valuenow", "850000");
  });
});
