import { describe, it, expect } from "vitest";
import {
  validateTourRequestInput,
  canTransition,
  attemptTransition,
  isTerminal,
  TOUR_REQUEST_STATES,
  TOUR_REQUEST_ERROR_CODES,
  type TourRequestInput,
} from "@/lib/tours/requestValidation";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function validInput(
  overrides: Partial<TourRequestInput> = {},
): TourRequestInput {
  return {
    dealRoomId: "dr_1",
    propertyId: "prop_1",
    preferredWindows: [
      { start: futureIso(24), end: futureIso(25) },
      { start: futureIso(48), end: futureIso(49) },
    ],
    attendeeCount: 2,
    buyerNotes: "Prefer afternoon",
    agreementStateSnapshot: {
      type: "tour_pass",
      status: "signed",
      signedAt: "2028-01-15T12:00:00Z",
    },
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Success path
// ───────────────────────────────────────────────────────────────────────────

describe("validateTourRequestInput — success path", () => {
  it("accepts a fully valid input with tour_pass signed", () => {
    const result = validateTourRequestInput(validInput(), new Date().toISOString());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitized.attendeeCount).toBe(2);
      expect(result.sanitized.preferredWindows).toHaveLength(2);
    }
  });

  it("accepts full_representation as a valid agreement type", () => {
    const result = validateTourRequestInput(
      validInput({
        agreementStateSnapshot: {
          type: "full_representation",
          status: "signed",
          signedAt: "2028-01-15T12:00:00Z",
        },
      }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(true);
  });

  it("sanitizes buyer notes (trims + truncates)", () => {
    const longNotes = "x".repeat(3000);
    const result = validateTourRequestInput(
      validInput({ buyerNotes: `  ${longNotes}  ` }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitized.buyerNotes?.length).toBe(2000);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Missing agreement
// ───────────────────────────────────────────────────────────────────────────

describe("validateTourRequestInput — missing tour pass", () => {
  it("rejects when agreement type is 'none'", () => {
    const result = validateTourRequestInput(
      validInput({
        agreementStateSnapshot: { type: "none", status: "none" },
      }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_tour_pass");
  });

  it("rejects when tour_pass is drafted but not signed", () => {
    const result = validateTourRequestInput(
      validInput({
        agreementStateSnapshot: { type: "tour_pass", status: "draft" },
      }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_tour_pass");
  });

  it("rejects when agreement is canceled", () => {
    const result = validateTourRequestInput(
      validInput({
        agreementStateSnapshot: { type: "tour_pass", status: "canceled" },
      }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_tour_pass");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Attendee count
// ───────────────────────────────────────────────────────────────────────────

describe("validateTourRequestInput — attendee count", () => {
  it("rejects zero attendees", () => {
    const result = validateTourRequestInput(
      validInput({ attendeeCount: 0 }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_attendee_count");
  });

  it("rejects fractional attendees", () => {
    const result = validateTourRequestInput(
      validInput({ attendeeCount: 2.5 }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects too many attendees", () => {
    const result = validateTourRequestInput(
      validInput({ attendeeCount: 15 }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_attendee_count");
  });

  it("accepts 1 attendee", () => {
    const result = validateTourRequestInput(
      validInput({ attendeeCount: 1 }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts 10 attendees (upper bound)", () => {
    const result = validateTourRequestInput(
      validInput({ attendeeCount: 10 }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Date windows
// ───────────────────────────────────────────────────────────────────────────

describe("validateTourRequestInput — date windows", () => {
  it("rejects empty windows array", () => {
    const result = validateTourRequestInput(
      validInput({ preferredWindows: [] }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_date_window");
  });

  it("rejects more than 5 windows", () => {
    const windows = Array.from({ length: 6 }, (_, i) => ({
      start: futureIso(24 + i),
      end: futureIso(25 + i),
    }));
    const result = validateTourRequestInput(
      validInput({ preferredWindows: windows }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_date_window");
  });

  it("rejects a window where end <= start", () => {
    const result = validateTourRequestInput(
      validInput({
        preferredWindows: [{ start: futureIso(25), end: futureIso(24) }],
      }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_date_window");
  });

  it("rejects a window starting in the past", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = validateTourRequestInput(
      validInput({
        preferredWindows: [{ start: past, end: futureIso(1) }],
      }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_date_window");
  });

  it("rejects unparseable window dates", () => {
    const result = validateTourRequestInput(
      validInput({
        preferredWindows: [{ start: "not-a-date", end: "also-not-a-date" }],
      }),
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_date_window");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// State machine
// ───────────────────────────────────────────────────────────────────────────

describe("canTransition", () => {
  it("allows draft → submitted", () => {
    expect(canTransition("draft", "submitted")).toBe(true);
  });

  it("allows draft → canceled", () => {
    expect(canTransition("draft", "canceled")).toBe(true);
  });

  it("allows submitted → blocked", () => {
    expect(canTransition("submitted", "blocked")).toBe(true);
  });

  it("allows submitted → assigned", () => {
    expect(canTransition("submitted", "assigned")).toBe(true);
  });

  it("allows blocked → submitted (unblock)", () => {
    expect(canTransition("blocked", "submitted")).toBe(true);
  });

  it("allows assigned → confirmed", () => {
    expect(canTransition("assigned", "confirmed")).toBe(true);
  });

  it("allows confirmed → completed", () => {
    expect(canTransition("confirmed", "completed")).toBe(true);
  });

  it("rejects draft → confirmed (must go through submit/assign)", () => {
    expect(canTransition("draft", "confirmed")).toBe(false);
  });

  it("rejects completed → anything (terminal state)", () => {
    expect(canTransition("completed", "submitted")).toBe(false);
    expect(canTransition("completed", "canceled")).toBe(false);
    expect(canTransition("completed", "failed")).toBe(false);
  });

  it("rejects canceled → anything (terminal state)", () => {
    expect(canTransition("canceled", "submitted")).toBe(false);
    expect(canTransition("canceled", "failed")).toBe(false);
  });

  it("rejects failed → anything (terminal state)", () => {
    expect(canTransition("failed", "submitted")).toBe(false);
  });
});

describe("attemptTransition", () => {
  it("returns ok=true with next state for legal transitions", () => {
    const result = attemptTransition("submitted", "assigned");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next).toBe("assigned");
  });

  it("returns structured error for illegal transitions", () => {
    const result = attemptTransition("completed", "submitted");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("illegal_transition");
      expect(result.message).toContain("completed");
      expect(result.message).toContain("submitted");
    }
  });
});

describe("isTerminal", () => {
  it("recognizes terminal states", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("canceled")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
  });

  it("recognizes non-terminal states", () => {
    expect(isTerminal("draft")).toBe(false);
    expect(isTerminal("submitted")).toBe(false);
    expect(isTerminal("blocked")).toBe(false);
    expect(isTerminal("assigned")).toBe(false);
    expect(isTerminal("confirmed")).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("TOUR_REQUEST_STATES has 8 entries", () => {
    expect(TOUR_REQUEST_STATES).toHaveLength(8);
  });

  it("TOUR_REQUEST_ERROR_CODES contains common codes", () => {
    expect(TOUR_REQUEST_ERROR_CODES).toContain("missing_tour_pass");
    expect(TOUR_REQUEST_ERROR_CODES).toContain("duplicate_request");
    expect(TOUR_REQUEST_ERROR_CODES).toContain("invalid_date_window");
    expect(TOUR_REQUEST_ERROR_CODES).toContain("invalid_attendee_count");
  });
});
