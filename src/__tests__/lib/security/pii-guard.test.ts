import { describe, it, expect } from "vitest";
import {
  stripPii,
  containsPii,
  scrubPiiFromString,
  deepScrubPii,
} from "@/lib/security/pii-guard";

describe("stripPii", () => {
  it("strips known PII fields", () => {
    const input = { email: "test@example.com", name: "John", status: "active" };
    const result = stripPii(input);
    expect(result.email).toBe("[REDACTED]");
    expect(result.name).toBe("[REDACTED]");
    expect(result.status).toBe("active");
  });

  it("strips nested PII fields", () => {
    const input = { user: { email: "test@example.com" }, count: 5 };
    const result = stripPii(input);
    expect((result.user as Record<string, unknown>).email).toBe("[REDACTED]");
    expect(result.count).toBe(5);
  });

  it("handles arrays", () => {
    const input = { items: [{ name: "Alice" }, { name: "Bob" }] };
    const result = stripPii(input);
    const items = result.items as Array<Record<string, unknown>>;
    expect(items[0].name).toBe("[REDACTED]");
    expect(items[1].name).toBe("[REDACTED]");
  });

  it("handles null and undefined", () => {
    const input = { email: null, phone: undefined, status: "ok" };
    const result = stripPii(input as Record<string, unknown>);
    expect(result.status).toBe("ok");
  });

  it("strips fields from the data catalog (getAllPiiFields)", () => {
    const input = { preApprovalAmount: 500000, propertyType: "Condo" };
    const result = stripPii(input);
    expect(result.preApprovalAmount).toBe("[REDACTED]");
    expect(result.propertyType).toBe("Condo");
  });

  it("strips additional custom fields", () => {
    const input = { customField: "secret-data", status: "active" };
    const result = stripPii(input, ["customField"]);
    expect(result.customField).toBe("[REDACTED]");
    expect(result.status).toBe("active");
  });

  it("matches PII fields case-insensitively", () => {
    const input = { Email: "test@example.com", Phone: "555-1234" };
    const result = stripPii(input);
    expect(result.Email).toBe("[REDACTED]");
    expect(result.Phone).toBe("[REDACTED]");
  });
});

describe("containsPii", () => {
  it("detects email addresses", () => {
    expect(containsPii("Contact me at john@example.com")).toBe(true);
  });

  it("detects phone numbers", () => {
    expect(containsPii("Call (305) 555-1234")).toBe(true);
  });

  it("detects SSN patterns", () => {
    expect(containsPii("SSN: 123-45-6789")).toBe(true);
  });

  it("returns false for clean text", () => {
    expect(containsPii("Property at 100 Las Olas Blvd")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsPii("")).toBe(false);
  });

  it("detects phone without parentheses", () => {
    expect(containsPii("Call 305-555-1234")).toBe(true);
  });
});

describe("scrubPiiFromString", () => {
  it("redacts email addresses embedded in free text", () => {
    const result = scrubPiiFromString("Contact me at alice@example.com for details");
    expect(result).not.toContain("alice@example.com");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts multiple emails in one string", () => {
    const result = scrubPiiFromString("a@b.com and c@d.org both replied");
    expect(result).not.toContain("a@b.com");
    expect(result).not.toContain("c@d.org");
  });

  it("redacts phone numbers", () => {
    const result = scrubPiiFromString("Call me at (305) 555-1234");
    expect(result).not.toMatch(/\(305\)\s?555-1234/);
    expect(result).toContain("[REDACTED]");
  });

  it("redacts SSN patterns", () => {
    const result = scrubPiiFromString("SSN: 123-45-6789");
    expect(result).not.toContain("123-45-6789");
    expect(result).toContain("[REDACTED]");
  });

  it("leaves clean text unchanged", () => {
    expect(scrubPiiFromString("Property at 100 Las Olas Blvd")).toBe(
      "Property at 100 Las Olas Blvd",
    );
  });

  it("handles empty string", () => {
    expect(scrubPiiFromString("")).toBe("");
  });
});

describe("deepScrubPii", () => {
  it("strips known PII field names (parity with stripPii)", () => {
    const input = { email: "test@example.com", name: "John", status: "active" };
    const result = deepScrubPii(input);
    expect(result.email).toBe("[REDACTED]");
    expect(result.name).toBe("[REDACTED]");
    expect(result.status).toBe("active");
  });

  it("scrubs PII patterns inside free-text string values", () => {
    const input = {
      error: "Failed to send email to user@example.com",
      status: "error",
    };
    const result = deepScrubPii(input);
    expect(result.error).not.toContain("user@example.com");
    expect((result.error as string)).toContain("[REDACTED]");
    expect(result.status).toBe("error");
  });

  it("scrubs PII patterns in nested string values", () => {
    const input = {
      meta: { reason: "Buyer said call (305) 555-1234" },
    };
    const result = deepScrubPii(input);
    const reason = (result.meta as Record<string, unknown>).reason as string;
    expect(reason).not.toMatch(/\(305\)\s?555-1234/);
    expect(reason).toContain("[REDACTED]");
  });

  it("scrubs PII patterns inside arrays of strings", () => {
    const input = {
      errors: ["foo@bar.com failed", "ok"],
    };
    const result = deepScrubPii(input);
    const errors = result.errors as string[];
    expect(errors[0]).not.toContain("foo@bar.com");
    expect(errors[1]).toBe("ok");
  });

  it("scrubs PII patterns inside arrays of objects", () => {
    const input = {
      items: [
        { note: "Contact at jane@doe.org" },
        { note: "Nothing here" },
      ],
    };
    const result = deepScrubPii(input);
    const items = result.items as Array<Record<string, unknown>>;
    expect(items[0].note).not.toContain("jane@doe.org");
    expect(items[1].note).toBe("Nothing here");
  });

  it("handles null, undefined, and non-object primitives", () => {
    const input = {
      email: null,
      phone: undefined,
      count: 5,
      active: true,
      reason: "All good",
    };
    const result = deepScrubPii(input as Record<string, unknown>);
    expect(result.count).toBe(5);
    expect(result.active).toBe(true);
    expect(result.reason).toBe("All good");
  });

  it("handles the free-text-error case that codex flagged on KIN-860", () => {
    // Exactly the PR #46 finding: document_parse_failed.error may carry
    // a string with an embedded email or phone.
    const input = {
      documentId: "doc-123",
      parser: "contract-v1",
      error: "Parser failed on line 42 — buyer contact: test@example.com (305) 555-9999",
    };
    const result = deepScrubPii(input);
    expect(result.documentId).toBe("doc-123");
    expect(result.parser).toBe("contract-v1");
    const err = result.error as string;
    expect(err).not.toContain("test@example.com");
    expect(err).not.toMatch(/\(305\)\s?555-9999/);
    expect(err).toContain("[REDACTED]");
  });
});
