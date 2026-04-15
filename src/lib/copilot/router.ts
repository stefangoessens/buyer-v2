/**
 * Intent → engine router for the copilot.
 *
 * Pure mapping. The orchestrator calls this to know WHICH engine to hit
 * for a given intent, and the fulfillment status when an engine is not
 * yet available. No I/O, no AI calls here.
 */

import type { CopilotIntent } from "./intents";

export type CopilotEngineKey =
  | "pricing"
  | "comps"
  | "cost"
  | "leverage"
  | "case_synthesis"
  | "offer"
  | "docs"
  | "scheduling"
  | "agreement"
  | "guarded_general";

export type EngineAvailability = "available" | "planned";

export interface RouteDefinition {
  intent: CopilotIntent;
  engine: CopilotEngineKey;
  availability: EngineAvailability;
  description: string;
}

const ROUTES: ReadonlyArray<RouteDefinition> = [
  {
    intent: "pricing",
    engine: "pricing",
    availability: "available",
    description: "Pricing panel engine (KIN-786)",
  },
  {
    intent: "comps",
    engine: "comps",
    availability: "available",
    description: "Comps selection engine (KIN-831)",
  },
  {
    intent: "costs",
    engine: "cost",
    availability: "available",
    description: "Cost engine (KIN-787)",
  },
  {
    intent: "leverage",
    engine: "leverage",
    availability: "available",
    description: "Leverage engine (KIN-788)",
  },
  {
    intent: "risks",
    engine: "case_synthesis",
    availability: "planned",
    description: "Case synthesis (KIN-854) — planned",
  },
  {
    intent: "offer",
    engine: "offer",
    availability: "available",
    description: "Offer scenario engine (KIN-789)",
  },
  {
    intent: "documents",
    engine: "docs",
    availability: "available",
    description: "Disclosure parser engine (KIN-1078)",
  },
  {
    intent: "scheduling",
    engine: "scheduling",
    availability: "planned",
    description: "Tour scheduling — planned",
  },
  {
    intent: "agreement",
    engine: "agreement",
    availability: "planned",
    description: "Agreement lifecycle — planned",
  },
  {
    intent: "other",
    engine: "guarded_general",
    availability: "available",
    description:
      "Scope-guarded general response — ≤3 sentences, no advice outside home buying.",
  },
];

const BY_INTENT: ReadonlyMap<CopilotIntent, RouteDefinition> = new Map(
  ROUTES.map((r) => [r.intent, r]),
);

export function routeForIntent(intent: CopilotIntent): RouteDefinition {
  const route = BY_INTENT.get(intent);
  if (!route) {
    return {
      intent: "other",
      engine: "guarded_general",
      availability: "available",
      description:
        "Fallback guarded response for unknown intent — never bypass engines.",
    };
  }
  return route;
}

export function allRoutes(): ReadonlyArray<RouteDefinition> {
  return ROUTES;
}

export function isEngineAvailable(intent: CopilotIntent): boolean {
  return routeForIntent(intent).availability === "available";
}
