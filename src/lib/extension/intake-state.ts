import type { SourcePlatform } from "@/lib/intake/types";

export const EXTENSION_INTAKE_AUTH_STATES = [
  "signed_in",
  "signed_out",
] as const;

export type ExtensionIntakeAuthState =
  (typeof EXTENSION_INTAKE_AUTH_STATES)[number];

export const EXTENSION_INTAKE_OUTCOMES = [
  "created",
  "duplicate",
] as const;

export type ExtensionIntakeOutcome =
  (typeof EXTENSION_INTAKE_OUTCOMES)[number];

export const EXTENSION_INTAKE_FAILURE_CODES = [
  "invalid_request",
  "backend_unavailable",
  "malformed_url",
  "missing_listing_id",
  "unsupported_url",
] as const;

export type ExtensionIntakeFailureCode =
  (typeof EXTENSION_INTAKE_FAILURE_CODES)[number];

export interface ExtensionIntakeSuccessResult {
  kind: ExtensionIntakeOutcome;
  authState: ExtensionIntakeAuthState;
  platform: SourcePlatform;
  listingId: string;
  normalizedUrl: string;
  sourceListingId: string;
}

export interface ExtensionIntakeFailureResult {
  kind: "unsupported";
  code: ExtensionIntakeFailureCode;
  error: string;
  platform?: SourcePlatform;
}

export type ExtensionIntakeSubmissionResult =
  | ExtensionIntakeSuccessResult
  | ExtensionIntakeFailureResult;

export interface ExtensionIntakeViewModel {
  eyebrow: string;
  title: string;
  body: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  statusLabel: string;
}

export function portalLabel(platform: SourcePlatform): string {
  switch (platform) {
    case "zillow":
      return "Zillow";
    case "redfin":
      return "Redfin";
    case "realtor":
      return "Realtor.com";
  }
}

export function buildExtensionIntakeRedirectUrl(
  buyerV2BaseUrl: string,
  result: ExtensionIntakeSuccessResult,
): string {
  const base = buyerV2BaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    url: result.normalizedUrl,
    source: "extension",
    result: result.kind,
    auth: result.authState,
    platform: result.platform,
    listingId: result.listingId,
    sourceListingId: result.sourceListingId,
  });

  return `${base}/intake?${params.toString()}`;
}

export function getExtensionIntakeViewModel(
  result: ExtensionIntakeSuccessResult,
): ExtensionIntakeViewModel {
  const portal = portalLabel(result.platform);
  const base = {
    eyebrow: `Chrome extension · ${portal}`,
    secondaryHref: result.normalizedUrl,
    secondaryLabel: "Open listing",
  };

  if (result.kind === "duplicate" && result.authState === "signed_in") {
    return {
      ...base,
      title: "This listing is already in buyer-v2",
      body: `We found an existing ${portal} intake for this property. Open your dashboard to keep working from the canonical buyer-v2 record.`,
      primaryHref: "/dashboard",
      primaryLabel: "Open dashboard",
      statusLabel: "Duplicate listing",
    };
  }

  if (result.kind === "duplicate") {
    return {
      ...base,
      title: "This listing is already saved",
      body: `We already have this ${portal} property in buyer-v2. Sign in to continue from your dashboard, or head back to the site to paste another listing.`,
      primaryHref: "/",
      primaryLabel: "Go to buyer-v2",
      statusLabel: "Duplicate listing",
    };
  }

  if (result.authState === "signed_in") {
    return {
      ...base,
      title: `Saved from ${portal}`,
      body: `We added this ${portal} listing to the shared buyer-v2 intake flow. Open your dashboard to follow the intake and analysis status.`,
      primaryHref: "/dashboard",
      primaryLabel: "Open dashboard",
      statusLabel: "Saved to intake",
    };
  }

  return {
    ...base,
    title: `Saved from ${portal}`,
    body: `We captured this ${portal} listing in buyer-v2. Sign in on the site to continue from your intake queue and unlock the full analysis.`,
    primaryHref: "/",
    primaryLabel: "Go to buyer-v2",
    statusLabel: "Saved to intake",
  };
}
