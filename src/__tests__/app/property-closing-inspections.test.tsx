// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as React from "react";

// ── Convex/react mock ─────────────────────────────────────────────────────
type MockFn = ReturnType<typeof vi.fn>;

const queryState: Record<string, unknown> = {};
const mutationMocks: Record<string, MockFn> = {
  generateUploadUrl: vi.fn(),
  commitUpload: vi.fn(),
  acknowledgeLifeSafetyFinding: vi.fn(),
  sendMessage: vi.fn(),
};

vi.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    const name = resolveFunctionName(ref);
    if (name === "getLatestPacket") return queryState.latest;
    if (name === "listPacketHistory") return queryState.history;
    if (name === "getInspectionFindingsByPacket") return queryState.findings;
    if (name === "listByDealRoom") return queryState.milestones;
    if (name === "listByProperty") return queryState.facts;
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
      generateUploadUrl: { __kind: "mutation", name: "generateUploadUrl" },
      commitUpload: { __kind: "mutation", name: "commitUpload" },
    },
    fileAnalysis: {
      getInspectionFindingsByPacket: {
        __kind: "query",
        name: "getInspectionFindingsByPacket",
      },
      acknowledgeLifeSafetyFinding: {
        __kind: "mutation",
        name: "acknowledgeLifeSafetyFinding",
      },
    },
    contractMilestones: {
      listByDealRoom: { __kind: "query", name: "listByDealRoom" },
    },
    fileFacts: {
      listByProperty: { __kind: "query", name: "listByProperty" },
    },
    propertyChat: {
      sendMessage: { __kind: "mutation", name: "sendMessage" },
    },
  },
}));

