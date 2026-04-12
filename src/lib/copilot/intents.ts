/**
 * Intent classifier for the buyer copilot.
 *
 * Rule-based first pass — deterministic, testable, offline. The orchestrator
 * only falls back to an LLM classifier when the rule-based pass returns a
 * confidence below FALLBACK_THRESHOLD. This keeps the hot path cheap and
 * lets us pin ≥90% of fixture accuracy to pure code.
 */

export type CopilotIntent =
  | "pricing"
  | "comps"
  | "costs"
  | "leverage"
  | "risks"
  | "documents"
  | "offer"
  | "scheduling"
  | "agreement"
  | "other";

export interface IntentClassification {
  intent: CopilotIntent;
  confidence: number; // 0-1
  method: "rule" | "llm" | "fallback";
  matchedRule?: string;
}

export const FALLBACK_THRESHOLD = 0.55;
export const HIGH_CONFIDENCE = 0.85;

interface RuleDef {
  intent: CopilotIntent;
  name: string;
  patterns: RegExp[];
  weight: number;
}

const RULES: ReadonlyArray<RuleDef> = [
  {
    intent: "pricing",
    name: "pricing:value",
    patterns: [
      /\bworth\b/i,
      /\bhow\s+much\s+is\s+(?:this|the|it)\b/i,
      /\bfair\s+(?:value|price|market)\b/i,
      /\b(?:over|under)priced\b/i,
      /\bzestimate\b/i,
      /\brealtor\s+estimate\b/i,
      /\bredfin\s+estimate\b/i,
      /\bwalk[- ]?away\s+price\b/i,
      /\blist\s+price\s+(?:is\s+)?(?:too\s+)?high\b/i,
      /\bprice\s+(?:estimate|range|target)\b/i,
    ],
    weight: 0.95,
  },
  {
    intent: "comps",
    name: "comps:similar",
    patterns: [
      /\bcomparable(?:s)?\b/i,
      /\bcomps?\b/i,
      /\bsimilar\s+(?:homes?|houses?|properties)\b/i,
      /\brecent(?:ly)?\s+sold\b/i,
      /\bwhat\s+(?:did|have)\s+.*(?:sell|sold)\s+for\b/i,
      /\bsold\s+(?:in|near|around)\s+the\s+neighborhood\b/i,
    ],
    weight: 0.93,
  },
  {
    intent: "costs",
    name: "costs:monthly",
    patterns: [
      /\bmonthly\s+(?:cost|payment|mortgage|pmt)\b/i,
      /\bhow\s+much\s+will\s+(?:this|it)\s+cost\b/i,
      /\bproperty\s+tax(?:es)?\b/i,
      /\binsurance\s+cost\b/i,
      /\bHOA\s+fee(?:s)?\b/i,
      /\btotal\s+cost\s+of\s+ownership\b/i,
      /\bclosing\s+costs?\b/i,
    ],
    weight: 0.92,
  },
  {
    intent: "leverage",
    name: "leverage:negotiation",
    patterns: [
      /\bwhy\s+(?:would|will)\s+(?:the\s+)?seller\s+(?:accept|take)\s+less\b/i,
      /\bleverage\b/i,
      /\bseller\s+(?:motivated|desperate|pressure)\b/i,
      /\bnegotiat(?:ion|ing|e)\b/i,
      /\bdays\s+on\s+(?:the\s+)?market\b/i,
      /\bDOM\b/,
      /\bprice\s+reduction(?:s)?\b/i,
      /\bhow\s+(?:low|much\s+lower)\s+can\s+(?:we|i)\s+go\b/i,
    ],
    weight: 0.9,
  },
  {
    intent: "risks",
    name: "risks:flags",
    patterns: [
      /\brisk(?:s|y)?\b/i,
      /\bred\s+flag(?:s)?\b/i,
      /\bwhat\s+(?:could|might)\s+go\s+wrong\b/i,
      /\bdeal\s*break(?:er|ers)?\b/i,
      /\bflood\s+zone\b/i,
      /\bhurricane\b/i,
      /\bsinkhole\b/i,
      /\bwind\s+mitigation\b/i,
    ],
    weight: 0.88,
  },
  {
    intent: "documents",
    name: "documents:disclosures",
    patterns: [
      /\bdisclosure(?:s)?\b/i,
      /\bseller\s+disclosure\b/i,
      /\binspection\s+report\b/i,
      /\bHOA\s+docs?\b/i,
      /\bcondo\s+docs?\b/i,
      /\b(?:what|which)\s+document(?:s)?\b/i,
      /\bwhat\s+(?:does|did)\s+the\s+.*\s+say\b/i,
      /\bsurvey\s+report\b/i,
      /\bappraisal\s+(?:report|document)\b/i,
    ],
    weight: 0.87,
  },
  {
    intent: "offer",
    name: "offer:craft",
    patterns: [
      /\bmake\s+an\s+offer\b/i,
      /\bhow\s+much\s+should\s+(?:i|we)\s+offer\b/i,
      /\boffer\s+(?:price|amount|strategy)\b/i,
      /\bover\s+asking\b/i,
      /\bunder\s+(?:list|asking)\b/i,
      /\b(?:bid|bidding)\s+war\b/i,
      /\bearnest\s+money\b/i,
      /\bcontingenc(?:y|ies)\b/i,
      /\bwaive\s+.*contingenc/i,
      /\bclosing\s+window\b/i,
    ],
    weight: 0.9,
  },
  {
    intent: "scheduling",
    name: "scheduling:tour",
    patterns: [
      /\bschedule\s+a?\s*(?:tour|showing|walkthrough|visit)\b/i,
      /\bcan\s+(?:we|i)\s+(?:tour|see|visit|walk\s*through)\b/i,
      /\bwhen\s+can\s+(?:we|i)\s+(?:tour|see|visit)\b/i,
      /\btour\s+(?:tomorrow|today|this\s+week|on)\b/i,
      /\bavailabilit(?:y|ies)\b/i,
      /\bopen\s+house\b/i,
    ],
    weight: 0.93,
  },
  {
    intent: "agreement",
    name: "agreement:paperwork",
    patterns: [
      /\bbuyer('s)?\s+agreement\b/i,
      /\brepresentation\s+agreement\b/i,
      /\bdo\s+i\s+(?:have\s+to|need\s+to)\s+sign\b/i,
      /\btour\s+pass\b/i,
      /\bagency\s+disclosure\b/i,
      /\bcompensation\s+agreement\b/i,
      /\bwhat\s+am\s+i\s+signing\b/i,
    ],
    weight: 0.9,
  },
];

const OFF_TOPIC_SIGNALS: ReadonlyArray<RegExp> = [
  /\b(?:weather|sports|president|politics|stock\s+market|recipe|joke)\b/i,
  /\bwho\s+(?:is|are)\s+(?:you|the\s+president)\b/i,
  /\bwrite\s+(?:a|me)\s+(?:poem|song|story|email)\b/i,
];

export function classifyIntentRuleBased(
  question: string,
): IntentClassification {
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    return { intent: "other", confidence: 0, method: "rule" };
  }

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) {
        return {
          intent: rule.intent,
          confidence: rule.weight,
          method: "rule",
          matchedRule: rule.name,
        };
      }
    }
  }

  for (const offTopic of OFF_TOPIC_SIGNALS) {
    if (offTopic.test(trimmed)) {
      return {
        intent: "other",
        confidence: 0.95,
        method: "rule",
        matchedRule: "other:off-topic",
      };
    }
  }

  return { intent: "other", confidence: 0.3, method: "rule" };
}

export function isHighConfidence(
  classification: IntentClassification,
): boolean {
  return classification.confidence >= HIGH_CONFIDENCE;
}

export function needsLlmFallback(
  classification: IntentClassification,
): boolean {
  return classification.confidence < FALLBACK_THRESHOLD;
}

export const ALL_INTENTS: ReadonlyArray<CopilotIntent> = [
  "pricing",
  "comps",
  "costs",
  "leverage",
  "risks",
  "documents",
  "offer",
  "scheduling",
  "agreement",
  "other",
];
