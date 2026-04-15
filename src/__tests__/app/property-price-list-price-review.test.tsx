// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as React from "react";

import type { ListPriceReviewOutput } from "@/lib/dealroom/list-price-review";

// ── Convex/react mock ──────────────────────────────────────────────────────
const queryRef: { current: unknown } = { current: undefined };

vi.mock("convex/react", () => ({
  useQuery: () => queryRef.current,
  useMutation: () => vi.fn(),
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    propertyPricingReview: {
      getListPriceReview: {
        __kind: "query",
        name: "getListPriceReview",
      },
    },
  },
}));

// jsdom polyfills for Radix Tooltip / pointer-capture.
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
  if (!(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// Imports AFTER the mocks so module init is correct.
import { ListPriceReviewCard } from "@/components/dealroom/ListPriceReviewCard";
import type { Id } from "../../../convex/_generated/dataModel";

const DEAL_ROOM_ID = "deal-room-1" as unknown as Id<"dealRooms">;

type Assessment = ListPriceReviewOutput["assessment"];

interface FixtureOverrides {
  assessment?: Assessment;
  listPrice?: number | null;
  signalsAgreed?: number;
  totalSignals?: number;
  referencesAvailable?: number;
  weightedScore?: number | null;
  explainer?: string | null;
  compIsAvailable?: boolean;
}

function makeFixture(
  overrides: FixtureOverrides = {},
): ListPriceReviewOutput & {
  propertyAddress: string;
  engineFreshness: {
    pricingGeneratedAt: string | null;
    compsGeneratedAt: string | null;
  };
} {
  const assessment: Assessment = overrides.assessment ?? "over_market";
  const listPrice =
    overrides.listPrice === undefined ? 485_000 : overrides.listPrice;
  const compIsAvailable = overrides.compIsAvailable ?? true;
  return {
    assessment,
    listPrice,
    weightedScore:
      overrides.weightedScore === undefined ? 0.07 : overrides.weightedScore,
    referencesAvailable: overrides.referencesAvailable ?? 3,
    signalsAgreed: overrides.signalsAgreed ?? 3,
    totalSignals: overrides.totalSignals ?? 4,
    explainer:
      overrides.explainer === undefined
        ? "Listed 5.0% above our fair value."
        : overrides.explainer,
    tiles: {
      suggestedListPrice: {
        kind: "suggested_list_price",
        value: 460_000,
        provenance: "Pricing engine",
        isAvailable: true,
      },
      avmEstimate: {
        kind: "avm_estimate",
        value: 470_000,
        provenance: "Portal consensus (3 sources)",
        sourceCount: 3,
        isAvailable: true,
      },
      compMedian: {
        kind: "comp_median",
        value: compIsAvailable ? 472_500 : null,
        provenance: compIsAvailable
          ? "Selected comps (5)"
          : "Not available yet",
        sourceCount: compIsAvailable ? 5 : 0,
        isAvailable: compIsAvailable,
      },
      marketVelocityDom: {
        kind: "market_velocity_dom",
        value: 32,
        provenance: "ZIP median \u00b7 90d",
        isAvailable: true,
      },
    },
    propertyAddress: "123 Palm Way, Miami, FL 33133",
    engineFreshness: {
      pricingGeneratedAt: "2026-04-14T12:00:00.000Z",
      compsGeneratedAt: "2026-04-14T11:00:00.000Z",
    },
  };
}

beforeEach(() => {
  queryRef.current = undefined;
});

afterEach(() => {
  cleanup();
});

describe("ListPriceReviewCard", () => {
  it("renders the loading skeleton when the query is undefined", () => {
    queryRef.current = undefined;
    const { container } = render(
      <ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />,
    );

    const loadingRegion = container.querySelector(
      '[aria-label="List price review loading"]',
    );
    expect(loadingRegion).not.toBeNull();
    // Skeleton renders four animated tile placeholders.
    const skeletonTiles = loadingRegion?.querySelectorAll(".animate-pulse");
    expect((skeletonTiles?.length ?? 0)).toBeGreaterThanOrEqual(4);
  });

  it("renders the empty state copy when the query returns null", () => {
    queryRef.current = null;
    render(<ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />);

    expect(
      screen.getByText(/List price review unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders the over-market assessment with title, chip, and all four tiles", () => {
    queryRef.current = makeFixture({ assessment: "over_market" });
    render(<ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />);

    expect(
      screen.getByRole("heading", { name: /Is this priced right\?/i }),
    ).toBeInTheDocument();

    const chip = screen.getByRole("status");
    expect(chip).toHaveTextContent(/Over market/i);
    expect(chip).toHaveAttribute("aria-live", "polite");

    expect(screen.getByText(/Suggested list price/i)).toBeInTheDocument();
    expect(screen.getByText(/AVM estimate/i)).toBeInTheDocument();
    expect(screen.getByText(/Comp median/i)).toBeInTheDocument();
    expect(screen.getByText(/Market velocity/i)).toBeInTheDocument();
  });

  it("renders the under-market chip copy", () => {
    queryRef.current = makeFixture({
      assessment: "under_market",
      weightedScore: -0.07,
      explainer: "Listed 5.0% below our fair value.",
    });
    render(<ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />);

    expect(screen.getByRole("status")).toHaveTextContent(/Under market/i);
  });

  it("renders the at-market chip copy", () => {
    queryRef.current = makeFixture({
      assessment: "at_market",
      weightedScore: 0.01,
      explainer:
        "List price aligns with our fair value, the portal consensus, and recent comps.",
    });
    render(<ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />);

    expect(screen.getByRole("status")).toHaveTextContent(/At market/i);
  });

  it("renders the insufficient state with no explainer paragraph but tiles still present", () => {
    queryRef.current = makeFixture({
      assessment: "insufficient",
      weightedScore: null,
      explainer: null,
      referencesAvailable: 1,
      signalsAgreed: 0,
    });
    render(<ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /Insufficient pricing context/i,
    );
    // No explainer text leaks in for insufficient.
    expect(
      screen.queryByText(/above our fair value/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/below our fair value/i),
    ).not.toBeInTheDocument();
    // Tiles still render (even if some are unavailable).
    expect(screen.getByText(/Suggested list price/i)).toBeInTheDocument();
    expect(screen.getByText(/Comp median/i)).toBeInTheDocument();
  });

  it("renders 'Not available yet' for an unavailable comp tile", () => {
    queryRef.current = makeFixture({ compIsAvailable: false });
    render(<ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />);

    // Provenance text and tile value both render the unavailable copy.
    const matches = screen.getAllByText(/Not available yet/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("formats currency values with a $ prefix and comma separators (no cents)", () => {
    queryRef.current = makeFixture();
    render(<ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />);

    // The fair value tile should show $460,000 without cents.
    expect(screen.getByText("$460,000")).toBeInTheDocument();
    expect(screen.getByText("$470,000")).toBeInTheDocument();
    expect(screen.getByText("$472,500")).toBeInTheDocument();
  });

  it("exposes aria-labels on the card root and on each reference tile", () => {
    queryRef.current = makeFixture();
    const { container } = render(
      <ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />,
    );

    // The card root labels itself via aria-labelledby pointing at the
    // heading "Is this priced right?".
    const heading = screen.getByRole("heading", {
      name: /Is this priced right\?/i,
    });
    const headingId = heading.getAttribute("id");
    expect(headingId).toBeTruthy();
    const labelledRegion = container.querySelector(
      `[aria-labelledby="${headingId}"]`,
    );
    expect(labelledRegion).not.toBeNull();

    // Each tile is rendered as a focusable group with its own aria-label
    // that starts with the tile title.
    const groups = container.querySelectorAll('[role="group"][aria-label]');
    const labels = Array.from(groups).map(
      (g) => g.getAttribute("aria-label") ?? "",
    );
    const expectedTitles = [
      "Suggested list price",
      "AVM estimate",
      "Comp median",
      "Market velocity",
    ];
    for (const title of expectedTitles) {
      expect(labels.some((l) => l.startsWith(`${title}:`))).toBe(true);
    }
  });

  it("announces 'X of Y signals agree' on the assessment chip", () => {
    queryRef.current = makeFixture({
      assessment: "over_market",
      signalsAgreed: 3,
      totalSignals: 4,
    });
    render(<ListPriceReviewCard dealRoomId={DEAL_ROOM_ID} />);

    const chip = screen.getByRole("status");
    const ariaLabel = chip.getAttribute("aria-label") ?? "";
    expect(ariaLabel).toContain("3 of 4 signals agree");
  });
});
