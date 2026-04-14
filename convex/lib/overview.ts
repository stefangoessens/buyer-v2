/**
 * Deal-room overview read model composer (KIN-844).
 *
 * Convex-side mirror of `src/lib/dealroom/overview.ts`. Keep in sync.
 */

export type SectionStatus = "available" | "pending" | "unavailable";

export interface SectionEnvelope<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
  confidence?: number;
}

export interface PricingSummary {
  fairValue: number;
  likelyAccepted: number;
  strongOpener: number;
  walkAway: number;
  overallConfidence: number;
  consensusEstimate: number;
  zestimate?: number;
  redfinEstimate?: number;
}

export interface LeverageSummary {
  score: number;
  topSignals: Array<{
    name: string;
    direction: "bullish" | "bearish" | "neutral";
    delta: number;
  }>;
  overallConfidence: number;
}

export interface CostSummary {
  monthlyMid: number;
  monthlyRange: { low: number; high: number };
  annualTotal: number;
  downPayment: number;
}

export interface OfferSummary {
  recommendedScenarioName: string;
  recommendedPrice: number;
  competitivenessScore: number;
  scenarioCount: number;
}

export type DealStatus =
  | "intake"
  | "analysis"
  | "tour_scheduled"
  | "offer_prep"
  | "offer_sent"
  | "under_contract"
  | "closing"
  | "closed"
  | "withdrawn";

export interface StatusBadge {
  status: DealStatus;
  label: string;
  tone: "neutral" | "positive" | "warning" | "critical";
  nextAction: string | null;
}

export type DealRoomOverviewVariant = "buyer_safe" | "internal";

interface BaseDealRoomOverview {
  dealRoomId: string;
  propertyId: string;
  updatedAt: string;
  variant: DealRoomOverviewVariant;
  status: StatusBadge;
  pricing: SectionEnvelope<PricingSummary>;
  leverage: SectionEnvelope<LeverageSummary>;
  cost: SectionEnvelope<CostSummary>;
  offer: SectionEnvelope<OfferSummary>;
  isComplete: boolean;
}

export interface BuyerSafeDealRoomOverview extends BaseDealRoomOverview {
  variant: "buyer_safe";
  internal?: undefined;
}

export interface InternalDealRoomOverview extends BaseDealRoomOverview {
  variant: "internal";
  internal: {
    providedBy: string[];
    pendingEngines: string[];
    lastFullRefreshAt: string | null;
  };
}

export type DealRoomOverview =
  | BuyerSafeDealRoomOverview
  | InternalDealRoomOverview;

export interface RawEngineOutput {
  engineType: string;
  output: string;
  confidence: number;
  reviewState: "pending" | "approved" | "rejected";
  generatedAt: string;
}

export interface OverviewInputs {
  dealRoomId: string;
  propertyId: string;
  dealStatus: DealStatus;
  updatedAt: string;
  engines: RawEngineOutput[];
  latestOffer?: {
    scenarioName: string;
    price: number;
    competitivenessScore: number;
    scenarioCount: number;
  };
  propertyAvms?: {
    zestimate?: number;
    redfinEstimate?: number;
  };
}

export function composeOverview(
  inputs: OverviewInputs,
  options: { forRole: "buyer" | "broker" | "admin" } = { forRole: "buyer" },
): DealRoomOverview {
  const engineByType = new Map<string, RawEngineOutput>();
  for (const engine of inputs.engines) {
    const existing = engineByType.get(engine.engineType);
    if (!existing || engine.generatedAt > existing.generatedAt) {
      engineByType.set(engine.engineType, engine);
    }
  }

  const pricing = composePricingSection(
    engineByType.get("pricing"),
    inputs.propertyAvms,
  );
  const leverage = composeLeverageSection(engineByType.get("leverage"));
  const cost = composeCostSection(engineByType.get("cost"));
  const offer = composeOfferSection(
    engineByType.get("offer"),
    inputs.latestOffer,
  );

  const isComplete =
    pricing.status === "available" &&
    leverage.status === "available" &&
    cost.status === "available" &&
    offer.status === "available";

  const overview: DealRoomOverview = {
    dealRoomId: inputs.dealRoomId,
    propertyId: inputs.propertyId,
    updatedAt: inputs.updatedAt,
    variant: "buyer_safe",
    status: buildStatusBadge(inputs.dealStatus),
    pricing,
    leverage,
    cost,
    offer,
    isComplete,
  };

  if (options.forRole === "broker" || options.forRole === "admin") {
    return {
      ...overview,
      variant: "internal",
      internal: buildInternalSummary(inputs.engines),
    };
  }

  return overview;
}

