import { describe, it, expect } from "vitest";
import { determineEligibility } from "@/lib/dealroom/offerEligibility";

describe("determineEligibility", () => {
  it("eligible with signed full_representation", () => {
    const result = determineEligibility([
      { type: "full_representation", status: "signed" },
    ]);
    expect(result.eligible).toBe(true);
    expect(result.requiredAction).toBe("none");
  });

  it("not eligible with tour_pass only — needs upgrade", () => {
    const result = determineEligibility([
      { type: "tour_pass", status: "signed" },
    ]);
    expect(result.eligible).toBe(false);
    expect(result.requiredAction).toBe("upgrade_to_full_rep");
    expect(result.currentAgreementType).toBe("tour_pass");
  });

  it("not eligible with no agreements", () => {
    const result = determineEligibility([]);
    expect(result.eligible).toBe(false);
    expect(result.requiredAction).toBe("sign_agreement");
    expect(result.currentAgreementType).toBe("none");
  });

  it("ignores draft/sent/canceled agreements", () => {
    const result = determineEligibility([
      { type: "full_representation", status: "draft" },
      { type: "tour_pass", status: "canceled" },
    ]);
    expect(result.eligible).toBe(false);
    expect(result.requiredAction).toBe("sign_agreement");
  });

  it("full_rep takes priority over tour_pass", () => {
    const result = determineEligibility([
      { type: "tour_pass", status: "signed" },
      { type: "full_representation", status: "signed" },
    ]);
    expect(result.eligible).toBe(true);
  });
});
