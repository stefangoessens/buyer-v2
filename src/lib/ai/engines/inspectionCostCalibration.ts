/**
 * Inspection cost calibration (KIN-1081) — pure helper.
 *
 * Hybrid cost-estimation gate. The LLM emits a buyer-friendly title +
 * severity + (optionally) a rough cost hint; this module decides
 * whether to surface a dollar range or a qualitative tier, and how
 * confident the estimate is.
 *
 * Why a separate module: the gate is testable in isolation and can
 * grow a richer rules table later without touching the parser prompt.
 *
 * Public contract: `calibrateCost(input)` always returns a result.
 * Every result carries the same disclaimer string so the buyer-facing
 * surface can render it consistently.
 */
import type { BuyerSeverity, InspectionFinding, InspectionSystem } from "./inspectionParser";

export interface CostCalibrationInput {
  finding: Omit<
    InspectionFinding,
    | "estimatedCostLowUsd"
    | "estimatedCostHighUsd"
    | "costEstimateConfidence"
    | "costEstimateBasis"
    | "costTier"
  >;
  llmSuggestedCost?: { low: number; high: number; confidence: number };
}

export interface CostCalibrationResult {
  estimatedCostLowUsd?: number;
  estimatedCostHighUsd?: number;
  costEstimateConfidence?: number;
  costEstimateBasis?: "llm_only" | "llm_plus_rule";
  costTier?: "significant" | "moderate" | "minor";
  disclaimerText: string;
}

export const COST_DISCLAIMER =
  "Market-based estimate, not a contractor quote — always get 3 real quotes.";

const HIGH_CONFIDENCE_FLOOR = 0.7;
const RULE_ASSISTED_CONFIDENCE_CAP = 0.9;

/**
 * Repair-class lookup. Each entry maps a system + a set of title
 * keywords to a base dollar range. Order matters within a system —
 * the first matching keyword wins so more specific entries should
 * come first (e.g. "fpe panel" before generic "panel").
 *
 * Keyword matching is lowercase + substring. The table is intentionally
 * coarse — broker review still gates everything; we just want a
 * defensible floor/ceiling for the 80% case.
 */
interface RepairClass {
  system: InspectionSystem;
  keywords: string[];
  low: number;
  high: number;
  defaultTier: "significant" | "moderate" | "minor";
}

const REPAIR_CLASSES: RepairClass[] = [
  // Roof
  {
    system: "roof",
    keywords: ["roof replacement", "replace roof", "new roof", "reroof", "re-roof"],
    low: 8000,
    high: 25000,
    defaultTier: "significant",
  },
  {
    system: "roof",
    keywords: ["roof repair", "shingle repair", "flashing"],
    low: 500,
    high: 3000,
    defaultTier: "moderate",
  },
  // Electrical
  {
    system: "electrical",
    keywords: ["fpe panel", "federal pacific", "zinsco", "panel replacement"],
    low: 3000,
    high: 5000,
    defaultTier: "significant",
  },
  {
    system: "electrical",
    keywords: ["aluminum wiring", "knob and tube", "rewire"],
    low: 6000,
    high: 15000,
    defaultTier: "significant",
  },
  // HVAC
  {
    system: "hvac",
    keywords: ["hvac replacement", "air handler replacement", "condenser replacement"],
    low: 6000,
    high: 15000,
    defaultTier: "significant",
  },
  {
    system: "hvac",
    keywords: ["hvac service", "duct repair", "refrigerant recharge"],
    low: 300,
    high: 1500,
    defaultTier: "moderate",
  },
  // Plumbing
  {
    system: "plumbing",
    keywords: ["polybutylene", "repipe"],
    low: 8000,
    high: 15000,
    defaultTier: "significant",
  },
  {
    system: "plumbing",
    keywords: ["water heater replacement", "replace water heater"],
    low: 800,
    high: 2000,
    defaultTier: "moderate",
  },
  {
    system: "plumbing",
    keywords: ["leak repair", "fixture replacement"],
    low: 200,
    high: 1500,
    defaultTier: "minor",
  },
  // Pest / WDO
  {
    system: "pest",
    keywords: ["wdo treatment", "termite treatment", "wood-destroying organism"],
    low: 1500,
    high: 5000,
    defaultTier: "moderate",
  },
  // Structural
  {
    system: "structural",
    keywords: ["foundation", "structural repair", "settlement"],
    low: 5000,
    high: 25000,
    defaultTier: "significant",
  },
];

