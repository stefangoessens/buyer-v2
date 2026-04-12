import { describe, it, expect, vi } from "vitest";
import {
  emitLaunchEvent,
  LaunchEventValidationFailure,
  describeError,
} from "@/lib/launchEvents/emit";
import type { LaunchEventTransport } from "@/lib/launchEvents/emit";

function makeTransport(): LaunchEventTransport & {
  calls: Array<{ name: string; properties: Record<string, unknown> }>;
  invalidCalls: Array<{ name: string; errors: readonly unknown[] }>;
} {
  const calls: Array<{ name: string; properties: Record<string, unknown> }> = [];
  const invalidCalls: Array<{ name: string; errors: readonly unknown[] }> = [];
  return {
    dispatch(name, properties) {
      calls.push({ name, properties });
    },
    onInvalid(name, errors) {
      invalidCalls.push({ name, errors });
    },
    calls,
    invalidCalls,
  };
}

// MARK: - Valid emit

describe("emitLaunchEvent — valid events", () => {
  it("dispatches a well-formed event to the transport", () => {
    const transport = makeTransport();
    emitLaunchEvent(
      transport,
      "link_pasted",
      { url: "https://redfin.com/home/1", source: "blog" },
      { throwOnInvalid: false }
    );
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.name).toBe("link_pasted");
  });
});

// MARK: - Invalid emit — strict mode

describe("emitLaunchEvent — invalid events in strict mode", () => {
  it("throws on unknown event when throwOnInvalid=true", () => {
    const transport = makeTransport();
    expect(() =>
      emitLaunchEvent(
        transport,
        "nonexistent_event",
        {},
        { throwOnInvalid: true }
      )
    ).toThrow(LaunchEventValidationFailure);
    expect(transport.calls).toHaveLength(0);
  });

  it("throws on missing required prop", () => {
    const transport = makeTransport();
    expect(() =>
      emitLaunchEvent(
        transport,
        "link_pasted",
        { source: "home" },
        { throwOnInvalid: true }
      )
    ).toThrow(/missing required prop "url"/);
  });

  it("throws on invalid enum value", () => {
    const transport = makeTransport();
    expect(() =>
      emitLaunchEvent(
        transport,
        "link_pasted",
        { url: "x", source: "mystery" },
        { throwOnInvalid: true }
      )
    ).toThrow(/not in \[/);
  });

  it("LaunchEventValidationFailure carries the full error list", () => {
    const transport = makeTransport();
    try {
      emitLaunchEvent(
        transport,
        "link_pasted",
        {},
        { throwOnInvalid: true }
      );
      throw new Error("expected emit to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(LaunchEventValidationFailure);
      if (err instanceof LaunchEventValidationFailure) {
        expect(err.event).toBe("link_pasted");
        expect(err.errors.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

// MARK: - Invalid emit — drop mode

describe("emitLaunchEvent — invalid events in drop mode", () => {
  it("calls onInvalid and does not dispatch when throwOnInvalid=false", () => {
    const transport = makeTransport();
    emitLaunchEvent(
      transport,
      "link_pasted",
      { source: "home" }, // missing url
      { throwOnInvalid: false }
    );
    expect(transport.calls).toHaveLength(0);
    expect(transport.invalidCalls).toHaveLength(1);
    expect(transport.invalidCalls[0]?.name).toBe("link_pasted");
  });

  it("silently drops when the transport has no onInvalid hook", () => {
    const calls: Array<{ name: string; properties: Record<string, unknown> }> = [];
    const transport: LaunchEventTransport = {
      dispatch(name, properties) {
        calls.push({ name, properties });
      },
    };
    expect(() =>
      emitLaunchEvent(
        transport,
        "link_pasted",
        {},
        { throwOnInvalid: false }
      )
    ).not.toThrow();
    expect(calls).toHaveLength(0);
  });
});

// MARK: - describeError

describe("describeError", () => {
  it("describes missingRequiredProp", () => {
    expect(
      describeError({
        kind: "missingRequiredProp",
        event: "x",
        prop: "y",
      })
    ).toContain("missing required prop");
  });

  it("describes unknownEvent", () => {
    expect(describeError({ kind: "unknownEvent", name: "q" })).toContain(
      "unknown event"
    );
  });

  it("describes outOfRange with a min-and-max range", () => {
    expect(
      describeError({
        kind: "outOfRange",
        event: "x",
        prop: "y",
        value: 5,
        min: 0,
        max: 1,
      })
    ).toContain("0..1");
  });

  it("describes outOfRange with only a minimum", () => {
    expect(
      describeError({
        kind: "outOfRange",
        event: "x",
        prop: "y",
        value: -1,
        min: 0,
      })
    ).toContain(">= 0");
  });

  it("describes invalidEnumValue with the allowed list", () => {
    expect(
      describeError({
        kind: "invalidEnumValue",
        event: "x",
        prop: "y",
        value: "z",
        allowed: ["a", "b"],
      })
    ).toContain("[a, b]");
  });

  it("describes wrongType", () => {
    expect(
      describeError({
        kind: "wrongType",
        event: "x",
        prop: "y",
        expected: "number",
        actual: "string",
      })
    ).toContain("expected number");
  });

  it("describes integerExpected", () => {
    expect(
      describeError({
        kind: "integerExpected",
        event: "x",
        prop: "y",
        value: 1.5,
      })
    ).toContain("integer");
  });
});

// MARK: - Options shape

describe("emitLaunchEvent options", () => {
  it("uses the default contract when none is passed", () => {
    const transport = makeTransport();
    emitLaunchEvent(
      transport,
      "teaser_viewed",
      { propertyId: "p_1" },
      { throwOnInvalid: false }
    );
    expect(transport.calls).toHaveLength(1);
  });

  it("accepts a custom minimal contract for isolated tests", () => {
    const transport = makeTransport();
    emitLaunchEvent(
      transport,
      "custom_event",
      { x: 1 },
      {
        contract: {
          version: "0.0.1",
          lastUpdated: "2026-04-12",
          events: {
            custom_event: {
              name: "custom_event",
              category: "public_site",
              description: "test",
              owner: "test",
              introducedIn: "0.0.1",
              props: {
                x: {
                  type: "integer",
                  required: true,
                  description: "x",
                },
              },
            },
          },
        },
        throwOnInvalid: false,
      }
    );
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.name).toBe("custom_event");
  });
});

// vi is imported but the current tests don't use it; guard against
// a lint removal warning.
void vi;
