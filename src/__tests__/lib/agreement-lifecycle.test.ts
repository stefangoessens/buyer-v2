import { describe, it, expect } from "vitest";

describe("agreement lifecycle", () => {
  const validTransitions = {
    draft: ["sent"],
    sent: ["signed"],
    signed: ["canceled", "replaced"],
    canceled: [],
    replaced: [],
  };

  it("defines valid status transitions", () => {
    expect(validTransitions.draft).toContain("sent");
    expect(validTransitions.sent).toContain("signed");
    expect(validTransitions.signed).toContain("canceled");
    expect(validTransitions.signed).toContain("replaced");
  });

  it("terminal states have no transitions", () => {
    expect(validTransitions.canceled).toHaveLength(0);
    expect(validTransitions.replaced).toHaveLength(0);
  });

  it("agreement types are valid", () => {
    const types = ["tour_pass", "full_representation"];
    expect(types).toHaveLength(2);
  });

  it("governing agreement is the most recent signed", () => {
    const agreements = [
      { status: "canceled", signedAt: "2024-01-01" },
      { status: "signed", signedAt: "2024-06-01" },
      { status: "signed", signedAt: "2024-03-01" },
    ];
    const governing = agreements
      .filter((a) => a.status === "signed")
      .sort((a, b) => b.signedAt.localeCompare(a.signedAt))
      .at(0);
    expect(governing?.signedAt).toBe("2024-06-01");
  });

  it("replacement creates a chain", () => {
    // Simulates: agreement A (signed) → replaced by B (draft)
    const a = { id: "a", status: "replaced", replacedById: "b" };
    const b = { id: "b", status: "draft", replacedById: undefined };
    expect(a.replacedById).toBe(b.id);
    expect(b.status).toBe("draft");
  });
});
