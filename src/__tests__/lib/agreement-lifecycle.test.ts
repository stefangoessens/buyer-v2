import { describe, expect, it } from "vitest";
import {
  buildChains,
  resolveCurrentGoverning,
  type AgreementRecord,
} from "@/lib/agreements/supersession";

function agreement(
  overrides: Partial<AgreementRecord> & { _id: string },
): AgreementRecord {
  return {
    buyerId: "buyer_1",
    type: "tour_pass",
    status: "signed",
    signedAt: "2028-01-01T12:00:00Z",
    ...overrides,
  };
}

describe("agreement lifecycle", () => {
  it("keeps typed supersession metadata on the replaced predecessor", () => {
    const predecessor = agreement({
      _id: "agreement_v1",
      status: "replaced",
      replacedById: "agreement_v2",
      supersededAt: "2028-02-01T10:00:00Z",
      supersessionReason: "renewal",
    });
    const successor = agreement({
      _id: "agreement_v2",
      status: "draft",
      signedAt: undefined,
    });

    const [chain] = buildChains([predecessor, successor]);

    expect(chain.lineage.map((row) => row._id)).toEqual([
      "agreement_v1",
      "agreement_v2",
    ]);
    expect(chain.head.supersededAt).toBe("2028-02-01T10:00:00Z");
    expect(chain.head.supersessionReason).toBe("renewal");
  });

  it("drops the superseded agreement from current resolution until the successor is signed", () => {
    const predecessor = agreement({
      _id: "agreement_v1",
      type: "full_representation",
      status: "replaced",
      replacedById: "agreement_v2",
      supersededAt: "2028-02-01T10:00:00Z",
      supersessionReason: "correction",
    });
    const successorDraft = agreement({
      _id: "agreement_v2",
      type: "full_representation",
      status: "draft",
      signedAt: undefined,
    });

    expect(resolveCurrentGoverning([predecessor, successorDraft])).toBeNull();

    const successorSigned = {
      ...successorDraft,
      status: "signed" as const,
      signedAt: "2028-02-02T10:00:00Z",
    };

    expect(resolveCurrentGoverning([predecessor, successorSigned])?._id).toBe(
      "agreement_v2",
    );
  });
});
