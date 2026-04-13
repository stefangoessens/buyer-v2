/**
 * Shared launch event contract catalog (KIN-884).
 *
 * This module is the source of truth for launch-critical analytics events:
 * the typed event map, the runtime contract, the validator, and the
 * transport-agnostic emit helpers all live here so web, backend, extension,
 * and downstream codegen/serialization flows read one catalog.
 */

// MARK: - Shared literals

export const LINK_PASTED_SOURCES = [
  "hero",
  "compact",
  "home",
  "blog",
  "city",
  "community",
  "newconstruction",
  "extension",
  "share_import",
] as const;

export type LinkPastedSource = (typeof LINK_PASTED_SOURCES)[number];

export const DEAL_ROOM_ACCESS_LEVELS = [
  "anonymous",
  "registered",
  "full",
] as const;

export type DealRoomAccessLevel =
  (typeof DEAL_ROOM_ACCESS_LEVELS)[number];

export const MESSAGE_CHANNELS = [
  "email",
  "sms",
  "push",
  "in_app",
] as const;

export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

// MARK: - Typed event map

/**
 * Compile-time shapes for launch-critical events only. The broader web
 * analytics catalog extends this interface rather than re-declaring these
 * properties inline.
 */
export interface LaunchEventMap {
  link_pasted: {
    url: string;
    source: LinkPastedSource;
  };
  teaser_viewed: {
    propertyId?: string;
    source?: string;
  };
  registration_started: {
    source: string;
  };
  registration_completed: {
    userId: string;
    source?: string;
  };
  deal_room_entered: {
    dealRoomId: string;
    propertyId: string;
    accessLevel: DealRoomAccessLevel;
  };
  pricing_panel_viewed: {
    dealRoomId: string;
    propertyId: string;
    overallConfidence: number;
  };
  tour_requested: {
    dealRoomId: string;
    propertyId: string;
    requestedWindow: string;
  };
  tour_confirmed: {
    tourId: string;
    agentId: string;
    scheduledAt: string;
  };
  tour_completed: {
    tourId: string;
    dealRoomId: string;
  };
  offer_submitted: {
    offerId: string;
    dealRoomId: string;
    offerPrice: number;
  };
  offer_accepted: {
    offerId: string;
    dealRoomId: string;
    finalPrice: number;
  };
  contract_signed: {
    contractId: string;
    dealRoomId: string;
  };
  deal_closed: {
    dealRoomId: string;
    contractId: string;
    closingDate: string;
  };
  message_sent: {
    channel: MessageChannel;
    templateKey: string;
  };
}

export type LaunchEventName = keyof LaunchEventMap;

export type LaunchEventProps<K extends LaunchEventName> = LaunchEventMap[K];

export type LaunchEventCategory =
  | "public_site"
  | "deal_room"
  | "tour"
  | "offer"
  | "closing"
  | "communication";

// MARK: - Property schema

export type LaunchEventPropType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "enum";

export interface LaunchEventPropSpec {
  type: LaunchEventPropType;
  required: boolean;
  description: string;
  enumValues?: readonly string[];
  min?: number;
  max?: number;
}

// MARK: - Contract schema

export interface LaunchEventDefinition<Name extends string = string> {
  name: Name;
  category: LaunchEventCategory;
  description: string;
  owner: string;
  introducedIn: string;
  props: Record<string, LaunchEventPropSpec>;
}

export interface LaunchEventContract<EventName extends string = string> {
  version: string;
  lastUpdated: string;
  events: Record<EventName, LaunchEventDefinition<EventName>>;
}

export type CanonicalLaunchEventContract = LaunchEventContract<LaunchEventName>;

export interface LaunchEventContractRelease {
  version: string;
  releasedOn: string;
  summary: string;
  changes: readonly string[];
}

export interface LaunchEventEnvelope<Name extends string = LaunchEventName> {
  name: Name;
  properties: Record<string, unknown>;
  contractVersion: string;
}

export const CURRENT_LAUNCH_EVENT_CONTRACT_VERSION = "1.1.0" as const;
export const CURRENT_LAUNCH_EVENT_CONTRACT_DATE = "2026-04-12" as const;

