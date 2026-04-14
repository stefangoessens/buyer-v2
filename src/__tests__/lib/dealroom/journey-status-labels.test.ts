import { describe, it, expect } from "vitest";
import {
  JOURNEY_STATUS_LABELS,
  JOURNEY_STEP_INDEX,
  JOURNEY_STEP_LABEL,
  JOURNEY_TOTAL_STEPS,
  labelForJourneyStatus,
  journeyStepAriaLabel,
  type DealRoomLifecycleStatus,
} from "@/lib/dealroom/journey-status-labels";

const ALL_STATUSES: DealRoomLifecycleStatus[] = [
  "intake",
  "analysis",
  "tour_scheduled",
  "offer_prep",
  "offer_sent",
  "under_contract",
  "closing",
  "closed",
  "withdrawn",
];

describe("labelForJourneyStatus", () => {
  it("returns the buyer-facing label for every lifecycle status", () => {
    expect(labelForJourneyStatus("intake")).toBe("Just started");
    expect(labelForJourneyStatus("analysis")).toBe("Analyzing");
    expect(labelForJourneyStatus("tour_scheduled")).toBe("Tour scheduled");
    expect(labelForJourneyStatus("offer_prep")).toBe("Drafting offer");
    expect(labelForJourneyStatus("offer_sent")).toBe("Offer submitted");
    expect(labelForJourneyStatus("under_contract")).toBe("Under contract");
    expect(labelForJourneyStatus("closing")).toBe("Closing");
    expect(labelForJourneyStatus("closed")).toBe("Closed");
    expect(labelForJourneyStatus("withdrawn")).toBe("Withdrawn");
  });

  it("maps every lifecycle status to a non-empty label", () => {
    for (const status of ALL_STATUSES) {
      const label = JOURNEY_STATUS_LABELS[status];
      expect(label).toBeTypeOf("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("JOURNEY_STEP_INDEX", () => {
  it("is defined for all 9 lifecycle statuses", () => {
    for (const status of ALL_STATUSES) {
      expect(JOURNEY_STEP_INDEX[status]).toBeTypeOf("number");
    }
  });

  it("maps intake → 1 (Details)", () => {
    expect(JOURNEY_STEP_INDEX.intake).toBe(1);
  });

  it("maps analysis → 2 (Price)", () => {
    expect(JOURNEY_STEP_INDEX.analysis).toBe(2);
  });

  it("maps tour_scheduled → 3 (Disclosures)", () => {
    expect(JOURNEY_STEP_INDEX.tour_scheduled).toBe(3);
  });

  it("maps offer_prep and offer_sent → 4 (Offer)", () => {
    expect(JOURNEY_STEP_INDEX.offer_prep).toBe(4);
    expect(JOURNEY_STEP_INDEX.offer_sent).toBe(4);
  });

  it("maps under_contract, closing, and closed → 5 (Closing)", () => {
    expect(JOURNEY_STEP_INDEX.under_contract).toBe(5);
    expect(JOURNEY_STEP_INDEX.closing).toBe(5);
    expect(JOURNEY_STEP_INDEX.closed).toBe(5);
  });

  it("maps withdrawn → 0 (no step)", () => {
    expect(JOURNEY_STEP_INDEX.withdrawn).toBe(0);
  });
});

describe("JOURNEY_STEP_LABEL", () => {
  it("exposes a label for each step index 0..5", () => {
    expect(JOURNEY_STEP_LABEL[0]).toBe("");
    expect(JOURNEY_STEP_LABEL[1]).toBe("Details");
    expect(JOURNEY_STEP_LABEL[2]).toBe("Price");
    expect(JOURNEY_STEP_LABEL[3]).toBe("Disclosures");
    expect(JOURNEY_STEP_LABEL[4]).toBe("Offer");
    expect(JOURNEY_STEP_LABEL[5]).toBe("Closing");
  });

  it("uses 5 as the canonical total steps", () => {
    expect(JOURNEY_TOTAL_STEPS).toBe(5);
  });
});

describe("journeyStepAriaLabel", () => {
  it("builds the canonical aria-label", () => {
    expect(journeyStepAriaLabel(2, 40)).toBe(
      "Step 2 of 5: Price, 40% complete",
    );
  });

  it("builds the label for every step", () => {
    expect(journeyStepAriaLabel(1, 0)).toBe(
      "Step 1 of 5: Details, 0% complete",
    );
    expect(journeyStepAriaLabel(3, 50)).toBe(
      "Step 3 of 5: Disclosures, 50% complete",
    );
    expect(journeyStepAriaLabel(4, 75)).toBe(
      "Step 4 of 5: Offer, 75% complete",
    );
    expect(journeyStepAriaLabel(5, 100)).toBe(
      "Step 5 of 5: Closing, 100% complete",
    );
  });

  it("rounds the percentage to the nearest integer", () => {
    expect(journeyStepAriaLabel(2, 40.4)).toBe(
      "Step 2 of 5: Price, 40% complete",
    );
    expect(journeyStepAriaLabel(2, 40.6)).toBe(
      "Step 2 of 5: Price, 41% complete",
    );
  });
});