/**
 * Map buyer severity → qualitative tier. This is the fallback path when
 * we cannot put a number on a finding (no LLM hint, low confidence,
 * unknown repair class).
 */
function severityToTier(
  severity: BuyerSeverity,
  system: InspectionSystem,
): "significant" | "moderate" | "minor" {
  if (severity === "life_safety") return "significant";
  if (severity === "major_repair") {
    // Major repairs in cosmetic systems (interior, grounds) lean moderate;
    // structural/electrical/plumbing/roof/hvac stay significant.
    if (system === "interior" || system === "grounds" || system === "exterior") {
      return "moderate";
    }
    return "significant";
  }
  if (severity === "monitor") {
    return system === "structural" || system === "electrical" || system === "plumbing"
      ? "moderate"
      : "minor";
  }
  return "minor";
}

function findRepairClass(
  system: InspectionSystem,
  title: string,
): RepairClass | null {
  const lower = title.toLowerCase();
  for (const cls of REPAIR_CLASSES) {
    if (cls.system !== system) continue;
    for (const kw of cls.keywords) {
      if (lower.includes(kw)) return cls;
    }
  }
  return null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Decide cost output for a single inspection finding. Always returns a
 * result with the canonical disclaimer; either dollar range OR
 * qualitative tier is populated, never both.
 */
export function calibrateCost(input: CostCalibrationInput): CostCalibrationResult {
  const { finding, llmSuggestedCost } = input;
  const repairClass = findRepairClass(finding.system, finding.title);
  const llmConfidence = llmSuggestedCost ? clamp01(llmSuggestedCost.confidence) : 0;

  // Path 1 — known repair class + high-confidence LLM hint → dollar range
  // (rule-assisted). We anchor on the rule-table's low/high but blend
  // with the LLM range when both agree, capping confidence so we never
  // claim "almost certain" on a desk estimate.
  if (repairClass && llmSuggestedCost && llmConfidence >= HIGH_CONFIDENCE_FLOOR) {
    const low = Math.min(repairClass.low, llmSuggestedCost.low);
    const high = Math.max(repairClass.high, llmSuggestedCost.high);
    return {
      estimatedCostLowUsd: Math.round(low),
      estimatedCostHighUsd: Math.round(high),
      costEstimateConfidence: Math.min(llmConfidence, RULE_ASSISTED_CONFIDENCE_CAP),
      costEstimateBasis: "llm_plus_rule",
      disclaimerText: COST_DISCLAIMER,
    };
  }

  // Path 2 — known repair class but no/low-confidence LLM hint → still
  // surface a tier rather than guessing dollars. Brokers can override
  // later if they want a number.
  if (repairClass) {
    return {
      costTier: repairClass.defaultTier,
      disclaimerText: COST_DISCLAIMER,
    };
  }

  // Path 3 — no repair class, but the LLM was confident → give the buyer
  // the LLM range straight, basis llm_only, capped confidence.
  if (llmSuggestedCost && llmConfidence >= HIGH_CONFIDENCE_FLOOR) {
    return {
      estimatedCostLowUsd: Math.round(llmSuggestedCost.low),
      estimatedCostHighUsd: Math.round(llmSuggestedCost.high),
      costEstimateConfidence: Math.min(llmConfidence, RULE_ASSISTED_CONFIDENCE_CAP),
      costEstimateBasis: "llm_only",
      disclaimerText: COST_DISCLAIMER,
    };
  }

  // Path 4 — fall through to qualitative tier from severity.
  return {
    costTier: severityToTier(finding.buyerSeverity, finding.system),
    disclaimerText: COST_DISCLAIMER,
  };
}
