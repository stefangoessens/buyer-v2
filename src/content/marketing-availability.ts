/**
 * Marketing availability data source (KIN-1088).
 *
 * Drives the Florida-only availability strip and the non-FL waitlist
 * dialog. Adding a new state here is the single-line change required
 * when we expand — do NOT hardcode copy in the UI components.
 *
 * Ordering: `availableStates` lists the states where buyer-v2 is
 * actively licensed and taking business. When empty or single-entry,
 * the strip is active. When we expand to multi-state, adjust the
 * strip template to `Available in FL, TX, CO. Not in your state?
 * Join the waitlist →`.
 */
export interface MarketingAvailability {
  availableStates: readonly ("FL" | string)[];
  strip: {
    copy: string;
    ctaLabel: string;
  };
  dialog: {
    title: string;
    description: string;
    submitLabel: string;
    /**
     * Template rendered after a successful waitlist submission.
     * `{stateName}` is replaced at render time with the full state
     * name (e.g. `Texas`). The UI component owns the substitution.
     */
    successTemplate: string;
  };
}

export const MARKETING_AVAILABILITY: MarketingAvailability = {
  availableStates: ["FL"],
  strip: {
    copy: "Available in Florida only. Not in FL?",
    ctaLabel: "Join the waitlist →",
  },
  dialog: {
    title: "Join the waitlist",
    description:
      "buyer-v2 is Florida-only today. Tell us where you're buying and we'll email you the moment we launch in your state.",
    submitLabel: "Join the waitlist",
    successTemplate:
      "You're on the list. We'll email when we launch in {stateName}.",
  },
};
