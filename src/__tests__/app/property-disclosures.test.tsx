// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as React from "react";

// ── Convex/react mock ─────────────────────────────────────────────────────
type MockFn = ReturnType<typeof vi.fn>;

const queryState: Record<string, unknown> = {};
const mutationMocks: Record<string, MockFn> = {
  generateUploadUrl: vi.fn(),
  commitUpload: vi.fn(),
  sendMessage: vi.fn(),
};

vi.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    const name = resolveFunctionName(ref);
    if (name === "getLatestPacket") return queryState.latest;
    if (name === "listPacketHistory") return queryState.history;
    if (name === "listBrokerReviewQueue") return queryState.queue;
    return undefined;
  },
  useMutation: (ref: unknown) => {
    const name = resolveFunctionName(ref);
    return mutationMocks[name] ?? vi.fn();
  },
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    disclosures: {
      getLatestPacket: { __kind: "query", name: "getLatestPacket" },
      listPacketHistory: { __kind: "query", name: "listPacketHistory" },
      listBrokerReviewQueue: {
        __kind: "query",
        name: "listBrokerReviewQueue",
      },
      generateUploadUrl: { __kind: "mutation", name: "generateUploadUrl" },
      commitUpload: { __kind: "mutation", name: "commitUpload" },
    },
    propertyChat: {
      sendMessage: { __kind: "mutation", name: "sendMessage" },
    },
  },
}));

