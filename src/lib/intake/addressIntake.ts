import type { MatchConfidence } from "@/lib/intake/address";

export interface AddressIntakeCandidate {
  propertyId: string;
  canonical: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    zip: string;
    county?: string;
    formatted: string;
  };
  score: number;
}

export interface AddressIntakeSnapshot {
  intakeId: string;
  sourcePlatform: string;
  status: string;
  propertyId?: string;
  extractedAt: string;
  canonical?: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    zip: string;
    county?: string;
    formatted?: string;
  };
  match?: {
    confidence: MatchConfidence;
    score: number;
    bestMatchId: string | null;
    ambiguous: boolean;
  };
  candidates?: AddressIntakeCandidate[];
}

export type AddressIntakeView =
  | { kind: "loading" }
  | { kind: "missing" }
  | {
      kind: "matched";
      intakeId: string;
      propertyId: string;
      canonicalFormatted: string;
      confidence: MatchConfidence;
      score: number;
    }
  | {
      kind: "ambiguous";
      intakeId: string;
      canonicalFormatted: string;
      confidence: MatchConfidence;
      score: number;
      candidates: AddressIntakeCandidate[];
      ambiguous: boolean;
    }
  | {
      kind: "no_match";
      intakeId: string;
      canonicalFormatted: string;
      confidence: MatchConfidence;
      score: number;
      bestMatchId: string | null;
    };

export function resolveAddressIntakeView(
  snapshot: AddressIntakeSnapshot | null | undefined,
): AddressIntakeView {
  if (snapshot === undefined) {
    return { kind: "loading" };
  }

  if (snapshot === null || snapshot.sourcePlatform !== "manual") {
    return { kind: "missing" };
  }

  const canonicalFormatted =
    snapshot.canonical?.formatted ??
    [
      snapshot.canonical?.street
        ? snapshot.canonical.unit
          ? `${snapshot.canonical.street}, Unit ${snapshot.canonical.unit}`
          : snapshot.canonical.street
        : undefined,
      snapshot.canonical?.city,
      snapshot.canonical?.state && snapshot.canonical?.zip
        ? `${snapshot.canonical.state} ${snapshot.canonical.zip}`
        : undefined,
    ]
      .filter(Boolean)
      .join(", ");

  if (!canonicalFormatted || !snapshot.match) {
    return { kind: "missing" };
  }

  if (
    snapshot.propertyId &&
    !snapshot.match.ambiguous &&
    (snapshot.match.confidence === "exact" || snapshot.match.confidence === "high")
  ) {
    return {
      kind: "matched",
      intakeId: snapshot.intakeId,
      propertyId: snapshot.propertyId,
      canonicalFormatted,
      confidence: snapshot.match.confidence,
      score: snapshot.match.score,
    };
  }

  if (snapshot.match.ambiguous || snapshot.match.confidence === "medium") {
    return {
      kind: "ambiguous",
      intakeId: snapshot.intakeId,
      canonicalFormatted,
      confidence: snapshot.match.confidence,
      score: snapshot.match.score,
      candidates: snapshot.candidates ?? [],
      ambiguous: snapshot.match.ambiguous,
    };
  }

  return {
    kind: "no_match",
    intakeId: snapshot.intakeId,
    canonicalFormatted,
    confidence: snapshot.match.confidence,
    score: snapshot.match.score,
    bestMatchId: snapshot.match.bestMatchId,
  };
}

export function formatMatchConfidence(confidence: MatchConfidence): string {
  switch (confidence) {
    case "exact":
      return "Exact match";
    case "high":
      return "High confidence";
    case "medium":
      return "Needs review";
    case "low":
      return "Low confidence";
    case "none":
      return "No reliable match";
  }
}

export function formatMatchScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}
