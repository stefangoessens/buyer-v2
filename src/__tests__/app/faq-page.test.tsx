// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * Integration test for `/faq` (KIN-1085).
 *
 * Renders the actual route component as JSX and asserts that the page
 * scaffolding (3 themes × 18 public questions, jump nav, contact CTA,
 * FAQPage JSON-LD) all wire up end-to-end. The page is a server
 * component, but it has no async data dependency — everything comes
 * from `FAQ_ENTRIES` at module load — so direct JSX render works.
 *
 * Analytics + posthog are mocked because the FAQ child components
 * import `track` from `@/lib/analytics`, which transitively pulls
 * `posthog-js`. Tests stay hermetic; we don't assert on tracked events
 * here — those are covered by the unit tests for each section.
 */

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  trackFunnelStep: vi.fn(),
  listEventsByCategory: vi.fn(() => []),
}));

// posthog-js touches window during init. Stub it before any component
// pulls it in transitively.
vi.mock("posthog-js", () => ({
  default: {
    __loaded: false,
    capture: vi.fn(),
    init: vi.fn(),
  },
}));

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// Import AFTER the mocks above so analytics + posthog are intercepted.
import FAQPage from "@/app/(marketing)/faq/page";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";

beforeEach(() => {
  // Reset hash so deep-link auto-open doesn't bleed across tests.
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", window.location.pathname);
  }
});

afterEach(() => {
  cleanup();
});

describe("/faq page", () => {
  it("renders all 18 public FAQ questions across the three themes", () => {
    render(<FAQPage />);
    const publicEntries = filterPublic(FAQ_ENTRIES);
    expect(publicEntries).toHaveLength(18);
    for (const entry of publicEntries) {
      // Every public question text appears on the page exactly once
      // (one per accordion item).
      expect(screen.getByText(entry.question)).toBeInTheDocument();
    }
  });

  it("renders all three theme section anchors", () => {
    const { container } = render(<FAQPage />);
    expect(container.querySelector("#theme-how-it-works")).not.toBeNull();
    expect(container.querySelector("#theme-how-you-save")).not.toBeNull();
    expect(container.querySelector("#theme-protection")).not.toBeNull();
  });

  it("renders jump-nav anchor links pointing at each theme", () => {
    const { container } = render(<FAQPage />);
    expect(
      container.querySelector('a[href="#theme-how-it-works"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="#theme-how-you-save"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="#theme-protection"]'),
    ).not.toBeNull();
  });

  it("renders the Still-have-questions CTA pointing at /contact", () => {
    const { container } = render(<FAQPage />);
    const contactLink = container.querySelector('a[href="/contact"]');
    expect(contactLink).not.toBeNull();
    expect(contactLink?.textContent).toMatch(/broker/i);
  });

  it("emits a FAQPage JSON-LD script with all 18 public questions", () => {
    const { container } = render(<FAQPage />);
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script).not.toBeNull();
    const payload = JSON.parse(script?.textContent ?? "{}");
    expect(payload["@type"]).toBe("FAQPage");
    expect(payload.mainEntity).toHaveLength(18);
  });

  it("never renders the internal-only FAQ entries", () => {
    render(<FAQPage />);
    // Both internal entries' questions begin with the literal "Internal:"
    // prefix in the seed data. They must be stripped by filterPublic.
    expect(screen.queryByText(/^Internal:/)).toBeNull();
    expect(screen.queryByText(/Internal: current engineering/)).toBeNull();
    expect(screen.queryByText(/Internal: agent bonus split/)).toBeNull();
  });

  it("renders each public accordion item with an id matching its kebab-case slug", () => {
    const { container } = render(<FAQPage />);
    const publicEntries = filterPublic(FAQ_ENTRIES);
    for (const entry of publicEntries) {
      expect(container.querySelector(`#${CSS.escape(entry.id)}`)).not.toBeNull();
    }
  });

  it("renders the strategic anchor questions verbatim", () => {
    render(<FAQPage />);
    expect(screen.getByText("What is buyer-v2?")).toBeInTheDocument();
    expect(
      screen.getByText("Is buyer-v2 a licensed brokerage?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("How does buyer-v2 save me money?"),
    ).toBeInTheDocument();
  });
});
