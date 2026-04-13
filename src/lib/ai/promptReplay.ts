import type {
  GatewayRequest,
  GatewayResult,
} from "./types";
import {
  buildPricingRequest,
  computeConsensus,
  parsePricingResponse,
} from "./engines/pricing";
import { selectComps } from "./engines/comps";
import { analyzeLeverage } from "./engines/leverage";
import { generateOfferScenarios } from "./engines/offer";
import { computeOwnershipCosts } from "./engines/cost";
import type {
  CompsInput,
  CostInput,
  LeverageInput,
  OfferInput,
  PricingInput,
} from "./engines/types";
import type { PromptRegistryEngineType } from "../../../packages/shared/src/prompt-registry";

export const REPLAYABLE_PROMPT_ENGINE_TYPES = [
  "pricing",
  "comps",
  "leverage",
  "offer",
  "cost",
] as const;

export type ReplayablePromptEngineType =
  (typeof REPLAYABLE_PROMPT_ENGINE_TYPES)[number];

export interface ReplayPromptDefinition {
  engineType: ReplayablePromptEngineType;
  promptKey: string;
  version: string;
  prompt: string;
  systemPrompt?: string;
  model: string;
}

export interface ReplayExecutionResult {
  engineType: ReplayablePromptEngineType;
  promptKey: string;
  promptVersion: string;
  modelId: string;
  confidence: number;
  citations: string[];
  outputSnapshot: string;
}

export interface ReplayComparisonSummary {
  identical: boolean;
  changedPaths: string[];
  addedPaths: string[];
  removedPaths: string[];
  changedPathCount: number;
  addedPathCount: number;
  removedPathCount: number;
}

export type GatewayInvoker = (
  request: GatewayRequest,
) => Promise<GatewayResult>;

function parseInputSnapshot<T>(inputSnapshot: string): T {
  try {
    return JSON.parse(inputSnapshot) as T;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown parse failure";
    throw new Error(`Invalid historical input snapshot: ${message}`);
  }
}

export function isReplayablePromptEngineType(
  engineType: PromptRegistryEngineType | string,
): engineType is ReplayablePromptEngineType {
  return REPLAYABLE_PROMPT_ENGINE_TYPES.includes(
    engineType as ReplayablePromptEngineType,
  );
}

export async function replayPromptExecution(args: {
  prompt: ReplayPromptDefinition;
  inputSnapshot: string;
  invokeGateway: GatewayInvoker;
}): Promise<ReplayExecutionResult> {
  const { prompt } = args;

  switch (prompt.engineType) {
    case "pricing": {
      const input = parseInputSnapshot<PricingInput>(args.inputSnapshot);
      const request = buildPricingRequest(input, prompt.prompt, prompt.systemPrompt);
      const response = await args.invokeGateway(request);
      if (!response.success) {
        throw new Error(
          `Pricing replay failed: ${response.error.message}`,
        );
      }

      const { consensus, spread, sources } = computeConsensus(input);
      const replayed = parsePricingResponse(
        response.data.content,
        input,
        consensus,
        spread,
        sources,
      );
      if (!replayed) {
        throw new Error("Pricing replay returned an invalid response payload");
      }

      return {
        engineType: prompt.engineType,
        promptKey: prompt.promptKey,
        promptVersion: prompt.version,
        modelId: response.data.usage.model,
        confidence: replayed.overallConfidence,
        citations: replayed.estimateSources,
        outputSnapshot: JSON.stringify(replayed),
      };
    }
    case "comps": {
      const input = parseInputSnapshot<{
        subject: CompsInput["subject"];
        candidates: CompsInput["candidates"];
      }>(args.inputSnapshot);
      const replayed = selectComps(input);

      return {
        engineType: prompt.engineType,
        promptKey: prompt.promptKey,
        promptVersion: prompt.version,
        modelId: prompt.model,
        confidence:
          replayed.comps.length >= 3 ? 0.85 : replayed.comps.length >= 1 ? 0.6 : 0.3,
        citations: replayed.comps.map((comp) => comp.sourceCitation),
        outputSnapshot: JSON.stringify(replayed),
      };
    }
    case "leverage": {
      const input = parseInputSnapshot<LeverageInput>(args.inputSnapshot);
      const replayed = analyzeLeverage(input);

      return {
        engineType: prompt.engineType,
        promptKey: prompt.promptKey,
        promptVersion: prompt.version,
        modelId: prompt.model,
        confidence: replayed.overallConfidence,
        citations: replayed.signals.map((signal) => signal.citation),
        outputSnapshot: JSON.stringify(replayed),
      };
    }
    case "offer": {
      const input = parseInputSnapshot<OfferInput>(args.inputSnapshot);
      const replayed = generateOfferScenarios(input);

      return {
        engineType: prompt.engineType,
        promptKey: prompt.promptKey,
        promptVersion: prompt.version,
        modelId: prompt.model,
        confidence: 0.75,
        citations: ["pricing_engine", "leverage_engine"],
        outputSnapshot: JSON.stringify(replayed),
      };
    }
    case "cost": {
      const input = parseInputSnapshot<CostInput>(args.inputSnapshot);
      const replayed = computeOwnershipCosts(input);

      return {
        engineType: prompt.engineType,
        promptKey: prompt.promptKey,
        promptVersion: prompt.version,
        modelId: prompt.model,
        confidence: 0.75,
        citations: replayed.lineItems
          .filter((lineItem) => lineItem.source === "fact")
          .map((lineItem) => lineItem.label),
        outputSnapshot: JSON.stringify(replayed),
      };
    }
  }
}

