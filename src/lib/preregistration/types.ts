/**
 * Typed model for weekend visitor pre-registration (KIN-824).
 *
 * This flow is intentionally distinct from the private-tour request
 * workflow (session 1 / KIN-802). A visitor pre-registration is the
 * lightest-weight intent signal we collect — someone fills out a form
 * to say "I plan to attend the open house for this property on
 * Saturday at 2pm". It does NOT create a buyer representation
 * agreement, does NOT dispatch a showing agent, and does NOT enter
 * the full tour state machine. It's explicitly a top-of-funnel
 * capture that can OPTIONALLY transition into a deeper representation
 * state (buyer agreement → full tour request → deal room) later.
 *
 * Keep this module narrow and the flow separate.
 */

// MARK: - Registration state

/**
 * Discriminated lifecycle for a visitor pre-registration.
 *
 * - `.created` — initial state after the form is submitted
 * - `.reminded` — reminder notification has been sent
 * - `.attended` — ops marked the visitor as attended at the event
 * - `.noShow` — ops marked as no-show after the event
 * - `.converted` — the visitor transitioned into deeper representation
 *                  (signed a buyer agreement, requested a full tour,
 *                  or entered a deal room). This is the ONLY terminal
 *                  state with a follow-on link; every other state is
 *                  end-of-funnel for this flow.
 * - `.canceled` — the visitor canceled the pre-registration
 */
export type PreregistrationStatus =
  | "created"
  | "reminded"
  | "attended"
  | "noShow"
  | "converted"
  | "canceled";

/**
 * What kind of follow-on state the registration transitioned into.
 * Used by `.converted` records to record the concrete next step.
 */
export type ConversionKind =
  | "buyer_agreement_signed"
  | "private_tour_requested"
  | "deal_room_created";

// MARK: - Records

/**
 * Minimal typed visitor registration. Captures only what we need to
 * send a reminder and mark attendance — no buyer-representation
 * fields, no PII beyond email/name/phone. Everything else (tour
 * logistics, agent dispatch) lives in the tour flow.
 */
export interface VisitorPreregistration {
  id: string;
  propertyId: string;
  /** ISO-8601 event start timestamp. */
  eventStartAt: string;
  /** ISO-8601 event end timestamp. */
  eventEndAt: string;

  // Visitor contact — the MINIMUM needed to confirm and send reminders
  visitorName: string;
  visitorEmail: string;
  visitorPhone?: string;

  /** Number of adults attending including the registrant. */
  partySize: number;

  /** Optional note from the visitor (parking, accessibility, etc.). */
  visitorNote?: string;

  status: PreregistrationStatus;

  /** Set when `status === "converted"`. */
  conversion?: {
    kind: ConversionKind;
    /** Opaque reference to the follow-on record (agreementId, tourId, dealRoomId). */
    targetRefId: string;
    convertedAt: string;
  };

  createdAt: string;
  updatedAt: string;
}

// MARK: - Form input

/**
 * The shape of a freshly-submitted registration form. The pure
 * validator normalizes it (trimming whitespace, lowercasing email)
 * before handing it to the Convex mutation layer.
 */
export interface PreregistrationFormInput {
  propertyId: string;
  eventStartAt: string;
  eventEndAt: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone?: string;
  partySize: number;
  visitorNote?: string;
}

// MARK: - Validation

export type PreregistrationValidation =
  | { ok: true; normalized: PreregistrationFormInput }
  | { ok: false; errors: PreregistrationValidationError[] };

export type PreregistrationValidationError =
  | { kind: "missingField"; field: keyof PreregistrationFormInput }
  | { kind: "invalidEmail"; field: "visitorEmail"; value: string }
  | { kind: "invalidPartySize"; min: number; max: number; actual: number }
  | { kind: "invalidEventWindow"; message: string };

// MARK: - Dedupe decision

/**
 * Decision returned by `resolveDuplicate` when an incoming form
 * input matches an existing preregistration for the same property +
 * event window + visitor email.
 *
 * - `.newRegistration` — no match; caller inserts a fresh record
 * - `.updateExisting` — a prior `created` or `reminded` record for
 *                       the same trio exists; caller patches it with
 *                       the new party size / note / phone rather
 *                       than creating a duplicate
 * - `.blockedByConversion` — visitor has already converted into a
 *                            deeper representation state for this
 *                            property; caller should NOT reopen the
 *                            preregistration and should redirect to
 *                            the converted flow
 */
export type DuplicateDecision =
  | { kind: "newRegistration" }
  | { kind: "updateExisting"; existingId: string }
  | { kind: "blockedByConversion"; existingId: string; conversionKind: ConversionKind };
