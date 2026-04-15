// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as React from "react";

// Convex/react mock — intercepted before any component imports resolve it.
type MockFn = ReturnType<typeof vi.fn>;
const queryMockRef: { current: unknown } = { current: undefined };
const mutationMocks: Record<string, MockFn> = {
  requestBrokerageCallback: vi.fn(),
  submitForReview: vi.fn(),
  upsertDraft: vi.fn(),
  discardDraft: vi.fn(),
  markBrokerageCallbackComplete: vi.fn(),
};

vi.mock("convex/react", () => ({
  useQuery: () => queryMockRef.current,
  useMutation: (ref: unknown) => {
    const name = resolveFunctionName(ref);
    return mutationMocks[name] ?? vi.fn();
  },
}));

// Stub the generated api module so imports don't try to hit Convex codegen.
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    offerCockpit: {
      getCockpit: { __kind: "query", name: "getCockpit" },
      upsertDraft: { __kind: "mutation", name: "upsertDraft" },
      submitForReview: { __kind: "mutation", name: "submitForReview" },
      discardDraft: { __kind: "mutation", name: "discardDraft" },
      requestBrokerageCallback: {
        __kind: "mutation",
        name: "requestBrokerageCallback",
      },
      markBrokerageCallbackComplete: {
        __kind: "mutation",
        name: "markBrokerageCallbackComplete",
      },
    },
  },
}));

// Fire-and-forget analytics — mock so tests stay hermetic even though the
// real module is guarded by `typeof window === "undefined"`. posthog-js's
// capture-before-init is a warning, not an error, but the mock lets us
// assert on event calls later if we ever want to.
vi.mock("@/lib/analytics/offer-gate-events", () => ({
  trackOfferGateEvent: vi.fn(),
  OFFER_GATE_EVENTS: {},
}));

function resolveFunctionName(ref: unknown): string {
  if (ref && typeof ref === "object" && "name" in ref) {
    return String((ref as { name: unknown }).name);
  }
  return "";
}

// jsdom polyfills for Radix / shadcn Dialog + Sheet + useIsDesktop hook.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: true, // force desktop path (Dialog, not Sheet)
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
  // Radix uses pointer-capture helpers that jsdom does not implement.
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

// Keep these imports AFTER the vi.mock calls so module-init order is correct.
import { useOfferCockpit } from "@/lib/dealroom/use-offer-cockpit";
import type {
  BrokerageCallState,
  OfferEligibilitySnapshot,
} from "@/lib/dealroom/offer-cockpit-types";
import { BrokeragePhoneGateModal } from "@/components/offer/BrokeragePhoneGateModal";
import { OfferSubmitStep } from "@/components/offer/OfferSubmitStep";
import type { Id } from "../../../../convex/_generated/dataModel";

const DEAL_ROOM_A = "deal-room-a" as unknown as Id<"dealRooms">;
const DEAL_ROOM_B = "deal-room-b" as unknown as Id<"dealRooms">;
const PROPERTY_ID = "prop-1";
const LIST_PRICE = 500_000;

interface MockCockpitInput {
  dealRoomId: string;
  brokerageCallState: BrokerageCallState;
  eligibility?: OfferEligibilitySnapshot;
  canEdit?: boolean;
}

function makeCockpitPayload({
  dealRoomId,
  brokerageCallState,
  eligibility = { isEligible: true },
  canEdit = true,
}: MockCockpitInput) {
  return {
    dealRoom: { _id: dealRoomId, buyerId: "buyer-1", status: "active" },
    propertyId: "prop-1",
    listPrice: 500_000,
    propertyAddress: "123 Palm Way, Miami, FL 33133",
    buyerProfile: { preApproved: true, budgetMax: 600_000 },
    draft: {
      _id: "draft-1" as unknown as Id<"offerCockpitDrafts">,
      status: "draft" as const,
      brokerReviewState: "not_submitted" as const,
      brokerNote: null,
      selectedScenarioName: null,
      offerPrice: 485_000,
      earnestMoney: 9_700,
      closingDays: 35,
      contingencies: ["inspection", "financing"],
      buyerCredits: 0,
      sellerCredits: 0,
      version: 1,
      lastSavedAt: "2026-04-14T12:00:00.000Z",
    },
    scenarios: null,
    eligibility,
    canEdit,
    viewerRole: "buyer" as const,
    brokerageCallState,
  };
}

function setMockQuery(payload: unknown) {
  queryMockRef.current = payload;
}

