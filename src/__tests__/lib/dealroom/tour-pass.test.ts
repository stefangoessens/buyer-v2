import { describe, it, expect } from "vitest";
import { isValidTourTransition, TOUR_TRANSITIONS } from "@/lib/dealroom/tourPass";

describe("Tour Pass workflow", () => {
  it("allows requested → confirmed", () => {
    expect(isValidTourTransition("requested", "confirmed")).toBe(true);
  });

  it("allows requested → canceled", () => {
    expect(isValidTourTransition("requested", "canceled")).toBe(true);
  });

  it("blocks requested → completed", () => {
    expect(isValidTourTransition("requested", "completed")).toBe(false);
  });

  it("allows confirmed → completed", () => {
    expect(isValidTourTransition("confirmed", "completed")).toBe(true);
  });

  it("allows confirmed → no_show", () => {
    expect(isValidTourTransition("confirmed", "no_show")).toBe(true);
  });

  it("blocks completed → any", () => {
    expect(isValidTourTransition("completed", "confirmed")).toBe(false);
    expect(isValidTourTransition("completed", "canceled")).toBe(false);
  });

  it("has terminal states with no transitions", () => {
    expect(TOUR_TRANSITIONS.completed).toHaveLength(0);
    expect(TOUR_TRANSITIONS.canceled).toHaveLength(0);
    expect(TOUR_TRANSITIONS.no_show).toHaveLength(0);
  });
});
