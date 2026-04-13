import type {
  CompCandidate,
  CompsInput,
  CompsOutput,
  CompResult,
  CompsAggregates,
} from "./types";

/** Similarity weights */
const WEIGHTS = {
  beds: 0.2,
  baths: 0.1,
  sqft: 0.25,
  yearBuilt: 0.1,
  lotSize: 0.1,
  propertyType: 0.1,
  waterfront: 0.05,
  pool: 0.05,
  hoa: 0.05,
} as const;

/** Score similarity between subject and candidate (0-1, higher = more similar) */
export function scoreSimilarity(
  subject: CompsInput["subject"],
  candidate: CompCandidate,
): number {
  let score = 0;

  // Beds — exact match = 1, each bed diff = -0.3
  score +=
    WEIGHTS.beds * Math.max(0, 1 - Math.abs(subject.beds - candidate.beds) * 0.3);

  // Baths
  score +=
    WEIGHTS.baths *
    Math.max(0, 1 - Math.abs(subject.baths - candidate.baths) * 0.3);

  // Sqft — within 10% = 1, proportional decline
  const sqftRatio =
    subject.sqft > 0
      ? Math.abs(subject.sqft - candidate.sqft) / subject.sqft
      : 1;
  score += WEIGHTS.sqft * Math.max(0, 1 - sqftRatio * 2);

  // Year built — within 5 years = 1, proportional decline
  const yearDiff = Math.abs(subject.yearBuilt - candidate.yearBuilt);
  score += WEIGHTS.yearBuilt * Math.max(0, 1 - yearDiff / 30);

  // Lot size
  if (subject.lotSize && candidate.lotSize && subject.lotSize > 0) {
    const lotRatio =
      Math.abs(subject.lotSize - candidate.lotSize) / subject.lotSize;
    score += WEIGHTS.lotSize * Math.max(0, 1 - lotRatio * 2);
  } else {
    score += WEIGHTS.lotSize * 0.5; // neutral when unknown
  }

  // Property type — exact match
  score +=
    WEIGHTS.propertyType *
    (subject.propertyType === candidate.propertyType ? 1 : 0);

  // Boolean features
  score +=
    WEIGHTS.waterfront *
    (subject.waterfront === candidate.waterfront ? 1 : 0.5);
  score += WEIGHTS.pool * (subject.pool === candidate.pool ? 1 : 0.5);

  // HOA presence
  const subjectHasHoa = (subject.hoaFee ?? 0) > 0;
  const candHasHoa = (candidate.hoaFee ?? 0) > 0;
  score += WEIGHTS.hoa * (subjectHasHoa === candHasHoa ? 1 : 0.3);

  return Number(score.toFixed(3));
}

/** Dedup candidates by canonicalId + soldPrice + soldDate */
export function dedupCandidates(candidates: CompCandidate[]): CompCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.canonicalId}|${c.soldPrice}|${c.soldDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Determine selection basis */
function determineSelectionBasis(
  subject: CompsInput["subject"],
  candidates: CompCandidate[],
): {
  filtered: CompCandidate[];
  basis: CompsOutput["selectionBasis"];
  reason: string;
} {
  if (subject.subdivision) {
    const subdivisionMatches = candidates.filter(
      (c) => c.subdivision === subject.subdivision,
    );
    if (subdivisionMatches.length >= 3) {
      return {
        filtered: subdivisionMatches,
        basis: "subdivision",
        reason: `Bounded to ${subject.subdivision} subdivision (${subdivisionMatches.length} candidates)`,
      };
    }
  }
  // Fall back to zip
  const zipMatches = candidates.filter((c) => c.zip === subject.zip);
  return {
    filtered: zipMatches.length > 0 ? zipMatches : candidates,
    basis: "zip",
    reason: subject.subdivision
      ? `Subdivision ${subject.subdivision} had <3 comps, fell back to zip ${subject.zip}`
      : `Selected by zip code ${subject.zip}`,
  };
}

/** Compute median of a numeric array */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Generate explanation for a comp */
function explain(
  subject: CompsInput["subject"],
  candidate: CompCandidate,
  score: number,
): string {
  const parts: string[] = [];
  if (candidate.beds === subject.beds) parts.push("same beds");
  if (Math.abs(candidate.sqft - subject.sqft) < subject.sqft * 0.1)
    parts.push("similar sqft");
  if (candidate.propertyType === subject.propertyType) parts.push("same type");
  if (Math.abs(candidate.yearBuilt - subject.yearBuilt) <= 5)
    parts.push("similar age");
  return `Score ${score}: ${parts.join(", ") || "comparable property"}. Sold ${candidate.soldDate} for $${candidate.soldPrice.toLocaleString()}.`;
}

/** Run the comps selection engine */
export function selectComps(input: CompsInput): CompsOutput {
  const maxComps = input.maxComps ?? 5;
  const deduped = dedupCandidates(input.candidates);
  const { filtered, basis, reason } = determineSelectionBasis(
    input.subject,
    deduped,
  );

  // Score and rank
  const scored = filtered.map((c) => ({
    candidate: c,
    similarityScore: scoreSimilarity(input.subject, c),
    explanation: "",
    sourceCitation: c.sourcePlatform,
  }));

  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  const topComps = scored.slice(0, maxComps);

  // Add explanations
  const comps: CompResult[] = topComps.map((c) => ({
    ...c,
    explanation: explain(input.subject, c.candidate, c.similarityScore),
  }));

  // Compute aggregates
  const soldPrices = comps.map((c) => c.candidate.soldPrice);
  const psfs = comps
    .filter((c) => c.candidate.sqft > 0)
    .map((c) => c.candidate.soldPrice / c.candidate.sqft);
  const doms = comps
    .filter((c) => c.candidate.dom != null)
    .map((c) => c.candidate.dom!);
  const saleToList = comps
    .filter((c) => c.candidate.listPrice && c.candidate.listPrice > 0)
    .map((c) => c.candidate.soldPrice / c.candidate.listPrice!);

  const aggregates: CompsAggregates = {
    medianSoldPrice: median(soldPrices),
    medianPricePerSqft: Number(median(psfs).toFixed(2)),
    medianDom: median(doms),
    medianSaleToListRatio: Number(median(saleToList).toFixed(3)),
  };

  return {
    comps,
    aggregates,
    selectionBasis: basis,
    selectionReason: reason,
    totalCandidates: input.candidates.length,
    dedupedCandidates: deduped.length,
  };
}