beforeEach(() => {
  Object.values(mutationMocks).forEach((m) => m.mockReset());
  mutationMocks.requestBrokerageCallback.mockResolvedValue({
    draftId: "draft-1",
    brokerageCallRequestedAt: "2026-04-14T12:05:00.000Z",
    brokerageCallPhone: "(305) 555-0123",
    wasAlreadyRequested: false,
  });
  mutationMocks.submitForReview.mockResolvedValue("draft-1");
  mutationMocks.upsertDraft.mockResolvedValue("draft-1");
  mutationMocks.discardDraft.mockResolvedValue(null);
  queryMockRef.current = undefined;
});

afterEach(() => {
  cleanup();
});

// --- Hook-level derivation harness ------------------------------------------
function HookHarness({ dealRoomId }: { dealRoomId: Id<"dealRooms"> }) {
  const cockpit = useOfferCockpit(dealRoomId);
  return (
    <div>
      <span data-testid="stage">{cockpit.brokerageStage}</span>
      <span data-testid="can-edit">{String(cockpit.canEdit)}</span>
      <span data-testid="can-submit">{String(cockpit.canSubmit)}</span>
      <span data-testid="call-requested-at">
        {cockpit.brokerageCallState?.requestedAt ?? ""}
      </span>
      <span data-testid="call-completed-at">
        {cockpit.brokerageCallState?.completedAt ?? ""}
      </span>
      <span data-testid="call-phone">
        {cockpit.brokerageCallState?.phone ?? ""}
      </span>
    </div>
  );
}

describe("useOfferCockpit — brokerage-gate state surface", () => {
  it("exposes stage='none' when server reports no callback request", () => {
    setMockQuery(
      makeCockpitPayload({
        dealRoomId: DEAL_ROOM_A,
        brokerageCallState: {
          requestedAt: null,
          phone: null,
          completedAt: null,
          completedBy: null,
          stage: "none",
        },
        canEdit: false,
      }),
    );
    render(<HookHarness dealRoomId={DEAL_ROOM_A} />);
    expect(screen.getByTestId("stage")).toHaveTextContent("none");
    expect(screen.getByTestId("call-requested-at")).toHaveTextContent("");
    expect(screen.getByTestId("can-edit")).toHaveTextContent("false");
  });

  it("exposes stage='requested' and unlocks canEdit once server says so", () => {
    setMockQuery(
      makeCockpitPayload({
        dealRoomId: DEAL_ROOM_A,
        brokerageCallState: {
          requestedAt: "2026-04-14T12:05:00.000Z",
          phone: "(305) 555-0123",
          completedAt: null,
          completedBy: null,
          stage: "requested",
        },
        canEdit: true,
      }),
    );
    render(<HookHarness dealRoomId={DEAL_ROOM_A} />);
    expect(screen.getByTestId("stage")).toHaveTextContent("requested");
    expect(screen.getByTestId("call-phone")).toHaveTextContent(
      "(305) 555-0123",
    );
    expect(screen.getByTestId("call-requested-at")).toHaveTextContent(
      "2026-04-14T12:05:00.000Z",
    );
    expect(screen.getByTestId("call-completed-at")).toHaveTextContent("");
    expect(screen.getByTestId("can-edit")).toHaveTextContent("true");
  });

  it("exposes stage='completed' with broker-side callback fields", () => {
    setMockQuery(
      makeCockpitPayload({
        dealRoomId: DEAL_ROOM_A,
        brokerageCallState: {
          requestedAt: "2026-04-14T12:05:00.000Z",
          phone: "(305) 555-0123",
          completedAt: "2026-04-14T12:30:00.000Z",
          completedBy: "broker-user-1",
          stage: "completed",
        },
      }),
    );
    render(<HookHarness dealRoomId={DEAL_ROOM_A} />);
    expect(screen.getByTestId("stage")).toHaveTextContent("completed");
    expect(screen.getByTestId("call-completed-at")).toHaveTextContent(
      "2026-04-14T12:30:00.000Z",
    );
  });

  it("defaults stage to 'none' when server payload is still loading", () => {
    setMockQuery(undefined);
    render(<HookHarness dealRoomId={DEAL_ROOM_A} />);
    expect(screen.getByTestId("stage")).toHaveTextContent("none");
    expect(screen.getByTestId("can-edit")).toHaveTextContent("false");
  });

  it("does NOT re-derive canEdit locally — trusts server canEdit even with callback requested", () => {
    setMockQuery(
      makeCockpitPayload({
        dealRoomId: DEAL_ROOM_A,
        brokerageCallState: {
          requestedAt: "2026-04-14T12:05:00.000Z",
          phone: "(305) 555-0123",
          completedAt: null,
          completedBy: null,
          stage: "requested",
        },
        canEdit: false,
      }),
    );
    render(<HookHarness dealRoomId={DEAL_ROOM_A} />);
    expect(screen.getByTestId("stage")).toHaveTextContent("requested");
    expect(screen.getByTestId("can-edit")).toHaveTextContent("false");
  });

  it("keeps dealRoom state independent across rerenders for different dealRoomIds", () => {
    setMockQuery(
      makeCockpitPayload({
        dealRoomId: DEAL_ROOM_A,
        brokerageCallState: {
          requestedAt: "2026-04-14T12:05:00.000Z",
          phone: "(305) 555-0123",
          completedAt: null,
          completedBy: null,
          stage: "requested",
        },
      }),
    );
    const { unmount } = render(<HookHarness dealRoomId={DEAL_ROOM_A} />);
    expect(screen.getByTestId("stage")).toHaveTextContent("requested");
    unmount();

    setMockQuery(
      makeCockpitPayload({
        dealRoomId: DEAL_ROOM_B,
        brokerageCallState: {
          requestedAt: null,
          phone: null,
          completedAt: null,
          completedBy: null,
          stage: "none",
        },
        canEdit: false,
      }),
    );
    render(<HookHarness dealRoomId={DEAL_ROOM_B} />);
    expect(screen.getByTestId("stage")).toHaveTextContent("none");
  });
});

