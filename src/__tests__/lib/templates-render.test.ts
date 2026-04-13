import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  extractPlaceholders,
  isValidVersion,
  compareVersions,
  type RenderResult,
} from "@/lib/templates/render";

// Type guards to narrow discriminated union in assertions.
function assertOk(
  result: RenderResult
): asserts result is Extract<RenderResult, { ok: true }> {
  expect(result.ok).toBe(true);
}

function assertErr(
  result: RenderResult
): asserts result is Extract<RenderResult, { ok: false }> {
  expect(result.ok).toBe(false);
}

describe("extractPlaceholders", () => {
  it("returns empty array for empty string", () => {
    expect(extractPlaceholders("")).toEqual([]);
  });

  it("returns empty array when template has no placeholders", () => {
    expect(extractPlaceholders("Hello world, no variables here.")).toEqual([]);
  });

  it("extracts a single placeholder", () => {
    expect(extractPlaceholders("Hello {{name}}")).toEqual(["name"]);
  });

  it("extracts multiple distinct placeholders in order", () => {
    expect(extractPlaceholders("{{name}} <{{email}}>")).toEqual(["name", "email"]);
  });

  it("deduplicates repeated placeholders", () => {
    expect(extractPlaceholders("{{name}} and again {{name}}")).toEqual(["name"]);
  });

  it("supports whitespace inside braces: {{ name }}", () => {
    expect(extractPlaceholders("Hello {{ name }}")).toEqual(["name"]);
  });

  it("handles mixed whitespace styles in the same template", () => {
    const tpl = "{{a}} and {{ b }} and {{  c  }} and {{d }}";
    expect(extractPlaceholders(tpl)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not match a single brace", () => {
    expect(extractPlaceholders("this is {not} a placeholder")).toEqual([]);
  });

  it("does not match mismatched braces", () => {
    expect(extractPlaceholders("this is {{foo} not a placeholder")).toEqual([]);
  });

  it("returns unique names in order of first appearance", () => {
    const tpl = "{{b}} {{a}} {{b}} {{c}} {{a}}";
    expect(extractPlaceholders(tpl)).toEqual(["b", "a", "c"]);
  });
});

describe("renderTemplate — happy path", () => {
  it("performs a simple substitution", () => {
    const result = renderTemplate("Hello {{name}}", ["name"], { name: "Alice" });
    assertOk(result);
    expect(result.rendered).toBe("Hello Alice");
  });

  it("substitutes multiple variables", () => {
    const result = renderTemplate(
      "{{a}} and {{b}}",
      ["a", "b"],
      { a: "foo", b: "bar" }
    );
    assertOk(result);
    expect(result.rendered).toBe("foo and bar");
  });

  it("converts a number input to its string form", () => {
    const result = renderTemplate("{{count}}", ["count"], { count: 5 });
    assertOk(result);
    expect(result.rendered).toBe("5");
  });

  it("converts a boolean true input to the string 'true'", () => {
    const result = renderTemplate("{{enabled}}", ["enabled"], { enabled: true });
    assertOk(result);
    expect(result.rendered).toBe("true");
  });

  it("converts a boolean false input to the string 'false'", () => {
    const result = renderTemplate("{{enabled}}", ["enabled"], { enabled: false });
    assertOk(result);
    expect(result.rendered).toBe("false");
  });

  it("repeated placeholder is substituted each occurrence", () => {
    const result = renderTemplate("{{x}} + {{x}}", ["x"], { x: "A" });
    assertOk(result);
    expect(result.rendered).toBe("A + A");
  });

  it("usedVariables contains each unique placeholder used in the body", () => {
    const result = renderTemplate(
      "{{greeting}}, {{name}}! {{greeting}} again.",
      ["greeting", "name", "unused"],
      { greeting: "Hi", name: "Bob", unused: "x" }
    );
    assertOk(result);
    expect(result.rendered).toBe("Hi, Bob! Hi again.");
    // unique placeholder names in the body, not declared list.
    expect(result.usedVariables).toEqual(["greeting", "name"]);
  });

  it("respects whitespace inside braces on substitution", () => {
    const result = renderTemplate("Hello {{ name }}", ["name"], { name: "Alice" });
    assertOk(result);
    expect(result.rendered).toBe("Hello Alice");
  });
});

describe("renderTemplate — missing_variable errors", () => {
  it("errors when a declared variable is not supplied", () => {
    const result = renderTemplate("Hello {{name}}", ["name"], {});
    assertErr(result);
    const missing = result.errors.filter((e) => e.code === "missing_variable");
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing[0].variable).toBe("name");
  });

  it("error includes the variable name in its metadata", () => {
    const result = renderTemplate("Hi {{user}}", ["user"], {});
    assertErr(result);
    const err = result.errors.find(
      (e) => e.code === "missing_variable" && e.variable === "user"
    );
    expect(err).toBeDefined();
    expect(err?.message).toContain("user");
  });

  it("reports every missing variable individually", () => {
    const result = renderTemplate(
      "{{a}} {{b}} {{c}}",
      ["a", "b", "c"],
      { a: "x" }
    );
    assertErr(result);
    const missing = result.errors.filter((e) => e.code === "missing_variable");
    const names = missing.map((e) => e.variable).sort();
    expect(names).toEqual(["b", "c"]);
  });
});