function composePricingSection(
  raw: RawEngineOutput | undefined,
  propertyAvms: OverviewInputs["propertyAvms"],
): SectionEnvelope<PricingSummary> {
  if (!raw) {
    return {
      status: "unavailable",
      data: null,
      reason: "Pricing engine has not produced output for this deal room.",
    };
  }
  // reviewState "pending" falls through to the parse/render block so
  // buyers see the engine output. reviewState stays in the DB for the
  // broker review queue.
  if (raw.reviewState === "rejected") {
    return {
      status: "unavailable",
      data: null,
      reason: "Pricing analysis was rejected during review.",
    };
  }

  try {
    const parsed = JSON.parse(raw.output) as {
      fairValue: { value: number };
      likelyAccepted: { value: number };
      strongOpener: { value: number };
      walkAway: { value: number };
      overallConfidence: number;
      consensusEstimate: number;
    };
    return {
      status: "available",
      data: {
        fairValue: parsed.fairValue.value,
        likelyAccepted: parsed.likelyAccepted.value,
        strongOpener: parsed.strongOpener.value,
        walkAway: parsed.walkAway.value,
        overallConfidence: parsed.overallConfidence,
        consensusEstimate: parsed.consensusEstimate,
        zestimate: propertyAvms?.zestimate,
        redfinEstimate: propertyAvms?.redfinEstimate,
      },
      confidence: raw.confidence,
    };
  } catch {
    return {
      status: "unavailable",
      data: null,
      reason: "Pricing engine output could not be parsed.",
    };
  }
}

function composeLeverageSection(
  raw: RawEngineOutput | undefined,
): SectionEnvelope<LeverageSummary> {
  if (!raw) {
    return {
      status: "unavailable",
      data: null,
      reason: "Leverage engine has not produced output for this deal room.",
    };
  }
  // reviewState "pending" falls through — see composePricingSection.
  if (raw.reviewState === "rejected") {
    return {
      status: "unavailable",
      data: null,
      reason: "Leverage analysis was rejected during review.",
    };
  }

  try {
    const parsed = JSON.parse(raw.output) as {
      score: number;
      overallConfidence: number;
      signals: Array<{
        name: string;
        direction: "bullish" | "bearish" | "neutral";
        delta: number;
      }>;
    };
    const topSignals = parsed.signals
      .slice()
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
      .map((s) => ({
        name: s.name,
        direction: s.direction,
        delta: s.delta,
      }));
    return {
      status: "available",
      data: {
        score: parsed.score,
        topSignals,
        overallConfidence: parsed.overallConfidence,
      },
      confidence: raw.confidence,
    };
  } catch {
    return {
      status: "unavailable",
      data: null,
      reason: "Leverage engine output could not be parsed.",
    };
  }
}

function composeCostSection(
  raw: RawEngineOutput | undefined,
): SectionEnvelope<CostSummary> {
  if (!raw) {
    return {
      status: "unavailable",
      data: null,
      reason: "Cost engine has not produced output for this deal room.",
    };
  }
  // reviewState "pending" falls through — see composePricingSection.
  if (raw.reviewState === "rejected") {
    return {
      status: "unavailable",
      data: null,
      reason: "Cost analysis was rejected during review.",
    };
  }

  try {
    const parsed = JSON.parse(raw.output) as {
      totalMonthlyMid: number;
      totalMonthlyLow: number;
      totalMonthlyHigh: number;
      totalAnnual: number;
      upfrontCosts: { downPayment: number };
    };
    return {
      status: "available",
      data: {
        monthlyMid: parsed.totalMonthlyMid,
        monthlyRange: {
          low: parsed.totalMonthlyLow,
          high: parsed.totalMonthlyHigh,
        },
        annualTotal: parsed.totalAnnual,
        downPayment: parsed.upfrontCosts.downPayment,
      },
      confidence: raw.confidence,
    };
  } catch {
    return {
      status: "unavailable",
      data: null,
      reason: "Cost engine output could not be parsed.",
    };
  }
}

