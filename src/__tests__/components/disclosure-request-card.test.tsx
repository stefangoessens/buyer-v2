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

// ─── Module-level mocks ────────────────────────────────────────────────
// Hoisted mocks for `track`, `useMutation`, and `useQuery` so the
// DisclosureRequestCard + preview dialog can be exercised in jsdom
// without a real Convex client.

const trackMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

// Hugeicons render as inert SVGs in jsdom; stub the React wrapper so
// every icon becomes a visually empty span. We keep the real core icons
// module so indirect imports (e.g. Radix dialog close button) keep
// resolving their symbol refs without a manual allowlist.
vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}));

// jsdom polyfills for Radix Dialog / Sheet.
beforeAll(() => {
  if (typeof window !== "undefined") {
    if (!window.matchMedia) {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (query: string) => ({
          matches: query.includes("min-width: 768px"),
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
    if (
      !(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver
    ) {
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
});

// Imports AFTER mocks so module init picks them up.
import { DisclosureRequestCard } from "@/components/property/disclosures/DisclosureRequestCard";
import type { Id } from "../../../convex/_generated/dataModel";

const DEAL_ROOM_ID = "deal-room-1" as unknown as Id<"dealRooms">;

function stubFlag(value: string | undefined) {
  if (value === undefined) {
    // `vi.stubEnv` only accepts strings, so use an empty string to mean
    // "unset" — the component's strict-equality check treats it as off.
    vi.stubEnv("NEXT_PUBLIC_KIN_1079_REQUEST_DISCLOSURES_ENABLED", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_KIN_1079_REQUEST_DISCLOSURES_ENABLED", value);
  }
}

beforeEach(() => {
  trackMock.mockReset();
  useQueryMock.mockReset();
  useMutationMock.mockReset();
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
  toastMocks.info.mockReset();
  // Default: no active request for the deal room.
  useQueryMock.mockReturnValue(null);
  // Default mutation: no-op that succeeds.
  useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({ requestId: "req_1" }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

// ─── Tests ─────────────────────────────────────────────────────────────

describe("DisclosureRequestCard — feature flag lock", () => {
  it("renders nothing when NEXT_PUBLIC_KIN_1079_REQUEST_DISCLOSURES_ENABLED is unset", () => {
    stubFlag(undefined);
    const { container } = render(
      <DisclosureRequestCard dealRoomId={DEAL_ROOM_ID} />,
    );
    expect(container.firstChild).toBeNull();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("renders nothing when the flag is set to a non-'true' value", () => {
    stubFlag("1");
    const { container } = render(
      <DisclosureRequestCard dealRoomId={DEAL_ROOM_ID} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("DisclosureRequestCard — empty state", () => {
  beforeEach(() => {
    stubFlag("true");
    useQueryMock.mockReturnValue(null);
  });

  it("renders the Preview the email CTA when no active request exists", () => {
    render(<DisclosureRequestCard dealRoomId={DEAL_ROOM_ID} />);

    // Screen-reader label on the card root.
    expect(
      screen.getByLabelText("Request disclosures from listing agent"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /preview the email/i }),
    ).toBeInTheDocument();
  });

  it("fires disclosure_request_card_viewed exactly once on mount", async () => {
    render(<DisclosureRequestCard dealRoomId={DEAL_ROOM_ID} />);

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith(
        "disclosure_request_card_viewed",
        { dealRoomId: DEAL_ROOM_ID },
      );
    });

    const viewedCalls = trackMock.mock.calls.filter(
      (call) => call[0] === "disclosure_request_card_viewed",
    );
    expect(viewedCalls).toHaveLength(1);
  });

  it("opens the preview dialog when Preview the email is clicked", async () => {
    render(<DisclosureRequestCard dealRoomId={DEAL_ROOM_ID} />);

    fireEvent.click(
      screen.getByRole("button", { name: /preview the email/i }),
    );

    // Dialog renders its body into a portal but testing-library finds it
    // via the SR-only header title.
    await waitFor(() => {
      expect(
        screen.getByText(/preview disclosure request email/i),
      ).toBeInTheDocument();
    });

    // Track opened event fires.
    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith(
        "disclosure_request_preview_opened",
        { dealRoomId: DEAL_ROOM_ID },
      );
    });
  });
});

describe("DisclosureRequestCard — active sent request", () => {
  beforeEach(() => {
    stubFlag("true");
    useQueryMock.mockReturnValue({
      _id: "req_1",
      _creationTime: 100,
      dealRoomId: DEAL_ROOM_ID,
      status: "sent",
      sentAt: "2026-04-10T12:00:00.000Z",
      openedAt: null,
      repliedAt: null,
      nextFollowUpDueAt: "2026-04-12T12:00:00.000Z",
      followUpCount: 0,
      listingAgentEmail: "agent@example.com",
      subject: "Disclosure request — 123 Ocean Dr",
      bodyText: "Hi there,",
      provider: "noop",
      createdAt: "2026-04-10T12:00:00.000Z",
      updatedAt: "2026-04-10T12:00:00.000Z",
    });
  });

  it("renders the status timeline and hides the Preview CTA", () => {
    render(<DisclosureRequestCard dealRoomId={DEAL_ROOM_ID} />);

    // The timeline exposes a semantic list with the 3 stages.
    expect(screen.getByRole("list")).toBeInTheDocument();

    // No CTA in timeline mode.
    expect(
      screen.queryByRole("button", { name: /preview the email/i }),
    ).toBeNull();
  });
});

describe("DisclosureRequestPreviewDialog — send path", () => {
  let sendMutationMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stubFlag("true");
    useQueryMock.mockReturnValue(null);
    sendMutationMock = vi.fn().mockResolvedValue({ requestId: "req_1" });
    useMutationMock.mockReturnValue(sendMutationMock);
  });

  it("the Send button is enabled with no personal note (note is optional)", async () => {
    render(<DisclosureRequestCard dealRoomId={DEAL_ROOM_ID} />);
    fireEvent.click(
      screen.getByRole("button", { name: /preview the email/i }),
    );

    const sendBtn = await screen.findByRole("button", {
      name: /send request/i,
    });
    // Defense-in-depth: not disabled, and no aria-disabled flag.
    expect(sendBtn).not.toBeDisabled();
    expect(sendBtn.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("clicking Send calls the mutation with { dealRoomId, personalNote: undefined } and fires disclosure_request_sent", async () => {
    render(<DisclosureRequestCard dealRoomId={DEAL_ROOM_ID} />);
    fireEvent.click(
      screen.getByRole("button", { name: /preview the email/i }),
    );

    const sendBtn = await screen.findByRole("button", {
      name: /send request/i,
    });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(sendMutationMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = sendMutationMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(callArgs).toMatchObject({ dealRoomId: DEAL_ROOM_ID });
    // With no personal note typed, the mutation receives `undefined`.
    expect(callArgs.personalNote).toBeUndefined();

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith("disclosure_request_sent", {
        dealRoomId: DEAL_ROOM_ID,
        hasPersonalNote: false,
      });
    });
  });
});
