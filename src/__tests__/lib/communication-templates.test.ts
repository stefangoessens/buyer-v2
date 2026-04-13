import { describe, expect, it } from "vitest";
import {
  COMMUNICATION_TEMPLATE_CHANNELS,
  compareCommunicationTemplateVersions,
  isValidCommunicationTemplateVersion,
  type CommunicationTemplateRecord,
} from "@buyer-v2/shared";

const sampleTemplate = {
  key: "tour_confirmation",
  channel: "email",
  version: "1.2.3",
  subject: "Tour confirmed for {{buyerName}}",
  body: "Hi {{buyerName}}, your tour is set.",
  variables: ["buyerName"],
  isActive: true,
  description: "Confirms a scheduled tour",
  author: "ops",
  changeNotes: "Initial registry entry",
  createdAt: "2026-04-12T00:00:00.000Z",
  updatedAt: "2026-04-12T00:00:00.000Z",
} satisfies CommunicationTemplateRecord<"buyerName">;

describe("communication template registry contract", () => {
  it("exports the canonical channel set", () => {
    expect(COMMUNICATION_TEMPLATE_CHANNELS).toEqual([
      "email",
      "sms",
      "in_app",
      "push",
    ]);
  });

  it("keeps a typed template record shape", () => {
    expect(sampleTemplate.version).toBe("1.2.3");
    expect(sampleTemplate.variables).toEqual(["buyerName"]);
    expect(sampleTemplate.isActive).toBe(true);
  });

  it("accepts semver registry versions and rejects malformed ones", () => {
    expect(isValidCommunicationTemplateVersion("1.0.0")).toBe(true);
    expect(isValidCommunicationTemplateVersion("1.0")).toBe(false);
  });

  it("orders registry versions using semver semantics", () => {
    const versions = ["1.0.0", "1.2.0", "1.1.5"].sort(
      compareCommunicationTemplateVersions
    );
    expect(versions).toEqual(["1.0.0", "1.1.5", "1.2.0"]);
  });
});