vi.mock("@/lib/analytics/inspection-analysis-events", () => ({
  trackInspectionEvent: vi.fn(),
  INSPECTION_EVENTS: {},
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

// jsdom polyfills for Radix accordion + media queries.
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
import { InspectionsTabContent } from "@/components/closing/inspections/InspectionsTabContent";
import { trackInspectionEvent } from "@/lib/analytics/inspection-analysis-events";
import type {
  Doc,
  Id,
} from "../../../convex/_generated/dataModel";

const DEAL_ROOM_ID = "deal-room-1" as unknown as Id<"dealRooms">;
const PROPERTY_ID = "prop-1" as unknown as Id<"properties">;
const BUYER_ID = "buyer-1" as unknown as Id<"users">;
const PACKET_ID = "packet-inspection-1" as unknown as Id<"disclosurePackets">;

type PacketDoc = Doc<"disclosurePackets">;
type FindingDoc = Doc<"fileAnalysisFindings">;
type FactDoc = Doc<"fileFacts">;

function makePacket(
  overrides: Partial<PacketDoc> & {
    status: PacketDoc["status"];
  },
): PacketDoc {
  const now = "2026-04-14T12:00:00.000Z";
  const base: PacketDoc = {
    _id: PACKET_ID,
    _creationTime: Date.parse(now),
    dealRoomId: DEAL_ROOM_ID,
    buyerId: BUYER_ID,
    propertyId: PROPERTY_ID,
    version: 1,
    status: overrides.status,
    contentHash: "abc",
    workflow: "inspection",
    files: [
      {
        storageId: "storage-1" as unknown as Id<"_storage">,
        fileName: "general_inspection.pdf",
        fileHash: "h1",
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
    label: string;
    buyerSeverity?: FindingDoc["buyerSeverity"];
    system?: FindingDoc["system"];
  },
): FindingDoc {
  const now = "2026-04-14T12:00:00.000Z";
  const base: FindingDoc = {
    _id: `finding-${Math.random().toString(36).slice(2, 8)}` as unknown as Id<"fileAnalysisFindings">,
    _creationTime: Date.parse(now),
    jobId: "job-1" as unknown as Id<"fileAnalysisJobs">,
    dealRoomId: DEAL_ROOM_ID,
    rule: "roof_age_insurability",
    severity: "high",
    label: overrides.label,
    summary: "Short summary of the finding.",
    confidence: 0.82,
    requiresReview: true,
    createdAt: now,
    packetId: PACKET_ID,
    packetVersion: 1,
    findingKey: `key-${overrides.label.replace(/\s+/g, "-")}`,
    sourceFileName: "general_inspection.pdf",
    pageReference: "p. 4",
    buyerFriendlyExplanation: "Plain-English explanation here.",
    recommendedAction: "Get three contractor quotes.",
    evidenceQuote: "Inspector noted clear cracks at the south side.",
  } as FindingDoc;
  return { ...base, ...overrides } as FindingDoc;
}

function makeFact(
  factSlug: string,
  overrides: Partial<FactDoc> = {},
): FactDoc {
  const now = "2026-04-14T12:00:00.000Z";
  const base: FactDoc = {
    _id: `fact-${factSlug}` as unknown as Id<"fileFacts">,
    _creationTime: Date.parse(now),
    factSlug,
    storageId: "storage-1" as unknown as Id<"_storage">,
    propertyId: PROPERTY_ID,
    valueKind: "numeric",
    reviewStatus: "approved",
    internalOnly: false,
    createdAt: now,
    updatedAt: now,
  } as FactDoc;
  return { ...base, ...overrides } as FactDoc;
}

function isoHoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  queryState.latest = undefined;
  queryState.history = [];
  queryState.findings = undefined;
  queryState.milestones = [];
  queryState.facts = [];
  Object.values(mutationMocks).forEach((m) => m.mockReset());
  (trackInspectionEvent as unknown as MockFn).mockClear();
  mutationMocks.sendMessage.mockResolvedValue("message-1");
  mutationMocks.acknowledgeLifeSafetyFinding.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
});

describe("InspectionsTabContent", () => {
  it("renders the upload panel empty state when no packet exists", () => {
    queryState.latest = null;
    queryState.history = [];

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /Upload your inspection report/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("inspection-legal-disclaimer"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("inspection-big-ticket-tiles")).toBeNull();
  });

  it("renders processing state with usually 30-90 seconds copy", () => {
    const packet = makePacket({ status: "processing" });
    queryState.latest = { packet, findings: [] };
    queryState.history = [packet];
    queryState.findings = [];

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(
      screen.getByText(/Analyzing your inspection/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Usually 30–90 seconds/i)).toBeInTheDocument();
  });

  it("renders findings grouped by system with the life-safety banner above", async () => {
    const packet = makePacket({ status: "ready" });
    const findings: FindingDoc[] = [
      makeFinding({
        label: "Roof end-of-life",
        buyerSeverity: "major_repair",
        system: "roof",
      }),
      makeFinding({
        label: "Electrical service double-tap",
        buyerSeverity: "life_safety",
        system: "electrical",
      }),
      makeFinding({
        label: "HVAC airflow imbalance",
        buyerSeverity: "monitor",
        system: "hvac",
      }),
      makeFinding({
        label: "Faded paint on lanai",
        buyerSeverity: "cosmetic",
        system: "interior",
      }),
    ];
    queryState.latest = { packet, findings };
    queryState.history = [packet];
    queryState.findings = findings;

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(screen.getByText(/Roof end-of-life/)).toBeInTheDocument();
    // Life-safety items show in BOTH the banner and the findings list.
    expect(
      screen.getAllByText(/Electrical service double-tap/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/HVAC airflow imbalance/)).toBeInTheDocument();
    expect(screen.getByText(/Faded paint on lanai/)).toBeInTheDocument();

    expect(
      screen.getByTestId("inspection-life-safety-banner"),
    ).toBeInTheDocument();

    // System grouping rendered.
    expect(
      screen.getByTestId("inspection-system-group-electrical"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("inspection-system-group-roof"),
    ).toBeInTheDocument();

    const events = (
      trackInspectionEvent as unknown as MockFn
    ).mock.calls.map((c) => c[0]);
    expect(events).toContain("FINDINGS_RENDERED");
  });

  it("calls acknowledgeLifeSafetyFinding when the buyer checks the box", async () => {
    const packet = makePacket({ status: "ready" });
    const lifeSafety = makeFinding({
      label: "Open electrical service",
      buyerSeverity: "life_safety",
      system: "electrical",
    });
    queryState.latest = { packet, findings: [lifeSafety] };
    queryState.history = [packet];
    queryState.findings = [lifeSafety];

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    const checkbox = screen
      .getByTestId("inspection-life-safety-banner")
      .querySelector('button[role="checkbox"]');
    expect(checkbox).not.toBeNull();
    if (checkbox) {
      fireEvent.click(checkbox);
    }

    await waitFor(() => {
      expect(
        mutationMocks.acknowledgeLifeSafetyFinding,
      ).toHaveBeenCalledWith({ findingId: lifeSafety._id });
    });
  });

  it("renders all 5 big-ticket tiles from inspection facts and shows red chip for FPE panel", () => {
    const packet = makePacket({ status: "ready" });
    queryState.latest = { packet, findings: [] };
    queryState.history = [packet];
    queryState.findings = [];
    queryState.facts = [
      makeFact("inspection.roof_age_years", {
        valueKind: "numeric",
        valueNumeric: 18,
        valueNumericUnit: "years",
      }),
      makeFact("inspection.hvac_age_years", {
        valueKind: "numeric",
        valueNumeric: 6,
        valueNumericUnit: "years",
      }),
      makeFact("inspection.electrical_panel_type", {
        valueKind: "enum",
        valueEnum: "FPE",
        valueEnumAllowed: ["FPE", "Square D", "other"],
      }),
      makeFact("inspection.plumbing_material", {
        valueKind: "enum",
        valueEnum: "PEX",
        valueEnumAllowed: ["PEX", "polybutylene", "other"],
      }),
      makeFact("inspection.structural_concern_flag", {
        valueKind: "boolean",
        valueBoolean: false,
      }),
    ];

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    // Mobile rail + desktop grid both render the same set of tiles, so use getAllByTestId.
    expect(screen.getAllByTestId("inspection-tile-roof").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId("inspection-tile-hvac").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("inspection-tile-electrical").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("inspection-tile-plumbing").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("inspection-tile-structural").length,
    ).toBeGreaterThanOrEqual(1);

    // FPE chip should be visible inside an electrical tile.
    const electricalTiles = screen.getAllByTestId("inspection-tile-electrical");
    expect(electricalTiles[0].textContent).toContain("FPE");
  });

  it("hides the negotiation summary content when review state is pending", () => {
    const packet = makePacket({
      status: "ready",
      negotiationSummaryReviewState: "pending",
      negotiationSummaryBuyer: JSON.stringify({
        items: [{ title: "Roof patch" }],
      }),
    });
    queryState.latest = { packet, findings: [] };
    queryState.history = [packet];
    queryState.findings = [];

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(
      screen.getByTestId("inspection-negotiation-summary-pending"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("inspection-negotiation-summary"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Roof patch/)).not.toBeInTheDocument();
  });

  it("renders the negotiation summary when review state is approved and fires the viewed event", () => {
    const packet = makePacket({
      status: "ready",
      negotiationSummaryReviewState: "approved",
      negotiationSummaryBuyer: JSON.stringify({
        items: [
          {
            title: "Roof patch",
            rationale: "Inspector flagged 3 cracked tiles.",
            estimatedCostLowUsd: 800,
            estimatedCostHighUsd: 1500,
          },
        ],
        estimatedTotalLowUsd: 800,
        estimatedTotalHighUsd: 1500,
      }),
    });
    queryState.latest = { packet, findings: [] };
    queryState.history = [packet];
    queryState.findings = [];

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(
      screen.getByTestId("inspection-negotiation-summary"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Roof patch/)).toBeInTheDocument();
    expect(
      screen.getByText(/This analysis is informational only and broker-reviewed/i),
    ).toBeInTheDocument();

    const events = (
      trackInspectionEvent as unknown as MockFn
    ).mock.calls.map((c) => c[0]);
    expect(events).toContain("NEGOTIATION_SUMMARY_VIEWED");
  });

  it("shows the amber countdown banner when the inspection period is 36 hours away", () => {
    const packet = makePacket({ status: "ready" });
    queryState.latest = { packet, findings: [] };
    queryState.history = [packet];
    queryState.findings = [];
    queryState.milestones = [
      {
        _id: "milestone-1" as unknown as Id<"contractMilestones">,
        milestoneKey: "inspection_period_end",
        dueDate: isoHoursFromNow(36),
        name: "Inspection period end",
        workstream: "inspection",
        status: "pending",
      },
    ];

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    const banner = screen.getByTestId("inspection-deadline-countdown");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/hours? left to raise concerns/i);

    const events = (
      trackInspectionEvent as unknown as MockFn
    ).mock.calls.map((c) => c[0]);
    expect(events).toContain("DEADLINE_WARNING_SHOWN");
  });

  it("shows the URGENT banner when the inspection period is under 24 hours away", () => {
    const packet = makePacket({ status: "ready" });
    queryState.latest = { packet, findings: [] };
    queryState.history = [packet];
    queryState.findings = [];
    queryState.milestones = [
      {
        _id: "milestone-1" as unknown as Id<"contractMilestones">,
        milestoneKey: "inspection_period_end",
        dueDate: isoHoursFromNow(8),
        name: "Inspection period end",
        workstream: "inspection",
        status: "pending",
      },
    ];

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    const banner = screen.getByTestId("inspection-deadline-countdown");
    expect(banner.textContent).toMatch(/URGENT/);
  });

  it("hides the countdown banner when the inspection period is more than 48 hours away", () => {
    const packet = makePacket({ status: "ready" });
    queryState.latest = { packet, findings: [] };
    queryState.history = [packet];
    queryState.findings = [];
    queryState.milestones = [
      {
        _id: "milestone-1" as unknown as Id<"contractMilestones">,
        milestoneKey: "inspection_period_end",
        dueDate: isoHoursFromNow(96),
        name: "Inspection period end",
        workstream: "inspection",
        status: "pending",
      },
    ];

    render(
      <InspectionsTabContent
        dealRoomId={DEAL_ROOM_ID}
        propertyId={PROPERTY_ID}
      />,
    );

    expect(
      screen.queryByTestId("inspection-deadline-countdown"),
    ).not.toBeInTheDocument();
  });
});