vi.mock("@/lib/analytics/disclosure-events", () => ({
  trackDisclosureEvent: vi.fn(),
  DISCLOSURE_EVENTS: {},
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function resolveFunctionName(ref: unknown): string {
  if (ref && typeof ref === "object" && "name" in ref) {
    return String((ref as { name: unknown }).name);
  }
  return "";
}

// jsdom polyfills for Radix accordion.
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

// Imports AFTER mocks so module init is correct.
import { DisclosuresClient } from "@/components/property/disclosures/DisclosuresClient";
import { trackDisclosureEvent } from "@/lib/analytics/disclosure-events";
import type {
  Doc,
  Id,
} from "../../../convex/_generated/dataModel";

const DEAL_ROOM_ID = "deal-room-1" as unknown as Id<"dealRooms">;
const BUYER_ID = "buyer-1" as unknown as Id<"users">;
const PROPERTY_ID = "prop-1";
const PACKET_ID = "packet-1" as unknown as Id<"disclosurePackets">;

type PacketDoc = Doc<"disclosurePackets">;
type FindingDoc = Doc<"fileAnalysisFindings">;

function makePacket(
  overrides: Partial<PacketDoc> & {
    status: PacketDoc["status"];
    files?: PacketDoc["files"];
    version?: number;
  },
): PacketDoc {
  const now = "2026-04-14T12:00:00.000Z";
  const base: PacketDoc = {
    _id: PACKET_ID,
    _creationTime: Date.parse(now),
    dealRoomId: DEAL_ROOM_ID,
    buyerId: BUYER_ID,
    propertyId: PROPERTY_ID as unknown as Id<"properties">,
    version: 1,
    status: overrides.status,
    contentHash: "abc",
    files: [
      {
        storageId: "storage-1" as unknown as Id<"_storage">,
        fileName: "sellers_disclosure.pdf",
        fileHash: "hash1",
        byteSize: 1234,
        mimeType: "application/pdf",
        status: "done",
      },
    ],
    createdAt: now,
    updatedAt: now,
  } as PacketDoc;
  return { ...base, ...overrides } as PacketDoc;
}

function makeFinding(
  overrides: Partial<FindingDoc> & {
    severity: FindingDoc["severity"];
    label: string;
  },
): FindingDoc {
  const now = "2026-04-14T12:00:00.000Z";
  const base: FindingDoc = {
    _id: `finding-${Math.random().toString(36).slice(2, 8)}` as unknown as Id<"fileAnalysisFindings">,
    _creationTime: Date.parse(now),
    jobId: "job-1" as unknown as Id<"fileAnalysisJobs">,
    dealRoomId: DEAL_ROOM_ID,
    rule: "hoa_reserves_adequate",
    severity: overrides.severity,
    label: overrides.label,
    summary: "Short summary of the finding.",
    confidence: 0.82,
    requiresReview: true,
    createdAt: now,
    packetId: PACKET_ID,
    packetVersion: 1,
    findingKey: `key-${overrides.label}`,
    sourceFileName: "sellers_disclosure.pdf",
    pageReference: "p. 4",
    category: "hoa",
    evidenceQuote: "The HOA reserves are currently at 12% of target.",
    buyerFriendlyExplanation:
      "The association's rainy-day fund is below the level lenders usually want to see.",
    recommendedAction:
      "Ask the HOA for a copy of the reserve study and 12-month budget.",
  } as FindingDoc;
  return { ...base, ...overrides } as FindingDoc;
}

beforeEach(() => {
  queryState.latest = undefined;
  queryState.history = [];
  queryState.queue = undefined;
  Object.values(mutationMocks).forEach((m) => m.mockReset());
  (trackDisclosureEvent as unknown as MockFn).mockClear();
  mutationMocks.sendMessage.mockResolvedValue("message-1");
});

afterEach(() => {
  cleanup();
});

describe("DisclosuresClient", () => {
  it("renders the upload card empty state when no packet exists", () => {
    queryState.latest = null;
    queryState.history = [];
    render(
      <DisclosuresClient
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Upload the disclosure packet/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Choose files/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("disclosure-legal-disclaimer"),
    ).toBeInTheDocument();
  });

  it("renders processing state with 'Usually 30–90 seconds' while the packet is processing", () => {
    const packet = makePacket({
      status: "processing",
      files: [
        {
          storageId: "storage-1" as unknown as Id<"_storage">,
          fileName: "disclosure.pdf",
          fileHash: "hash1",
          byteSize: 2048,
          mimeType: "application/pdf",
          status: "ocr",
        },
      ],
    });
    queryState.latest = { packet, findings: [] };
    queryState.history = [packet];

    render(
      <DisclosuresClient
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(screen.getByText(/Analyzing your packet/i)).toBeInTheDocument();
    expect(screen.getByText(/Usually 30–90 seconds/i)).toBeInTheDocument();
    expect(screen.getByText(/Extracting text…/i)).toBeInTheDocument();
    expect(
      screen.getByTestId("disclosure-legal-disclaimer"),
    ).toBeInTheDocument();
  });

  it("renders all severity buckets when findings are ready", () => {
    const packet = makePacket({ status: "ready" });
    const findings: FindingDoc[] = [
      makeFinding({ severity: "high", label: "HOA reserves low" }),
      makeFinding({ severity: "medium", label: "Roof age flagged" }),
      makeFinding({ severity: "low", label: "Sprinkler zone note" }),
    ];
    queryState.latest = { packet, findings };
    queryState.history = [packet];

    render(
      <DisclosuresClient
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(screen.getByText(/HOA reserves low/)).toBeInTheDocument();
    expect(screen.getByText(/Roof age flagged/)).toBeInTheDocument();
    expect(screen.getByText(/Sprinkler zone note/)).toBeInTheDocument();
    expect(screen.getByText(/1 high/)).toBeInTheDocument();
    expect(screen.getByText(/1 medium/)).toBeInTheDocument();
    expect(screen.getByText(/1 low/)).toBeInTheDocument();

    // FINDINGS_RENDERED fires once on first render of non-empty list.
    const events = (trackDisclosureEvent as unknown as MockFn).mock.calls.map(
      (c) => c[0],
    );
    expect(events).toContain("FINDINGS_RENDERED");

    // Expand the first accordion row — FINDING_EXPANDED should fire.
    const trigger = screen.getByRole("button", { name: /HOA reserves low/ });
    fireEvent.click(trigger);
    const expandedEvents = (
      trackDisclosureEvent as unknown as MockFn
    ).mock.calls.map((c) => c[0]);
    expect(expandedEvents).toContain("FINDING_EXPANDED");
  });

  it("renders partial_failure with the warning banner and the successful findings", () => {
    const packet = makePacket({
      status: "partial_failure",
      files: [
        {
          storageId: "storage-1" as unknown as Id<"_storage">,
          fileName: "good1.pdf",
          fileHash: "h1",
          byteSize: 1024,
          mimeType: "application/pdf",
          status: "done",
        },
        {
          storageId: "storage-2" as unknown as Id<"_storage">,
          fileName: "good2.pdf",
          fileHash: "h2",
          byteSize: 1024,
          mimeType: "application/pdf",
          status: "done",
        },
        {
          storageId: "storage-3" as unknown as Id<"_storage">,
          fileName: "bad.pdf",
          fileHash: "h3",
          byteSize: 1024,
          mimeType: "application/pdf",
          status: "failed",
          failureReason: "OCR timeout",
        },
      ],
    });
    const findings: FindingDoc[] = [
      makeFinding({ severity: "high", label: "Roof end-of-life warning" }),
    ];
    queryState.latest = { packet, findings };
    queryState.history = [packet];

    render(
      <DisclosuresClient
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(
      screen.getByText(/Some files couldn't be analyzed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Roof end-of-life warning/)).toBeInTheDocument();
    // Failed file shows its reason in the findings list per-file status block.
    expect(screen.queryByText(/OCR timeout/i)).toBeInTheDocument();
  });

  it("fires FINDING_CHAT_OPENED and calls the mutation when 'Ask about this' is clicked", async () => {
    const packet = makePacket({ status: "ready" });
    const findings: FindingDoc[] = [
      makeFinding({ severity: "high", label: "HOA reserves low" }),
    ];
    queryState.latest = { packet, findings };
    queryState.history = [packet];

    render(
      <DisclosuresClient
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    // Expand the row, then click "Ask about this".
    fireEvent.click(
      screen.getByRole("button", { name: /HOA reserves low/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Ask about this/i }),
    );

    const events = (trackDisclosureEvent as unknown as MockFn).mock.calls.map(
      (c) => c[0],
    );
    expect(events).toContain("FINDING_CHAT_OPENED");
    expect(mutationMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: PROPERTY_ID,
        wizardStep: "disclosures",
        content: expect.stringContaining("HOA reserves low"),
      }),
    );
  });

  it("suppresses the evidence block for not_disclosed findings and shows the fallback prompt", () => {
    const packet = makePacket({ status: "ready" });
    const findings: FindingDoc[] = [
      makeFinding({
        severity: "medium",
        label: "Roof age not disclosed",
        category: "not_disclosed",
        evidenceQuote: undefined,
        recommendedAction: undefined,
        buyerFriendlyExplanation:
          "The packet doesn't mention the roof age.",
      }),
    ];
    queryState.latest = { packet, findings };
    queryState.history = [packet];

    render(
      <DisclosuresClient
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    // Expand the row.
    fireEvent.click(
      screen.getByRole("button", { name: /Roof age not disclosed/ }),
    );
    expect(
      screen.getByText(/This isn't mentioned in the packet/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("disclosure-finding-evidence"),
    ).not.toBeInTheDocument();
  });

  it("keeps the legal disclaimer visible on every state", () => {
    queryState.latest = null;
    queryState.history = [];
    const { unmount } = render(
      <DisclosuresClient
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );
    expect(
      screen.getByTestId("disclosure-legal-disclaimer"),
    ).toBeInTheDocument();
    unmount();

    const packet = makePacket({ status: "processing" });
    queryState.latest = { packet, findings: [] };
    queryState.history = [packet];
    render(
      <DisclosuresClient
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );
    expect(
      screen.getByTestId("disclosure-legal-disclaimer"),
    ).toBeInTheDocument();
  });
});
