import { describe, expect, it } from "vitest";
import {
  buildSessionPermissions,
  inferAuthProviderFromIssuer,
} from "../../../convex/lib/session";

describe("Convex session helpers", () => {
  it("derives permission snapshots from the canonical role set", () => {
    expect(buildSessionPermissions("buyer")).toEqual({
      canAccessInternalConsole: false,
      canReadBuyerData: true,
      canReadBrokerTools: false,
      canMutateAdminOnlyState: false,
    });

    expect(buildSessionPermissions("broker")).toEqual({
      canAccessInternalConsole: true,
      canReadBuyerData: true,
      canReadBrokerTools: true,
      canMutateAdminOnlyState: false,
    });

    expect(buildSessionPermissions("admin")).toEqual({
      canAccessInternalConsole: true,
      canReadBuyerData: true,
      canReadBrokerTools: true,
      canMutateAdminOnlyState: true,
    });
  });

  it("maps provider issuers onto the supported OIDC provider set", () => {
    expect(inferAuthProviderFromIssuer("https://kindservices.clerk.accounts.dev")).toBe(
      "clerk",
    );
    expect(inferAuthProviderFromIssuer("https://buyer-v2.us.auth0.com/")).toBe(
      "auth0",
    );
    expect(inferAuthProviderFromIssuer("https://example.com")).toBeUndefined();
    expect(inferAuthProviderFromIssuer(undefined)).toBeUndefined();
  });
});
