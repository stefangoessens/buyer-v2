/** Valid tour status transitions */
export const TOUR_TRANSITIONS: Record<string, string[]> = {
  requested: ["confirmed", "canceled"],
  confirmed: ["completed", "canceled", "no_show"],
  completed: [],
  canceled: [],
  no_show: [],
};

/** Check if a tour status transition is valid */
export function isValidTourTransition(from: string, to: string): boolean {
  return TOUR_TRANSITIONS[from]?.includes(to) ?? false;
}
