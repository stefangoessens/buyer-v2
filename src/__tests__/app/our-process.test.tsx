// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * Integration test for `/our-process` (KIN-1090).
 *
 * Renders the route component and asserts that the 6 Florida-buyer
 * process steps show up in the right order, the HowTo JSON-LD is
 * emitted with all 6 steps, and the bottom CTA targets /get-started.
 *
 * Analytics + posthog are mocked because the route mounts a client-
 * side tracker that imports `track` from `@/lib/analytics`.
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

import OurProcessPage from "@/app/(marketing)/our-process/page";

afterEach(() => {
  cleanup();
});

const EXPECTED_STEP_TITLES = [
  "Paste a link",
  "We run the numbers",
  "You review with our broker",
  "We handle the listing-side ask",
  "You submit an offer with confidence",
  "Close and keep the rebate",
];

describe("/our-process page", () => {
  it("renders the H1 and breadcrumb", () => {
    render(<OurProcessPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Six steps from a listing link/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument();
  });

  it("renders all six process steps in order", () => {
    const { container } = render(<OurProcessPage />);
    const stepHeadings = Array.from(
      container.querySelectorAll("h2"),
    ).map((el) => el.textContent?.trim());
    for (const title of EXPECTED_STEP_TITLES) {
      expect(stepHeadings).toContain(title);
    }
    // Order assertion: each expected step should appear before the
    // next in document order so buyers read them 1 → 6.
    const indices = EXPECTED_STEP_TITLES.map((t) =>
      stepHeadings.indexOf(t),
    );
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it("renders the bottom CTA pointing at /get-started", () => {
    const { container } = render(<OurProcessPage />);
    const cta = container.querySelector('a[href="/get-started"]');
    expect(cta).not.toBeNull();
    expect(cta?.textContent).toMatch(/start with a link/i);
  });

  it("emits HowTo JSON-LD with six schema.org steps", () => {
    const { container } = render(<OurProcessPage />);
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script).not.toBeNull();
    const payload = JSON.parse(script?.textContent ?? "{}");
    expect(payload["@type"]).toBe("HowTo");
    expect(Array.isArray(payload.step)).toBe(true);
    expect(payload.step).toHaveLength(6);
    expect(payload.step[0].position).toBe(1);
    expect(payload.step[0].name).toBe("Paste a link");
    expect(payload.step[5].position).toBe(6);
    expect(payload.step[5].name).toBe("Close and keep the rebate");
  });
});
