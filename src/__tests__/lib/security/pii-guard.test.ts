import { describe, it, expect } from "vitest";
import { stripPii, containsPii } from "@/lib/security/pii-guard";

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
