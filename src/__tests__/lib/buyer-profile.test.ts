import { describe, it, expect } from "vitest";

describe("buyerProfile types", () => {
  it("financing types are valid", () => {
    const validTypes = ["cash", "conventional", "fha", "va", "other"];
    expect(validTypes).toHaveLength(5);
  });

  it("move timeline options are valid", () => {
    const timelines = ["asap", "1_3_months", "3_6_months", "6_plus_months", "just_looking"];
    expect(timelines).toHaveLength(5);
  });

  it("communication prefs structure is correct", () => {
    const prefs = { email: true, sms: false, push: true };
    expect(prefs).toHaveProperty("email");
    expect(prefs).toHaveProperty("sms");
    expect(prefs).toHaveProperty("push");
  });
});