export const LAUNCH_EVENT_CONTRACT_CHANGELOG = [
  {
    version: "1.0.0",
    releasedOn: "2026-04-12",
    summary: "Initial launch analytics contract.",
    changes: [
      "Introduced the launch-critical public-site, deal-room, tour, offer, close, and communication events.",
      "Added runtime validation for required properties, enum values, and numeric bounds.",
    ],
  },
  {
    version: CURRENT_LAUNCH_EVENT_CONTRACT_VERSION,
    releasedOn: CURRENT_LAUNCH_EVENT_CONTRACT_DATE,
    summary: "Moved the launch catalog into @buyer-v2/shared and aligned the typed web event map.",
    changes: [
      "Promoted the launch event catalog, validator, and emit helpers into the shared package.",
      "Added contract serialization and versioned changelog metadata for downstream review/codegen consumers.",
      "Expanded link_pasted source values to cover live web, extension, and share-import entrypoints.",
      "Loosened teaser_viewed.propertyId to optional so the runtime contract matches the existing typed analytics surface.",
    ],
  },
] as const satisfies readonly LaunchEventContractRelease[];

// MARK: - Canonical contract

export const LAUNCH_EVENT_CONTRACT = {
  version: CURRENT_LAUNCH_EVENT_CONTRACT_VERSION,
  lastUpdated: CURRENT_LAUNCH_EVENT_CONTRACT_DATE,
  events: {
    link_pasted: {
      name: "link_pasted",
      category: "public_site",
      description: "Buyer pastes a property URL into the intake form.",
      owner: "growth",
      introducedIn: "1.0.0",
      props: {
        url: {
          type: "string",
          required: true,
          description: "Raw pasted URL.",
        },
        source: {
          type: "enum",
          required: true,
          description: "Which inbound surface the pasted listing came from.",
          enumValues: LINK_PASTED_SOURCES,
        },
      },
    },
    teaser_viewed: {
      name: "teaser_viewed",
      category: "public_site",
      description: "Teaser page renders before the registration gate.",
      owner: "growth",
      introducedIn: "1.0.0",
      props: {
        propertyId: {
          type: "string",
          required: false,
          description: "Property id surfaced in the teaser, when available.",
        },
        source: {
          type: "string",
          required: false,
          description: "Optional referrer tag.",
        },
      },
    },
    registration_started: {
      name: "registration_started",
      category: "public_site",
      description: "Registration modal opens in response to a gated surface.",
      owner: "growth",
      introducedIn: "1.0.0",
      props: {
        source: {
          type: "string",
          required: true,
          description: "Which surface triggered the gate.",
        },
      },
    },
    registration_completed: {
      name: "registration_completed",
      category: "public_site",
      description: "Registration form submission succeeds.",
      owner: "growth",
      introducedIn: "1.0.0",
      props: {
        userId: {
          type: "string",
          required: true,
          description: "Convex user id of the new account.",
        },
        source: {
          type: "string",
          required: false,
          description: "Origin surface.",
        },
      },
    },
    deal_room_entered: {
      name: "deal_room_entered",
      category: "deal_room",
      description: "Buyer enters a deal room after the access gate.",
      owner: "dashboard",
      introducedIn: "1.0.0",
      props: {
        dealRoomId: {
          type: "string",
          required: true,
          description: "Convex deal room id.",
        },
        propertyId: {
          type: "string",
          required: true,
          description: "Convex property id.",
        },
        accessLevel: {
          type: "enum",
          required: true,
          description: "Access level resolved for the session.",
          enumValues: DEAL_ROOM_ACCESS_LEVELS,
        },
      },
    },
    pricing_panel_viewed: {
      name: "pricing_panel_viewed",
      category: "deal_room",
      description: "Pricing panel first paint with a real engine result.",
      owner: "ai",
      introducedIn: "1.0.0",
      props: {
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        propertyId: {
          type: "string",
          required: true,
          description: "Property id.",
        },
        overallConfidence: {
          type: "number",
          required: true,
          description: "Engine confidence 0..1.",
          min: 0,
          max: 1,
        },
      },
    },
    tour_requested: {
      name: "tour_requested",
      category: "tour",
      description: "Buyer submits a tour request from the deal room.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        propertyId: {
          type: "string",
          required: true,
          description: "Property id.",
        },
        requestedWindow: {
          type: "string",
          required: true,
          description: "ISO-8601 time window string (free-form for now).",
        },
      },
    },
    tour_confirmed: {
      name: "tour_confirmed",
      category: "tour",
      description: "Showing agent confirms the tour slot.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        tourId: {
          type: "string",
          required: true,
          description: "Tour id.",
        },
        agentId: {
          type: "string",
          required: true,
          description: "Showing agent id.",
        },
        scheduledAt: {
          type: "string",
          required: true,
          description: "ISO-8601 start timestamp.",
        },
      },
    },
    tour_completed: {
      name: "tour_completed",
      category: "tour",
      description: "Tour marked completed after it happens.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        tourId: {
          type: "string",
          required: true,
          description: "Tour id.",
        },
        dealRoomId: {
          type: "string",
          required: true,
          description: "Parent deal room id.",
        },
      },
    },
    offer_submitted: {
      name: "offer_submitted",
      category: "offer",
      description: "Offer mutation succeeds and the offer goes to seller.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        offerId: {
          type: "string",
          required: true,
          description: "Offer id.",
        },
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        offerPrice: {
          type: "integer",
          required: true,
          description: "Offer price in whole dollars.",
          min: 0,
        },
      },
    },
    offer_accepted: {
      name: "offer_accepted",
      category: "offer",
      description: "Offer marked accepted by the listing side.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        offerId: {
          type: "string",
          required: true,
          description: "Offer id.",
        },
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        finalPrice: {
          type: "integer",
          required: true,
          description: "Accepted price in whole dollars.",
          min: 0,
        },
      },
    },
    contract_signed: {
      name: "contract_signed",
      category: "closing",
      description: "Purchase contract fully executed by all parties.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        contractId: {
          type: "string",
          required: true,
          description: "Contract id.",
        },
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
      },
    },
    deal_closed: {
      name: "deal_closed",
      category: "closing",
      description: "Deal reaches the terminal closed state.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        contractId: {
          type: "string",
          required: true,
          description: "Contract id.",
        },
        closingDate: {
          type: "string",
          required: true,
          description: "ISO-8601 closing date.",
        },
      },
    },
    message_sent: {
      name: "message_sent",
      category: "communication",
      description: "Outbound message is queued for delivery.",
      owner: "platform",
      introducedIn: "1.0.0",
      props: {
        channel: {
          type: "enum",
          required: true,
          description: "Delivery channel.",
          enumValues: MESSAGE_CHANNELS,
        },
        templateKey: {
          type: "string",
          required: true,
          description: "Template id (matches communication template catalog).",
        },
      },
    },
  },
} satisfies CanonicalLaunchEventContract;

