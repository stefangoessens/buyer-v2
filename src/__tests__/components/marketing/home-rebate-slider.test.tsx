// @vitest-environment jsdom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

class MockIntersectionObserver {
  observe = () => {};
  disconnect = () => {};
  unobserve = () => {};
  takeRecords = () => [] as IntersectionObserverEntry[];
  root = null;
  rootMargin = "";
  thresholds: ReadonlyArray<number> = [];
}

beforeAll(() => {
  (
    globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver }
  ).IntersectionObserver = MockIntersectionObserver;
  // Force the reduced-motion path so the RAF tween short-circuits to the
  // final value synchronously — keeps the rebate-counter assertions stable
  // without having to poll across requestAnimationFrame ticks.
  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

import { HomeRebateSliderSection } from "@/components/marketing/sections/HomeRebateSliderSection";
import {
  DISCLAIMER,
  FALLBACK_PRICE_POINTS,
  LOW_COMMISSION_NOTE,
  PRIMARY_CTA,
  SECTION_EYEBROW,
  SECTION_ID,
} from "@/content/home-rebate-slider";
import {
  SLIDER_DEFAULT_PRICE,
  SLIDER_MAX_PRICE,
  SLIDER_MIN_PRICE,
  formatCurrency,
  illustrateRebate,
} from "@/lib/pricing/rebateIllustration";
import { track } from "@/lib/analytics";

const trackMock = vi.mocked(track);

describe("HomeRebateSliderSection — fallback (enabled={false})", () => {
  it("renders a section with the canonical rebate-slider id", () => {
    const { container } = render(<HomeRebateSliderSection enabled={false} />);
    const section = container.querySelector(`section#${SECTION_ID}`);
    expect(section).not.toBeNull();
  });

  it("renders a real <table> with one body row per FALLBACK_PRICE_POINT", () => {
    const { container } = render(<HomeRebateSliderSection enabled={false} />);
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const bodyRows = table?.querySelectorAll("tbody tr");
    expect(bodyRows?.length).toBe(FALLBACK_PRICE_POINTS.length);
  });

  it("renders price, commission, fee, and rebate cells via formatCurrency", () => {
    render(<HomeRebateSliderSection enabled={false} />);
    for (const price of FALLBACK_PRICE_POINTS) {
      const illo = illustrateRebate(price);
      expect(screen.getAllByText(formatCurrency(price)).length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(formatCurrency(illo.buyerSideCommission)).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText(formatCurrency(illo.buyerV2Fee)).length,
      ).toBeGreaterThan(0);
    }
  });

  it("renders the primary CTA targeting #hero-intake", () => {
    const { container } = render(<HomeRebateSliderSection enabled={false} />);
    const cta = container.querySelector(`a[href="${PRIMARY_CTA.href}"]`);
    expect(cta).not.toBeNull();
    expect(PRIMARY_CTA.href).toBe("#hero-intake");
  });

  it("renders the legal disclosure paragraph", () => {
    render(<HomeRebateSliderSection enabled={false} />);
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("does NOT render the interactive [role='slider']", () => {
    const { container } = render(<HomeRebateSliderSection enabled={false} />);
    expect(container.querySelector('[role="slider"]')).toBeNull();
  });

  it("fires home_rebate_slider_fallback_shown on mount", () => {
    render(<HomeRebateSliderSection enabled={false} />);
    expect(trackMock).toHaveBeenCalledWith("home_rebate_slider_fallback_shown", {
      reason: "flag_off",
    });
  });
});

describe("HomeRebateSliderSection — interactive default render", () => {
  it("renders the section with the rebate-slider id", () => {
    const { container } = render(<HomeRebateSliderSection />);
    expect(container.querySelector(`section#${SECTION_ID}`)).not.toBeNull();
  });

  it("renders a [role='slider'] with the canonical aria values at default price", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    expect(slider).not.toBeNull();
    expect(slider.getAttribute("aria-valuenow")).toBe(String(SLIDER_DEFAULT_PRICE));
    expect(slider.getAttribute("aria-valuemin")).toBe(String(SLIDER_MIN_PRICE));
    expect(slider.getAttribute("aria-valuemax")).toBe(String(SLIDER_MAX_PRICE));
  });

  it("populates aria-valuetext with both the price and the rebate", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    const valueText = slider.getAttribute("aria-valuetext") ?? "";
    expect(valueText).toContain("$750,000");
    expect(valueText).toContain("$15,000");
  });

  it("renders the eyebrow + headline strings + canonical CTA", () => {
    const { container } = render(<HomeRebateSliderSection />);
    expect(screen.getByText(SECTION_EYEBROW)).toBeInTheDocument();
    const heading = container.querySelector("h2#home-rebate-slider-heading");
    expect(heading).not.toBeNull();
    expect(heading).toHaveTextContent("$750,000");
    expect(heading).toHaveTextContent("$15,000");
    const cta = container.querySelector(`a[href="${PRIMARY_CTA.href}"]`);
    expect(cta).not.toBeNull();
  });

  it("renders the disclosure paragraph at default price", () => {
    render(<HomeRebateSliderSection />);
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("does NOT render the low-commission note at default (non-clamped) price", () => {
    render(<HomeRebateSliderSection />);
    expect(screen.queryByText(LOW_COMMISSION_NOTE)).toBeNull();
  });
});

describe("HomeRebateSliderSection — keyboard interaction", () => {
  function getSlider(container: HTMLElement): HTMLDivElement {
    const slider = container.querySelector('[role="slider"]');
    if (!slider) throw new Error("expected role=slider element");
    return slider as HTMLDivElement;
  }

  it("ArrowRight bumps aria-valuenow by $10,000", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = getSlider(container);
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider.getAttribute("aria-valuenow")).toBe(
      String(SLIDER_DEFAULT_PRICE + 10_000),
    );
  });

  it("ArrowLeft drops aria-valuenow by $10,000", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = getSlider(container);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider.getAttribute("aria-valuenow")).toBe(
      String(SLIDER_DEFAULT_PRICE - 10_000),
    );
  });

  it("Home jumps to SLIDER_MIN_PRICE and End jumps to SLIDER_MAX_PRICE", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = getSlider(container);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider.getAttribute("aria-valuenow")).toBe(String(SLIDER_MIN_PRICE));
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider.getAttribute("aria-valuenow")).toBe(String(SLIDER_MAX_PRICE));
  });

  it("Shift+ArrowLeft moves by the $100,000 shift step", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = getSlider(container);
    fireEvent.keyDown(slider, { key: "ArrowLeft", shiftKey: true });
    expect(slider.getAttribute("aria-valuenow")).toBe(
      String(SLIDER_DEFAULT_PRICE - 100_000),
    );
  });

  it("Shift+ArrowRight moves by the $100,000 shift step", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = getSlider(container);
    fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
    expect(slider.getAttribute("aria-valuenow")).toBe(
      String(SLIDER_DEFAULT_PRICE + 100_000),
    );
  });

  it("aria-valuetext updates after a keyboard move", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = getSlider(container);
    fireEvent.keyDown(slider, { key: "End" });
    const valueText = slider.getAttribute("aria-valuetext") ?? "";
    expect(valueText).toContain("$2,000,000");
    // At $2M the rebate is $40k.
    expect(valueText).toContain("$40,000");
  });

  it("does not change aria-valuenow on an unhandled key (e.g. Tab)", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = getSlider(container);
    fireEvent.keyDown(slider, { key: "Tab" });
    expect(slider.getAttribute("aria-valuenow")).toBe(String(SLIDER_DEFAULT_PRICE));
  });
});

