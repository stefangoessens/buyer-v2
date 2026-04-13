import { describe, expect, it } from "vitest";

import {
  applyAvailabilityWindowPatch,
  buildAvailabilityWindowState,
  hasSchedulingConstraints,
} from "@/lib/scheduling/availability";

describe("scheduling/availability", () => {
  it("builds requested + normalized state with explicit timezone handling", () => {
    const result = buildAvailabilityWindowState(
      {
        startAt: "2026-05-01T14:00:00-04:00",
        endAt: "2026-05-01T15:30:00-04:00",
        timezone: "America/New_York",
      },
      {
        minimumNoticeMinutes: 120,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 30,
      },
    );

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.state.requestedWindow).toEqual({
        startAt: "2026-05-01T14:00:00-04:00",
        endAt: "2026-05-01T15:30:00-04:00",
        timezone: "America/New_York",
      });
      expect(result.state.normalizedWindow).toEqual({
        startUtc: "2026-05-01T18:00:00.000Z",
        endUtc: "2026-05-01T19:30:00.000Z",
        durationMs: 90 * 60 * 1000,
      });
      expect(result.state.constraints).toEqual({
        minimumNoticeMinutes: 120,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 30,
      });
      expect(hasSchedulingConstraints(result.state)).toBe(true);
    }
  });

  it("recomputes normalized state on update and preserves untouched constraints", () => {
    const initial = buildAvailabilityWindowState(
      {
        startAt: "2026-05-01T14:00:00-04:00",
        endAt: "2026-05-01T15:00:00-04:00",
        timezone: "America/New_York",
      },
      {
        minimumNoticeMinutes: 60,
        maximumDurationMinutes: 120,
      },
    );

    expect(initial.valid).toBe(true);
    if (!initial.valid) return;

    const updated = applyAvailabilityWindowPatch(initial.state, {
      startAt: "2026-05-02T09:00:00-07:00",
      endAt: "2026-05-02T10:30:00-07:00",
      timezone: "America/Los_Angeles",
    });

    expect(updated.valid).toBe(true);
    if (updated.valid) {
      expect(updated.state.requestedWindow).toEqual({
        startAt: "2026-05-02T09:00:00-07:00",
        endAt: "2026-05-02T10:30:00-07:00",
        timezone: "America/Los_Angeles",
      });
      expect(updated.state.normalizedWindow).toEqual({
        startUtc: "2026-05-02T16:00:00.000Z",
        endUtc: "2026-05-02T17:30:00.000Z",
        durationMs: 90 * 60 * 1000,
      });
      expect(updated.state.constraints).toEqual({
        minimumNoticeMinutes: 60,
        maximumDurationMinutes: 120,
      });
    }
  });

  it("rejects invalid window updates", () => {
    const initial = buildAvailabilityWindowState({
      startAt: "2026-05-01T14:00:00Z",
      endAt: "2026-05-01T15:00:00Z",
      timezone: "UTC",
    });

    expect(initial.valid).toBe(true);
    if (!initial.valid) return;

    const updated = applyAvailabilityWindowPatch(initial.state, {
      endAt: "2026-05-01T13:00:00Z",
    });

    expect(updated.valid).toBe(false);
    if (!updated.valid) {
      expect(updated.errors.some((error) => error.code === "invalid_window")).toBe(
        true,
      );
    }
  });

  it("rejects invalid scheduling constraints", () => {
    const result = buildAvailabilityWindowState(
      {
        startAt: "2026-05-01T14:00:00Z",
        endAt: "2026-05-01T16:00:00Z",
        timezone: "UTC",
      },
      {
        maximumDurationMinutes: 30,
      },
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((error) => error.code === "invalid_constraint"),
      ).toBe(true);
    }
  });

  it("treats omitted or empty constraints as absent state", () => {
    const result = buildAvailabilityWindowState({
      startAt: "2026-05-01T14:00:00Z",
      endAt: "2026-05-01T15:00:00Z",
      timezone: "UTC",
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.state.constraints).toBeUndefined();
      expect(hasSchedulingConstraints(result.state)).toBe(false);
    }

    const withEmptyConstraints = buildAvailabilityWindowState(
      {
        startAt: "2026-05-01T14:00:00Z",
        endAt: "2026-05-01T15:00:00Z",
        timezone: "UTC",
      },
      {},
    );

    expect(withEmptyConstraints.valid).toBe(true);
    if (withEmptyConstraints.valid) {
      expect(withEmptyConstraints.state.constraints).toBeUndefined();
      expect(hasSchedulingConstraints(withEmptyConstraints.state)).toBe(false);
    }
  });
});