export const LAUNCH_EVENT_NAMES: ReadonlySet<LaunchEventName> = new Set(
  Object.keys(LAUNCH_EVENT_CONTRACT.events) as LaunchEventName[]
);

export function isLaunchEventName(name: string): name is LaunchEventName {
  return LAUNCH_EVENT_NAMES.has(name as LaunchEventName);
}

export function serializeLaunchEventContract(
  contract: LaunchEventContract = LAUNCH_EVENT_CONTRACT
): string {
  return JSON.stringify(contract, null, 2);
}

// MARK: - Validation

export type LaunchEventValidationError =
  | { kind: "unknownEvent"; name: string }
  | { kind: "missingRequiredProp"; event: string; prop: string }
  | { kind: "undeclaredProp"; event: string; prop: string }
  | {
      kind: "wrongType";
      event: string;
      prop: string;
      expected: LaunchEventPropType;
      actual: string;
    }
  | {
      kind: "notANumber";
      event: string;
      prop: string;
    }
  | {
      kind: "outOfRange";
      event: string;
      prop: string;
      value: number;
      min?: number;
      max?: number;
    }
  | {
      kind: "invalidEnumValue";
      event: string;
      prop: string;
      value: string;
      allowed: readonly string[];
    }
  | {
      kind: "integerExpected";
      event: string;
      prop: string;
      value: number;
    };

