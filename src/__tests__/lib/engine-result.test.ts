import { describe, it, expect } from "vitest";
import {
  determineReviewState,
  confidenceLevel,
  AUTO_APPROVE_THRESHOLD,
  ENGINE_TYPES,
} from "../../../convex/lib/engineResult";

describe("determineReviewState", () => {
  it("auto-approves high confidence outputs", () => {
    expect(determineReviewState(0.95)).toBe("approved");
    expect(determineReviewState(0.8)).toBe("approved");
  });

  it("marks low confidence for review", () => {
    expect(determineReviewState(0.79)).toBe("pending");
    expect(determineReviewState(0.5)).toBe("pending");
    expect(determineReviewState(0.1)).toBe("pending");
  });

  it("marks zero confidence for review", () => {
    expect(determineReviewState(0)).toBe("pending");
  });

  it("uses the defined threshold", () => {
    expect(determineReviewState(AUTO_APPROVE_THRESHOLD)).toBe("approved");
    expect(determineReviewState(AUTO_APPROVE_THRESHOLD - 0.01)).toBe(
      "pending",
    );
  });
});

describe("confidenceLevel", () => {
  it("returns high for >= 0.8", () => {
    expect(confidenceLevel(0.9)).toBe("high");
    expect(confidenceLevel(0.8)).toBe("high");
    expect(confidenceLevel(1.0)).toBe("high");
  });

  it("returns medium for 0.5-0.79", () => {
    expect(confidenceLevel(0.5)).toBe("medium");
    expect(confidenceLevel(0.79)).toBe("medium");
  });

  it("returns low for < 0.5", () => {
    expect(confidenceLevel(0.49)).toBe("low");
    expect(confidenceLevel(0)).toBe("low");
  });
});

describe("ENGINE_TYPES", () => {
  it("contains all expected engine types", () => {
    expect(ENGINE_TYPES).toContain("pricing");
    expect(ENGINE_TYPES).toContain("comps");
    expect(ENGINE_TYPES).toContain("leverage");
    expect(ENGINE_TYPES).toContain("offer");
    expect(ENGINE_TYPES).toContain("cost");
    expect(ENGINE_TYPES).toContain("doc_parser");
    expect(ENGINE_TYPES).toContain("copilot");
    expect(ENGINE_TYPES).toContain("case_synthesis");
    expect(ENGINE_TYPES).toContain("insights");
    expect(ENGINE_TYPES.length).toBe(9);
  });
});