// --- BrokeragePhoneGateModal (real component) ------------------------------
describe("BrokeragePhoneGateModal contract", () => {
  it("shows Stage 1 copy when opened", () => {
    render(
      <BrokeragePhoneGateModal
        open
        onOpenChange={vi.fn()}
        dealRoomId={DEAL_ROOM_A}
        propertyId={PROPERTY_ID}
        listPrice={LIST_PRICE}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: /Wait — Submitting This Offer Could Cost You/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /See How Much You Could Save/i }),
    ).toBeInTheDocument();
  });

  it("transitions Stage 1 → Stage 2 and reveals the phone input", () => {
    render(
      <BrokeragePhoneGateModal
        open
        onOpenChange={vi.fn()}
        dealRoomId={DEAL_ROOM_A}
        propertyId={PROPERTY_ID}
        listPrice={LIST_PRICE}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /See How Much You Could Save/i }),
    );
    expect(
      screen.getByRole("heading", { name: /Estimated Closing Credit/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Your phone number/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Get Started/i }),
    ).toBeInTheDocument();
  });

  it("calls requestBrokerageCallback with masked phone on success and shows confirmation", async () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    render(
      <BrokeragePhoneGateModal
        open
        onOpenChange={onOpenChange}
        dealRoomId={DEAL_ROOM_A}
        propertyId={PROPERTY_ID}
        listPrice={LIST_PRICE}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /See How Much You Could Save/i }),
    );
    fireEvent.change(screen.getByLabelText(/Your phone number/i), {
      target: { value: "3055550123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Get Started/i }));

    await waitFor(() => {
      expect(mutationMocks.requestBrokerageCallback).toHaveBeenCalledWith({
        dealRoomId: DEAL_ROOM_A,
        phone: "(305) 555-0123",
      });
    });

    // Success stage renders the confirmation copy — heading uses a stable id.
    await waitFor(() => {
      const headings = screen.getAllByText(/call you within 1 business hour/i);
      expect(headings.length).toBeGreaterThan(0);
    });
    expect(
      screen.getByRole("button", { name: /Continue to your offer/i }),
    ).toBeInTheDocument();

    // Dismissing the success stage fires onOpenChange(false) and onSuccess.
    fireEvent.click(
      screen.getByRole("button", { name: /Continue to your offer/i }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid phone client-side and never fires the mutation", () => {
    render(
      <BrokeragePhoneGateModal
        open
        onOpenChange={vi.fn()}
        dealRoomId={DEAL_ROOM_A}
        propertyId={PROPERTY_ID}
        listPrice={LIST_PRICE}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /See How Much You Could Save/i }),
    );
    fireEvent.change(screen.getByLabelText(/Your phone number/i), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Get Started/i }));

    expect(
      screen.getByText(/Please enter a valid US phone number/i),
    ).toBeInTheDocument();
    expect(mutationMocks.requestBrokerageCallback).not.toHaveBeenCalled();
  });

  it("disables the submit button while in-flight so rapid double-clicks only fire once", async () => {
    let resolveMutation: ((v: unknown) => void) | undefined;
    mutationMocks.requestBrokerageCallback.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve;
        }),
    );
    render(
      <BrokeragePhoneGateModal
        open
        onOpenChange={vi.fn()}
        dealRoomId={DEAL_ROOM_A}
        propertyId={PROPERTY_ID}
        listPrice={LIST_PRICE}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /See How Much You Could Save/i }),
    );
    fireEvent.change(screen.getByLabelText(/Your phone number/i), {
      target: { value: "3055550123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Get Started/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Submitting…/i }),
      ).toBeDisabled();
    });

    // Button label is now "Submitting…" and disabled — clicking again should be a no-op.
    fireEvent.click(screen.getByRole("button", { name: /Submitting…/i }));
    expect(mutationMocks.requestBrokerageCallback).toHaveBeenCalledTimes(1);

    resolveMutation?.({
      draftId: "draft-1",
      brokerageCallRequestedAt: "2026-04-14T12:05:00.000Z",
      brokerageCallPhone: "(305) 555-0123",
      wasAlreadyRequested: false,
    });
    await waitFor(() => {
      const matches = screen.getAllByText(/call you within 1 business hour/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("keeps multiple dealRooms independent — requesting on A never leaks to a separately-rendered B", async () => {
    // Render A and submit a valid phone — mutation should fire with dealRoomId=A.
    const { unmount } = render(
      <BrokeragePhoneGateModal
        open
        onOpenChange={vi.fn()}
        dealRoomId={DEAL_ROOM_A}
        propertyId={PROPERTY_ID}
        listPrice={LIST_PRICE}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /See How Much You Could Save/i }),
    );
    fireEvent.change(screen.getByLabelText(/Your phone number/i), {
      target: { value: "3055550123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Get Started/i }));
    await waitFor(() => {
      expect(mutationMocks.requestBrokerageCallback).toHaveBeenCalledWith({
        dealRoomId: DEAL_ROOM_A,
        phone: "(305) 555-0123",
      });
    });
    unmount();

    // Render B fresh — it has no phone filled and starts back at Stage 1.
    render(
      <BrokeragePhoneGateModal
        open
        onOpenChange={vi.fn()}
        dealRoomId={DEAL_ROOM_B}
        propertyId={PROPERTY_ID}
        listPrice={LIST_PRICE}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: /Wait — Submitting This Offer Could Cost You/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByText(/call you within 1 business hour/i),
    ).toHaveLength(0);

    // The earlier call to A did not pollute the mock — only the one call exists.
    const calls = mutationMocks.requestBrokerageCallback.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatchObject({ dealRoomId: DEAL_ROOM_A });
  });
});

// --- OfferSubmitStep (real component) --------------------------------------
describe("Sign & Submit guard", () => {
  it("is disabled with awaiting-callback label when callback not completed", () => {
    const onSubmit = vi.fn();
    render(
      <OfferSubmitStep
        brokerageCallState={{
          requestedAt: "2026-04-14T12:05:00.000Z",
          completedAt: null,
          stage: "requested",
        }}
        eligibility={{ isEligible: true }}
        draftStatus="draft"
        canSubmit={false}
        submitting={false}
        submitError={null}
        onSubmit={onSubmit}
        dealRoomId={DEAL_ROOM_A as unknown as string}
      />,
    );
    // Scope to the Sign & Submit card so we don't hit any unrelated buttons.
    const signSubmitHeading = screen.getByRole("heading", {
      name: /Sign & Submit/i,
    });
    const card = signSubmitHeading.closest("div")?.parentElement?.parentElement;
    expect(card).toBeTruthy();
    const btn = within(card as HTMLElement).getByRole("button", {
      name: /Awaiting broker callback/i,
    });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is disabled with awaiting-agreement label when callback completed but not eligible", () => {
    render(
      <OfferSubmitStep
        brokerageCallState={{
          requestedAt: "2026-04-14T12:05:00.000Z",
          completedAt: "2026-04-14T12:30:00.000Z",
          stage: "completed",
        }}
        eligibility={{
          isEligible: false,
          blockingReasonMessage: "Sign your buyer-broker agreement to proceed.",
        }}
        draftStatus="draft"
        canSubmit={false}
        submitting={false}
        submitError={null}
        onSubmit={vi.fn()}
        dealRoomId={DEAL_ROOM_A as unknown as string}
      />,
    );
    const btn = screen.getByRole("button", {
      name: /Awaiting signed agreement/i,
    });
    expect(btn).toBeDisabled();
  });

  it("is enabled and fires onSubmit when callback completed + eligible + canSubmit", () => {
    const onSubmit = vi.fn(() => {
      void mutationMocks.submitForReview({ dealRoomId: DEAL_ROOM_A });
    });
    render(
      <OfferSubmitStep
        brokerageCallState={{
          requestedAt: "2026-04-14T12:05:00.000Z",
          completedAt: "2026-04-14T12:30:00.000Z",
          stage: "completed",
        }}
        eligibility={{ isEligible: true }}
        draftStatus="draft"
        canSubmit={true}
        submitting={false}
        submitError={null}
        onSubmit={onSubmit}
        dealRoomId={DEAL_ROOM_A as unknown as string}
      />,
    );
    const btn = screen.getByRole("button", {
      name: /Submit offer for review/i,
    });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(mutationMocks.submitForReview).toHaveBeenCalledWith({
      dealRoomId: DEAL_ROOM_A,
    });
  });
});