describe("renderTemplate — invalid_template errors", () => {
  it("errors when body contains a placeholder not in declaredVariables", () => {
    const result = renderTemplate("Hello {{stranger}}", [], {});
    assertErr(result);
    const invalid = result.errors.filter((e) => e.code === "invalid_template");
    expect(invalid.length).toBe(1);
    expect(invalid[0].variable).toBe("stranger");
  });

  it("protects against silently dropping an unknown placeholder", () => {
    const result = renderTemplate(
      "Hi {{name}}, your code is {{secret}}",
      ["name"],
      { name: "Alice" }
    );
    assertErr(result);
    const invalid = result.errors.find(
      (e) => e.code === "invalid_template" && e.variable === "secret"
    );
    expect(invalid).toBeDefined();
  });
});

describe("renderTemplate — strict / allowExtraInputs", () => {
  it("in strict mode, rejects input variables not in declaredVariables", () => {
    const result = renderTemplate(
      "Hi {{name}}",
      ["name"],
      { name: "Alice", extra: "unused" },
      { strict: true }
    );
    assertErr(result);
    const unexpected = result.errors.filter(
      (e) => e.code === "unexpected_variable"
    );
    expect(unexpected.length).toBe(1);
    expect(unexpected[0].variable).toBe("extra");
  });

  it("in default mode, ignores extra inputs silently", () => {
    const result = renderTemplate(
      "Hi {{name}}",
      ["name"],
      { name: "Alice", extra: "unused" }
    );
    assertOk(result);
    expect(result.rendered).toBe("Hi Alice");
  });

  it("strict overrides allowExtraInputs=true — still errors on extras", () => {
    const result = renderTemplate(
      "Hi {{name}}",
      ["name"],
      { name: "Alice", extra: "x" },
      { strict: true, allowExtraInputs: true }
    );
    assertErr(result);
    const unexpected = result.errors.filter(
      (e) => e.code === "unexpected_variable"
    );
    expect(unexpected.length).toBe(1);
  });

  it("allowExtraInputs=false without strict still errors on extras", () => {
    const result = renderTemplate(
      "Hi {{name}}",
      ["name"],
      { name: "Alice", extra: "x" },
      { allowExtraInputs: false }
    );
    assertErr(result);
    const unexpected = result.errors.filter(
      (e) => e.code === "unexpected_variable"
    );
    expect(unexpected.length).toBe(1);
    expect(unexpected[0].variable).toBe("extra");
  });

  it("allowExtraInputs=true with strict=false ignores extras", () => {
    const result = renderTemplate(
      "Hi {{name}}",
      ["name"],
      { name: "Alice", extra: "x" },
      { allowExtraInputs: true, strict: false }
    );
    assertOk(result);
    expect(result.rendered).toBe("Hi Alice");
  });
});

