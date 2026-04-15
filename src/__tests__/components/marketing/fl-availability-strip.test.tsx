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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const trackMock = vi.fn();
vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

const upsertMock = vi.fn();
vi.mock("convex/react", () => ({
  useMutation: () => upsertMock,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe = (target: Element) => {
    // Fire visible immediately so the viewed event is exercised.
    this.callback(
      [
        {
          isIntersecting: true,
          target,
          intersectionRatio: 1,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: 0,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  };
  disconnect = () => {};
  unobserve = () => {};
  takeRecords = () => [] as IntersectionObserverEntry[];
  root = null;
  rootMargin = "";
  thresholds: ReadonlyArray<number> = [];
}

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: stub,
  });
}

beforeAll(() => {
  (
    globalThis as unknown as {
      IntersectionObserver: typeof MockIntersectionObserver;
    }
  ).IntersectionObserver = MockIntersectionObserver;
  installLocalStorageStub();
  if (typeof window !== "undefined") {
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
});

beforeEach(() => {
  trackMock.mockReset();
  upsertMock.mockReset();
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  cleanup();
});

import { FloridaAvailabilityStrip } from "@/components/marketing/FloridaAvailabilityStrip";
import { MARKETING_AVAILABILITY } from "@/content/marketing-availability";

const DISMISSED_KEY = "buyer_v2_fl_strip_dismissed_v1";

describe("FloridaAvailabilityStrip", () => {
  it("renders the configured copy and CTA label", () => {
    render(<FloridaAvailabilityStrip />);
    expect(
      screen.getByText(MARKETING_AVAILABILITY.strip.copy),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: MARKETING_AVAILABILITY.strip.ctaLabel,
      }),
    ).toBeInTheDocument();
  });

  it("fires fl_strip_viewed once on first visibility", async () => {
    render(<FloridaAvailabilityStrip />);
    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith("fl_strip_viewed", { route: "/" });
    });
    const viewedCalls = trackMock.mock.calls.filter(
      (call) => call[0] === "fl_strip_viewed",
    );
    expect(viewedCalls).toHaveLength(1);
  });

  it("opens the dialog and fires CTA + dialog_opened events on click", async () => {
    render(<FloridaAvailabilityStrip />);
    fireEvent.click(
      screen.getByRole("button", {
        name: MARKETING_AVAILABILITY.strip.ctaLabel,
      }),
    );
    expect(trackMock).toHaveBeenCalledWith("fl_strip_cta_clicked", {
      route: "/",
    });
    expect(trackMock).toHaveBeenCalledWith("waitlist_dialog_opened", {
      source: "strip",
      route: "/",
    });
    await waitFor(() => {
      const matches = screen.getAllByText(
        MARKETING_AVAILABILITY.dialog.description,
      );
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("dismiss writes localStorage, fires the event, and unmounts the strip", () => {
    const { container } = render(<FloridaAvailabilityStrip />);
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss availability notice" }),
    );
    expect(trackMock).toHaveBeenCalledWith("fl_strip_dismissed", {
      route: "/",
    });
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");
    expect(
      container.querySelector('[data-testid="fl-availability-strip"]'),
    ).toBeNull();
  });

  it("returns null when localStorage is pre-set to dismissed", () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    const { container } = render(<FloridaAvailabilityStrip />);
    expect(
      container.querySelector('[data-testid="fl-availability-strip"]'),
    ).toBeNull();
  });

  it("returns null when the rollout flag is disabled", () => {
    const { container } = render(<FloridaAvailabilityStrip enabled={false} />);
    expect(
      container.querySelector('[data-testid="fl-availability-strip"]'),
    ).toBeNull();
  });
});

describe("NonFloridaWaitlistDialog (via strip)", () => {
  function openDialog() {
    render(<FloridaAvailabilityStrip />);
    fireEvent.click(
      screen.getByRole("button", {
        name: MARKETING_AVAILABILITY.strip.ctaLabel,
      }),
    );
  }

  it("blocks submit and shows an inline error for an invalid email", async () => {
    upsertMock.mockResolvedValue({ ok: true });
    openDialog();
    const emailInput = await screen.findByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "not-an-email" } });
    const stateSelect = screen.getByLabelText("State");
    fireEvent.change(stateSelect, { target: { value: "TX" } });
    fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));

    expect(
      await screen.findByText(/that email doesn.t look right/i),
    ).toBeInTheDocument();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(trackMock).toHaveBeenCalledWith("waitlist_submit_error", {
      route: "/",
      errorKind: "invalid_email",
    });
  });

  it("submits a valid form, fires waitlist_submitted, and shows the success state", async () => {
    upsertMock.mockResolvedValue({ ok: true });
    openDialog();

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "TX" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });
    const args = upsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.email).toBe("buyer@example.com");
    expect(args.stateCode).toBe("TX");
    expect(args.zip).toBeUndefined();
    expect(args.sourcePath).toBe("/");

    await waitFor(() => {
      expect(
        screen.getByText(/we.ll email when we launch in texas\./i),
      ).toBeInTheDocument();
    });
    expect(trackMock).toHaveBeenCalledWith(
      "waitlist_submitted",
      expect.objectContaining({
        route: "/",
        stateCode: "TX",
        zipPresent: false,
      }),
    );
  });

  it("renders an inline error when the mutation reports rate_limited", async () => {
    upsertMock.mockResolvedValue({ ok: false, reason: "rate_limited" });
    openDialog();
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "CA" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));

    expect(
      await screen.findByText(/you just signed up/i),
    ).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("waitlist_submit_error", {
      route: "/",
      errorKind: "rate_limited",
    });
  });
});