function parseStructuredSnapshot(snapshot: string): unknown {
  try {
    return JSON.parse(snapshot);
  } catch {
    return snapshot;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareValues(
  baseline: unknown,
  replay: unknown,
  path: string,
  changedPaths: Set<string>,
  addedPaths: Set<string>,
  removedPaths: Set<string>,
) {
  const currentPath = path || "$";

  if (Array.isArray(baseline) && Array.isArray(replay)) {
    const limit = Math.max(baseline.length, replay.length);
    for (let index = 0; index < limit; index += 1) {
      const nextPath = `${currentPath}[${index}]`;
      if (index >= baseline.length) {
        addedPaths.add(nextPath);
        continue;
      }
      if (index >= replay.length) {
        removedPaths.add(nextPath);
        continue;
      }
      compareValues(
        baseline[index],
        replay[index],
        nextPath,
        changedPaths,
        addedPaths,
        removedPaths,
      );
    }
    return;
  }

  if (isPlainObject(baseline) && isPlainObject(replay)) {
    const keys = new Set([
      ...Object.keys(baseline),
      ...Object.keys(replay),
    ]);
    for (const key of keys) {
      const nextPath = currentPath === "$" ? key : `${currentPath}.${key}`;
      if (!(key in baseline)) {
        addedPaths.add(nextPath);
        continue;
      }
      if (!(key in replay)) {
        removedPaths.add(nextPath);
        continue;
      }
      compareValues(
        baseline[key],
        replay[key],
        nextPath,
        changedPaths,
        addedPaths,
        removedPaths,
      );
    }
    return;
  }

  if (!Object.is(baseline, replay)) {
    changedPaths.add(currentPath);
  }
}

export function compareReplaySnapshots(
  baselineSnapshot: string,
  replaySnapshot: string,
): ReplayComparisonSummary {
  const baseline = parseStructuredSnapshot(baselineSnapshot);
  const replay = parseStructuredSnapshot(replaySnapshot);

  const changedPaths = new Set<string>();
  const addedPaths = new Set<string>();
  const removedPaths = new Set<string>();

  compareValues(
    baseline,
    replay,
    "",
    changedPaths,
    addedPaths,
    removedPaths,
  );

  return {
    identical:
      changedPaths.size === 0 &&
      addedPaths.size === 0 &&
      removedPaths.size === 0,
    changedPaths: [...changedPaths].sort(),
    addedPaths: [...addedPaths].sort(),
    removedPaths: [...removedPaths].sort(),
    changedPathCount: changedPaths.size,
    addedPathCount: addedPaths.size,
    removedPathCount: removedPaths.size,
  };
}