describe("renderTemplate — edge cases", () => {
  it("empty template with no declared vars and no inputs renders empty", () => {
    const result = renderTemplate("", [], {});
    assertOk(result);
    expect(result.rendered).toBe("");
    expect(result.usedVariables).toEqual([]);
  });

  it("template with only text (no placeholders) passes through unchanged", () => {
    const tpl = "Just a plain string with no variables.";
    const result = renderTemplate(tpl, [], {});
    assertOk(result);
    expect(result.rendered).toBe(tpl);
  });

  it("literal `$` in input value is not interpreted as a replacement pattern", () => {
    // String.prototype.replace treats `$&` / `$1` specially in the replacement
    // string. Because the library uses a function replacer this should be safe.
    const result = renderTemplate("price: {{p}}", ["p"], { p: "$100 ($50 off)" });
    assertOk(result);
    expect(result.rendered).toBe("price: $100 ($50 off)");
  });

  it("literal `\\` in input value survives intact", () => {
    const result = renderTemplate("path: {{p}}", ["p"], { p: "C:\\temp\\x" });
    assertOk(result);
    expect(result.rendered).toBe("path: C:\\temp\\x");
  });

  it("literal `$` characters in the template body pass through untouched", () => {
    const result = renderTemplate(
      "cost $${{amount}} total",
      ["amount"],
      { amount: 42 }
    );
    assertOk(result);
    expect(result.rendered).toBe("cost $$42 total");
  });

  it("supports very long variable names", () => {
    const longName = "a".repeat(120);
    const result = renderTemplate(
      `Value: {{${longName}}}`,
      [longName],
      { [longName]: "ok" }
    );
    assertOk(result);
    expect(result.rendered).toBe("Value: ok");
  });

  it("single `{` is not treated as a placeholder", () => {
    const result = renderTemplate("this is {name} literal", [], {});
    assertOk(result);
    expect(result.rendered).toBe("this is {name} literal");
  });

  it("mismatched `{{foo}` is not treated as a placeholder", () => {
    const result = renderTemplate("this is {{foo} literal", [], {});
    assertOk(result);
    expect(result.rendered).toBe("this is {{foo} literal");
  });
});

describe("isValidVersion", () => {
  it("accepts 1.0.0", () => {
    expect(isValidVersion("1.0.0")).toBe(true);
  });

  it("accepts 0.0.1", () => {
    expect(isValidVersion("0.0.1")).toBe(true);
  });

  it("accepts multi-digit components like 10.20.30", () => {
    expect(isValidVersion("10.20.30")).toBe(true);
  });

  it("rejects a two-component version 1.0", () => {
    expect(isValidVersion("1.0")).toBe(false);
  });

  it("rejects a one-component version 1", () => {
    expect(isValidVersion("1")).toBe(false);
  });

  it("rejects a pre-release suffix like 1.0.0-beta", () => {
    expect(isValidVersion("1.0.0-beta")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isValidVersion("")).toBe(false);
  });

  it("rejects a leading v like v1.0.0", () => {
    expect(isValidVersion("v1.0.0")).toBe(false);
  });
});

describe("compareVersions", () => {
  it("equal versions return 0", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("lower patch returns -1", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
  });

  it("higher patch returns 1", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
  });

  it("higher major outranks lower major even if minor/patch are huge", () => {
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  it("equal major with lower minor returns -1", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
  });

  it("equal major with higher minor returns 1", () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
  });

  it("throws on an invalid left-hand version", () => {
    expect(() => compareVersions("not-a-version", "1.0.0")).toThrow();
  });

  it("throws on an invalid right-hand version", () => {
    expect(() => compareVersions("1.0.0", "1.0")).toThrow();
  });
});
