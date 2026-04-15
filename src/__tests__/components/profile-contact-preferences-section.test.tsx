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
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const trackMock = vi.hoisted(() => vi.fn());
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}));

import { ProfileContactPreferencesSection } from "@/components/dashboard/profile/ProfileContactPreferencesSection";

function buildQueryResult() {
  return {
    hasStoredPreferences: true,
    deliveryMatrix: {
      transactional: { email: true, sms: true, push: true, in_app: true },
      tours: { email: true, sms: true, push: true, in_app: true },
      offers: { email: true, sms: true, push: true, in_app: true },
      closing: { email: true, sms: true, push: true, in_app: true },
      disclosures: { email: true, sms: true, push: true, in_app: true },
      market_updates: {
        email: false,
        sms: false,
        push: false,
        in_app: false,
      },
      marketing: { email: false, sms: false, push: false, in_app: false },
      safety: { email: true, sms: true, push: true, in_app: true },
    },
    quietHours: {
      enabled: true,
      timeZone: "America/New_York",
      start: "21:00",
      end: "08:00",
      suppressSms: true,
      suppressPush: true,
    },
  };
}

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

beforeEach(() => {
  useQueryMock.mockReset();
  useMutationMock.mockReset();
  trackMock.mockReset();
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
  toastMocks.info.mockReset();
  useQueryMock.mockReturnValue(buildQueryResult());
  useMutationMock.mockReturnValue(vi.fn().mockResolvedValue(buildQueryResult()));
  window.history.replaceState({}, "", "/dashboard/profile");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ProfileContactPreferencesSection", () => {
  it("renders the matrix shell, safety explainer, and web push recovery copy", () => {
    render(<ProfileContactPreferencesSection />);

    const desktop = screen.getByTestId("notification-matrix-desktop");
    expect(within(desktop).getByText("Transactional")).toBeInTheDocument();
    expect(
      within(desktop).getByText(
        /wire-fraud warnings and time-critical closing alerts cannot be disabled/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(desktop).getAllByText("Push requires iOS app")[0],
    ).toBeInTheDocument();

    const mobile = screen.getByTestId("notification-matrix-mobile");
    expect(within(mobile).getAllByRole("button", { name: "Push" }).length).toBeGreaterThan(0);
  });

  it("autosaves a successful matrix toggle and tracks the confirmed diff", async () => {
    vi.useFakeTimers();
    const mutationMock = vi.fn().mockResolvedValue({
      ...buildQueryResult(),
      deliveryMatrix: {
        ...buildQueryResult().deliveryMatrix,
        marketing: {
          ...buildQueryResult().deliveryMatrix.marketing,
          email: true,
        },
      },
    });
    useMutationMock.mockReturnValue(mutationMock);

    render(<ProfileContactPreferencesSection />);

    const desktop = screen.getByTestId("notification-matrix-desktop");
    const marketingEmail = within(desktop).getAllByRole("switch", {
      name: "marketing email",
    })[0];

    expect(marketingEmail).toHaveAttribute("aria-checked", "false");

    fireEvent.click(marketingEmail);

    expect(marketingEmail).toHaveAttribute("aria-checked", "true");

    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mutationMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      "notification_preference_changed",
      {
        category: "marketing",
        channel: "email",
        direction: "on",
        source: "preference_center",
      },
    );
    
    expect(screen.getByText("Saved just now.")).toBeInTheDocument();
  });

  it("rolls back optimistic state when the save fails", async () => {
    vi.useFakeTimers();
    const mutationMock = vi
      .fn()
      .mockRejectedValue(new Error("Save failed on server"));
    useMutationMock.mockReturnValue(mutationMock);

    render(<ProfileContactPreferencesSection />);

    const desktop = screen.getByTestId("notification-matrix-desktop");
    const marketUpdatesEmail = within(desktop).getAllByRole("switch", {
      name: "market_updates email",
    })[0];

    fireEvent.click(marketUpdatesEmail);
    expect(marketUpdatesEmail).toHaveAttribute("aria-checked", "true");

    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mutationMock).toHaveBeenCalledTimes(1);
    expect(toastMocks.error).toHaveBeenCalledWith("Save failed on server");
    expect(marketUpdatesEmail).toHaveAttribute("aria-checked", "false");
  });

  it("tracks footer-driven notification landings separately", async () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard/profile?source=email_footer#notifications",
    );

    render(<ProfileContactPreferencesSection />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(trackMock).toHaveBeenCalledWith(
      "notification_manage_link_clicked",
      {
        source: "email_footer",
      },
    );
  });
});