export type LaunchEventValidation =
  | { ok: true }
  | { ok: false; errors: LaunchEventValidationError[] };

export function validateLaunchEvent(
  name: string,
  properties: Record<string, unknown>,
  contract: LaunchEventContract = LAUNCH_EVENT_CONTRACT
): LaunchEventValidation {
  const definition = contract.events[name];
  if (!definition) {
    return { ok: false, errors: [{ kind: "unknownEvent", name }] };
  }

  const errors: LaunchEventValidationError[] = [];
  const declaredPropNames = new Set(Object.keys(definition.props));

  for (const propName of Object.keys(properties)) {
    if (!declaredPropNames.has(propName) && properties[propName] !== undefined) {
      errors.push({ kind: "undeclaredProp", event: name, prop: propName });
    }
  }

  for (const [propName, spec] of Object.entries(definition.props)) {
    const value = properties[propName];
    if (value === undefined || value === null) {
      if (spec.required) {
        errors.push({
          kind: "missingRequiredProp",
          event: name,
          prop: propName,
        });
      }
      continue;
    }

    const typeError = checkType(name, propName, spec, value);
    if (typeError) {
      errors.push(typeError);
      continue;
    }

    if (
      (spec.type === "number" || spec.type === "integer") &&
      typeof value === "number" &&
      Number.isNaN(value)
    ) {
      errors.push({ kind: "notANumber", event: name, prop: propName });
      continue;
    }

    const numericError = checkNumericConstraints(
      name,
      propName,
      spec,
      value
    );
    if (numericError) {
      errors.push(numericError);
    }

    const enumError = checkEnumConstraint(name, propName, spec, value);
    if (enumError) {
      errors.push(enumError);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function checkType(
  event: string,
  prop: string,
  spec: LaunchEventPropSpec,
  value: unknown
): LaunchEventValidationError | null {
  const actual = runtimeTypeOf(value);
  const wantsNumber = spec.type === "number" || spec.type === "integer";

  if (wantsNumber) {
    if (actual !== "number") {
      return {
        kind: "wrongType",
        event,
        prop,
        expected: spec.type,
        actual,
      };
    }
    return null;
  }

  if (spec.type === "enum") {
    if (actual !== "string") {
      return {
        kind: "wrongType",
        event,
        prop,
        expected: "enum",
        actual,
      };
    }
    return null;
  }

  if (spec.type === "string" && actual !== "string") {
    return {
      kind: "wrongType",
      event,
      prop,
      expected: "string",
      actual,
    };
  }

  if (spec.type === "boolean" && actual !== "boolean") {
    return {
      kind: "wrongType",
      event,
      prop,
      expected: "boolean",
      actual,
    };
  }

  return null;
}

function checkNumericConstraints(
  event: string,
  prop: string,
  spec: LaunchEventPropSpec,
  value: unknown
): LaunchEventValidationError | null {
  if (spec.type !== "number" && spec.type !== "integer") {
    return null;
  }
  if (typeof value !== "number") {
    return null;
  }

  if (spec.type === "integer" && !Number.isInteger(value)) {
    return {
      kind: "integerExpected",
      event,
      prop,
      value,
    };
  }

  if (
    (spec.min !== undefined && value < spec.min) ||
    (spec.max !== undefined && value > spec.max)
  ) {
    return {
      kind: "outOfRange",
      event,
      prop,
      value,
      min: spec.min,
      max: spec.max,
    };
  }

  return null;
}

function checkEnumConstraint(
  event: string,
  prop: string,
  spec: LaunchEventPropSpec,
  value: unknown
): LaunchEventValidationError | null {
  if (spec.type !== "enum") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const allowed = spec.enumValues ?? [];
  if (allowed.length === 0 || !allowed.includes(value)) {
    return {
      kind: "invalidEnumValue",
      event,
      prop,
      value,
      allowed,
    };
  }

  return null;
}

function runtimeTypeOf(
  value: unknown
): "string" | "number" | "boolean" | "null" | "array" | "object" | "undefined" {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }

  const type = typeof value;
  if (
    type === "string" ||
    type === "number" ||
    type === "boolean" ||
    type === "undefined"
  ) {
    return type;
  }
  return "object";
}

// MARK: - Emit helpers

export interface LaunchEventTransport {
  dispatch(name: string, properties: Record<string, unknown>): void;
  onInvalid?(name: string, errors: readonly LaunchEventValidationError[]): void;
}

export function shouldThrowOnInvalid(): boolean {
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

export class LaunchEventValidationFailure extends Error {
  constructor(
    public readonly event: string,
    public readonly errors: readonly LaunchEventValidationError[]
  ) {
    super(
      `Invalid launch event "${event}": ${errors
        .map((error) => describeError(error))
        .join(" · ")}`
    );
    this.name = "LaunchEventValidationFailure";
  }
}

export function createLaunchEventEnvelope<K extends LaunchEventName>(
  name: K,
  properties: LaunchEventMap[K],
  options?: {
    contract?: CanonicalLaunchEventContract;
  }
): LaunchEventEnvelope<K>;
export function createLaunchEventEnvelope(
  name: string,
  properties: Record<string, unknown>,
  options?: {
    contract?: LaunchEventContract;
  }
): LaunchEventEnvelope<string>;
export function createLaunchEventEnvelope(
  name: string,
  properties: Record<string, unknown>,
  options: {
    contract?: LaunchEventContract;
  } = {}
): LaunchEventEnvelope<string> {
  const contract = options.contract ?? LAUNCH_EVENT_CONTRACT;
  return {
    name,
    properties,
    contractVersion: contract.version,
  };
}

export function emitLaunchEvent<K extends LaunchEventName>(
  transport: LaunchEventTransport,
  name: K,
  properties: LaunchEventMap[K],
  options?: {
    contract?: CanonicalLaunchEventContract;
    throwOnInvalid?: boolean;
  }
): void;
export function emitLaunchEvent(
  transport: LaunchEventTransport,
  name: string,
  properties: Record<string, unknown>,
  options?: {
    contract?: LaunchEventContract;
    throwOnInvalid?: boolean;
  }
): void;
export function emitLaunchEvent(
  transport: LaunchEventTransport,
  name: string,
  properties: Record<string, unknown>,
  options: {
    contract?: LaunchEventContract;
    throwOnInvalid?: boolean;
  } = {}
): void {
  const contract = options.contract ?? LAUNCH_EVENT_CONTRACT;
  const throws = options.throwOnInvalid ?? shouldThrowOnInvalid();
  const result = validateLaunchEvent(name, properties, contract);

  if (!result.ok) {
    if (throws) {
      throw new LaunchEventValidationFailure(name, result.errors);
    }
    transport.onInvalid?.(name, result.errors);
    return;
  }

  transport.dispatch(name, properties);
}

export function createLaunchEventEmitter(
  transport: LaunchEventTransport,
  options: {
    contract?: CanonicalLaunchEventContract;
    throwOnInvalid?: boolean;
  } = {}
) {
  return function emit<K extends LaunchEventName>(
    name: K,
    properties: LaunchEventMap[K]
  ): void {
    emitLaunchEvent(transport, name, properties, options);
  };
}

export function describeError(error: LaunchEventValidationError): string {
  switch (error.kind) {
    case "unknownEvent":
      return `unknown event "${error.name}"`;
    case "missingRequiredProp":
      return `missing required prop "${error.prop}"`;
    case "undeclaredProp":
      return `undeclared prop "${error.prop}" not in contract`;
    case "wrongType":
      return `"${error.prop}" expected ${error.expected}, got ${error.actual}`;
    case "notANumber":
      return `"${error.prop}" is NaN (not a valid number)`;
    case "outOfRange": {
      const bounds =
        error.min !== undefined && error.max !== undefined
          ? `${error.min}..${error.max}`
          : error.min !== undefined
            ? `>= ${error.min}`
            : `<= ${error.max}`;
      return `"${error.prop}" value ${error.value} out of range (${bounds})`;
    }
    case "invalidEnumValue":
      return `"${error.prop}" value "${error.value}" not in [${error.allowed.join(", ")}]`;
    case "integerExpected":
      return `"${error.prop}" value ${error.value} must be an integer`;
    default: {
      const exhaustive: never = error;
      return String(exhaustive);
    }
  }
}
