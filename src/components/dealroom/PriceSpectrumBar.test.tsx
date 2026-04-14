// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PriceSpectrumBar } from "./PriceSpectrumBar";

afterEach(() => {
  cleanup();
});

const baseProps = {
  fairPrice: 425000,
  listingPrice: 450000,
  walkAway: 465000,
};

const ANCHOR_NAME_RE = /Lowest|Fair|Zestimate|Redfin|Listing|Walk away/i;

function getAnchorButtons() {
  return screen.getAllByRole("button", { name: ANCHOR_NAME_RE });
}

describe("PriceSpectrumBar", () => {
  it("renders all 5 anchors when all values provided", () => {
    render(
      <PriceSpectrumBar
        lowestPossible={400000}
        fairPrice={425000}
        zestimate={440000}
        listingPrice={450000}
        walkAway={465000}
      />,
    );
    expect(getAnchorButtons()).toHaveLength(5);
  });

  it("omits zestimate anchor when zestimate is undefined", () => {
    render(<PriceSpectrumBar {...baseProps} lowestPossible={400000} />);
    expect(getAnchorButtons()).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: /Zestimate/i }),
    ).not.toBeInTheDocument();
  });

  it("omits lowestPossible anchor when undefined", () => {
    render(<PriceSpectrumBar {...baseProps} zestimate={440000} />);
    expect(getAnchorButtons()).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: /Lowest/i }),
    ).not.toBeInTheDocument();
  });

  it("renders only fairPrice + listing + walkAway when others undefined", () => {
    render(<PriceSpectrumBar {...baseProps} />);
    expect(getAnchorButtons()).toHaveLength(3);
  });

  it("renders strongOpener pin when provided", () => {
    render(<PriceSpectrumBar {...baseProps} strongOpener={418000} />);
    expect(screen.getByText(/Strong opener/i)).toBeInTheDocument();
  });

  it("does not render strongOpener pin when undefined", () => {
    render(<PriceSpectrumBar {...baseProps} />);
    expect(screen.queryByText(/Strong opener/i)).not.toBeInTheDocument();
  });

  it("clamps lowestPossible when greater than fairPrice", () => {
    render(<PriceSpectrumBar {...baseProps} lowestPossible={600000} />);
    expect(getAnchorButtons()).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: /Lowest/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the same anchors when min === max", () => {
    render(
      <PriceSpectrumBar
        fairPrice={500000}
        listingPrice={500000}
        walkAway={500000}
      />,
    );
    expect(getAnchorButtons()).toHaveLength(3);
  });

  it("formats currency values with USD symbol and no decimals", () => {
    render(
      <PriceSpectrumBar
        fairPrice={425000}
        listingPrice={450000}
        walkAway={465000}
      />,
    );
    const fair = screen.getByRole("button", { name: /Fair.*\$425,000/ });
    expect(fair).toBeInTheDocument();
  });

  it("has role=img on the outer container with a descriptive aria-label", () => {
    render(
      <PriceSpectrumBar
        fairPrice={425000}
        listingPrice={450000}
        walkAway={465000}
      />,
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("aria-label")).toMatch(/\$/);
  });

  it("renders Zestimate anchor when zestimate prop is provided", () => {
    render(<PriceSpectrumBar {...baseProps} zestimate={440000} />);
    expect(
      screen.getByRole("button", { name: /Zestimate.*\$440,000/ }),
    ).toBeInTheDocument();
  });

  it("renders Redfin Estimate anchor when redfinEstimate prop is provided", () => {
    render(<PriceSpectrumBar {...baseProps} redfinEstimate={442000} />);
    expect(
      screen.getByRole("button", { name: /Redfin.*\$442,000/ }),
    ).toBeInTheDocument();
  });

  it("omits Zestimate anchor when zestimate is undefined", () => {
    render(<PriceSpectrumBar {...baseProps} redfinEstimate={442000} />);
    expect(
      screen.queryByRole("button", { name: /Zestimate/i }),
    ).not.toBeInTheDocument();
  });

  it("omits Redfin anchor when redfinEstimate is undefined", () => {
    render(<PriceSpectrumBar {...baseProps} zestimate={440000} />);
    expect(
      screen.queryByRole("button", { name: /Redfin/i }),
    ).not.toBeInTheDocument();
  });

  it("renders both AVM anchors together", () => {
    render(
      <PriceSpectrumBar
        {...baseProps}
        zestimate={440000}
        redfinEstimate={442000}
      />,
    );
    expect(getAnchorButtons()).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: /Zestimate/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Redfin/i }),
    ).toBeInTheDocument();
  });
});