describe("HomeRebateSliderSection — analytics firing", () => {
  it("fires home_rebate_slider_deep_link_landed when deepLink={true}", () => {
    render(<HomeRebateSliderSection deepLink />);
    expect(trackMock).toHaveBeenCalledWith(
      "home_rebate_slider_deep_link_landed",
      { price: SLIDER_DEFAULT_PRICE },
    );
  });

  it("does NOT fire deep_link_landed when deepLink is omitted", () => {
    render(<HomeRebateSliderSection />);
    const calls = trackMock.mock.calls.filter(
      ([name]) => name === "home_rebate_slider_deep_link_landed",
    );
    expect(calls.length).toBe(0);
  });

  it("fires home_rebate_cta_clicked when the primary CTA is clicked", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const cta = container.querySelector(
      `a[href="${PRIMARY_CTA.href}"]`,
    ) as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    fireEvent.click(cta);
    const calls = trackMock.mock.calls.filter(
      ([name]) => name === "home_rebate_cta_clicked",
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("fires home_rebate_aspiration_viewed on initial mount with the default band", () => {
    render(<HomeRebateSliderSection />);
    const calls = trackMock.mock.calls.filter(
      ([name]) => name === "home_rebate_aspiration_viewed",
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]?.[1]).toEqual({ rebateBand: "10k-20k" });
  });

  it("fires home_rebate_slider_changed and calculator_used after the debounce window", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<HomeRebateSliderSection />);
      const slider = container.querySelector(
        '[role="slider"]',
      ) as HTMLDivElement;
      // Drain the mount-time effect that schedules an initial debounced
      // changed event (because the effect runs even on first render).
      act(() => {
        vi.advanceTimersByTime(300);
      });
      trackMock.mockClear();
      fireEvent.keyDown(slider, { key: "ArrowRight" });
      // Nothing should have fired yet — still inside the 250ms debounce window.
      expect(
        trackMock.mock.calls.find(
          ([name]) => name === "home_rebate_slider_changed",
        ),
      ).toBeUndefined();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      const changedCall = trackMock.mock.calls.find(
        ([name]) => name === "home_rebate_slider_changed",
      );
      expect(changedCall).toBeDefined();
      const payload = changedCall?.[1] as {
        price: number;
        rebate: number;
        rebateBand: string;
      };
      expect(payload.price).toBe(SLIDER_DEFAULT_PRICE + 10_000);
      const calculatorCall = trackMock.mock.calls.find(
        ([name]) => name === "calculator_used",
      );
      expect(calculatorCall).toBeDefined();
      expect(calculatorCall?.[1]).toEqual({
        calculator: "home_rebate_slider",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("HomeRebateSliderSection — semantic + a11y", () => {
  it("the slider is keyboard-focusable (tabIndex=0)", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    expect(slider.getAttribute("tabIndex") ?? slider.tabIndex.toString()).toBe(
      "0",
    );
  });

  it("the slider has a descriptive aria-label", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    const label = slider.getAttribute("aria-label") ?? "";
    expect(label.length).toBeGreaterThan(0);
    expect(label.toLowerCase()).toContain("rebate");
  });

  it("the slider wrapper exposes a focus-visible ring class", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    expect(slider.className).toMatch(/focus-visible:ring/);
  });

  it("the section is labelled by the heading via aria-labelledby", () => {
    const { container } = render(<HomeRebateSliderSection />);
    const section = container.querySelector(`section#${SECTION_ID}`);
    expect(section?.getAttribute("aria-labelledby")).toBe(
      "home-rebate-slider-heading",
    );
  });
});
