/**
 * Transport-agnostic emitter for launch events (KIN-845).
 *
 * Web, backend, browser extension, and iOS all call `emitLaunchEvent`
 * with their own `LaunchEventTransport` adapter. The emitter:
 *
 *   1. Validates the event against `LAUNCH_EVENT_CONTRACT`.
 *   2. In dev → throws the first validation error with a clear
 *      message so the offending call site shows up in stack traces.
 *   3. In prod → logs the error list via the transport's `onInvalid`
 *      hook and drops the event (never emits malformed schemas
 *      downstream — PostHog funnels would silently break if we did).
 *   4. On success, hands the typed payload to the transport's
 *      `dispatch` hook.
 *
 * The web transport is a thin wrapper around PostHog's `capture`.
 * The backend transport batches into Convex. The extension
 * transport posts to a bridge. The iOS transport serializes to
 * the Swift client. Each transport is owned by its platform, but
 * all of them route through this one validator.
 */

import { LAUNCH_EVENT_CONTRACT } from "./contract";
import { validateLaunchEvent } from "./validator";
import type {
  LaunchEventContract,
  LaunchEventValidationError,
} from "./types";

// MARK: - Transport interface

/**
 * Minimal interface every platform implements to receive validated
 * launch events. Stateless — `emitLaunchEvent` supplies the
 * properties already scrubbed.
 */
export interface LaunchEventTransport {
  /**
   * Called once for each successfully validated event. The
   * transport is responsible for the actual wire transport —
   * PostHog capture, Convex mutation, bridge post, etc.
   */
  dispatch(name: string, properties: Record<string, unknown>): void;
  /**
   * Called when validation fails. Transports typically log to
   * Sentry + local console. `errors` is always non-empty; the
   * event is never dispatched.
   */
  onInvalid?(name: string, errors: readonly LaunchEventValidationError[]): void;
}

// MARK: - Environment hook

/**
 * Returns true when the validator should throw on invalid events.
 * Split out as a function so tests can override it without touching
 * `process.env` state. Default: throw only in development and test.
 */
export function shouldThrowOnInvalid(): boolean {
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

// MARK: - Emit

/**
 * Error thrown when strict mode rejects an invalid event. Carries
 * the full error list so tests can assert on specific kinds.
 */
export class LaunchEventValidationFailure extends Error {
  constructor(
    public readonly event: string,
    public readonly errors: readonly LaunchEventValidationError[]
  ) {
    super(
      `Invalid launch event "${event}": ${errors
        .map((e) => describeError(e))
        .join(" · ")}`
    );
    this.name = "LaunchEventValidationFailure";
  }
}

/**
 * Main entry point. Call this from any surface emitting a launch
 * event. The contract argument is injectable so tests can feed a
 * minimal fixture without importing the full launch contract.
 *
 * `throwOnInvalid` is injectable too — the default uses
 * `shouldThrowOnInvalid()` to route dev/test through strict mode
 * and production through log-and-drop. Tests that need to exercise
 * the drop path set this to `false` explicitly.
 */
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

// MARK: - Error descriptions

/**
 * Human-readable description of a single validation error. Used
 * in `LaunchEventValidationFailure.message` and by the emitter's
 * dev-time console output. Kept separate from the union so
 * consumers can still introspect the raw error objects.
 */
export function describeError(error: LaunchEventValidationError): string {
  switch (error.kind) {
    case "unknownEvent":
      return `unknown event "${error.name}"`;
    case "missingRequiredProp":
      return `missing required prop "${error.prop}"`;
    case "wrongType":
      return `"${error.prop}" expected ${error.expected}, got ${error.actual}`;
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
      const _exhaustive: never = error;
      return String(_exhaustive);
    }
  }
}
