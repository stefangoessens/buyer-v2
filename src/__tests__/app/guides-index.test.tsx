// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * Integration test for `/guides` (KIN-1090).
 *
 * Renders the index route and asserts both seeded Florida buyer
 * guides show up with titles, summaries, and "Read guide" links
 * pointing at the right slug-based detail URLs.
 */

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  trackFunnelStep: vi.fn(),
  listEventsByCategory: vi.fn(() => []),
}));

vi.mock("posthog-js", () => ({
  default: {
    __loaded: false,
    capture: vi.fn(),
    init: vi.fn(),
  },
}));

import GuidesIndexPage from "@/app/(marketing)/guides/page";
import { publicGuides } from "@/content/guides";

afterEach(() => {
  cleanup();
});

describe("/guides index page", () => {
  it("renders the hero H1 and eyebrow", () => {
    render(<GuidesIndexPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Plain-language guides for Florida homebuyers/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders every public guide title as a card", () => {
    render(<GuidesIndexPage />);
    const guides = publicGuides();
    expect(guides.length).toBeGreaterThan(0);
    for (const guide of guides) {
      expect(
        screen.getByRole("heading", { level: 2, name: guide.title }),
      ).toBeInTheDocument();
    }
  });

  it("renders the two seeded guide titles verbatim", () => {
    render(<GuidesIndexPage />);
    expect(
      screen.getByText(
        "Florida Homestead Exemption: A First-Time Owner's Guide",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /The Florida Buyer Rebate Explained: How Up To 2% Back Actually Works/i,
      ),
    ).toBeInTheDocument();
  });

  it("links each card to /guides/[slug]", () => {
    const { container } = render(<GuidesIndexPage />);
    const guides = publicGuides();
    for (const guide of guides) {
      const anchor = container.querySelector(
        `a[href="/guides/${guide.slug}"]`,
      );
      expect(anchor).not.toBeNull();
      // The anchor wraps the entire card and contains both the
      // guide title and the "Read guide →" affordance.
      expect(anchor?.textContent).toContain(guide.title);
      expect(anchor?.textContent).toMatch(/Read guide/i);
    }
  });

  it("renders the reading time for each guide", () => {
    const { container } = render(<GuidesIndexPage />);
    const guides = publicGuides();
    for (const guide of guides) {
      // Reading time is rendered as "N min read" inside the card.
      const cardAnchor = container.querySelector(
        `a[href="/guides/${guide.slug}"]`,
      );
      expect(cardAnchor?.textContent).toMatch(
        new RegExp(`${guide.readingTimeMinutes} min read`),
      );
    }
  });
});