function composeOfferSection(
  raw: RawEngineOutput | undefined,
  latestOffer: OverviewInputs["latestOffer"],
): SectionEnvelope<OfferSummary> {
  if (latestOffer) {
    return {
      status: "available",
      data: {
        recommendedScenarioName: latestOffer.scenarioName,
        recommendedPrice: latestOffer.price,
        competitivenessScore: latestOffer.competitivenessScore,
        scenarioCount: latestOffer.scenarioCount,
      },
    };
  }

  if (!raw) {
    return {
      status: "unavailable",
      data: null,
      reason: "Offer engine has not produced scenarios for this deal room.",
    };
  }
  // reviewState "pending" falls through — see composePricingSection.
  if (raw.reviewState === "rejected") {
    return {
      status: "unavailable",
      data: null,
      reason: "Offer scenarios were rejected during review.",
    };
  }

  try {
    const parsed = JSON.parse(raw.output) as {
      scenarios: Array<{
        name: string;
        price: number;
        competitivenessScore: number;
      }>;
      recommendedIndex: number;
    };
    const recommended = parsed.scenarios[parsed.recommendedIndex];
    if (!recommended) {
      return {
        status: "unavailable",
        data: null,
        reason: "Offer engine produced no recommended scenario.",
      };
    }
    return {
      status: "available",
      data: {
        recommendedScenarioName: recommended.name,
        recommendedPrice: recommended.price,
        competitivenessScore: recommended.competitivenessScore,
        scenarioCount: parsed.scenarios.length,
      },
      confidence: raw.confidence,
    };
  } catch {
    return {
      status: "unavailable",
      data: null,
      reason: "Offer engine output could not be parsed.",
    };
  }
}

export function buildStatusBadge(status: DealStatus): StatusBadge {
  switch (status) {
    case "intake":
      return {
        status,
        label: "Gathering details",
        tone: "neutral",
        nextAction: "Review property details",
      };
    case "analysis":
      return {
        status,
        label: "Analysis in progress",
        tone: "neutral",
        nextAction: "Check back shortly for insights",
      };
    case "tour_scheduled":
      return {
        status,
        label: "Tour scheduled",
        tone: "positive",
        nextAction: "Prepare questions for your tour",
      };
    case "offer_prep":
      return {
        status,
        label: "Preparing offer",
        tone: "positive",
        nextAction: "Review offer scenarios",
      };
    case "offer_sent":
      return {
        status,
        label: "Offer submitted",
        tone: "warning",
        nextAction: "Awaiting seller response",
      };
    case "under_contract":
      return {
        status,
        label: "Under contract",
        tone: "positive",
        nextAction: "Track closing milestones",
      };
    case "closing":
      return {
        status,
        label: "Closing",
        tone: "warning",
        nextAction: "Prepare for closing day",
      };
    case "closed":
      return { status, label: "Closed", tone: "positive", nextAction: null };
    case "withdrawn":
      return {
        status,
        label: "Withdrawn",
        tone: "critical",
        nextAction: null,
      };
  }
}

function buildInternalSummary(
  engines: RawEngineOutput[],
): NonNullable<DealRoomOverview["internal"]> {
  // De-duplicate by engine type first — pick the latest output per
  // type, matching what `composeOverview` uses to build the visible
  // sections. Otherwise a stale `pending` row from an older run could
  // coexist with a newer `approved` row and report pending work that
  // no longer blocks the overview.
  const latestByType = new Map<string, RawEngineOutput>();
  for (const engine of engines) {
    const existing = latestByType.get(engine.engineType);
    if (!existing || engine.generatedAt > existing.generatedAt) {
      latestByType.set(engine.engineType, engine);
    }
  }
  const latest = Array.from(latestByType.values());

  const providedBy = Array.from(latestByType.keys()).sort();
  const pendingEngines = latest
    .filter((e) => e.reviewState === "pending")
    .map((e) => e.engineType)
    .sort();
  const approvedEngines = latest.filter((e) => e.reviewState === "approved");
  const lastFullRefreshAt =
    approvedEngines.length > 0
      ? approvedEngines.map((e) => e.generatedAt).sort().slice(-1)[0]
      : null;

  return { providedBy, pendingEngines, lastFullRefreshAt };
}
