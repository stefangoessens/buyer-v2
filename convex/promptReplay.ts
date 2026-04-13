"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import {
  compareReplaySnapshots,
  isReplayablePromptEngineType,
  replayPromptExecution,
} from "../src/lib/ai/promptReplay";
import { gateway } from "../src/lib/ai/gateway";

const engineTypeValidator = v.union(
  v.literal("pricing"),
  v.literal("comps"),
  v.literal("leverage"),
  v.literal("offer"),
  v.literal("cost"),
);

const reviewStateValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

const promptMetadataValidator = v.object({
  engineType: engineTypeValidator,
  promptKey: v.string(),
  version: v.string(),
  model: v.string(),
  author: v.string(),
  createdAt: v.string(),
  changeNotes: v.optional(v.string()),
});

const sourceOutputValidator = v.object({
  outputId: v.id("aiEngineOutputs"),
  propertyId: v.id("properties"),
  engineType: engineTypeValidator,
  promptKey: v.union(v.string(), v.null()),
  promptVersion: v.union(v.string(), v.null()),
  modelId: v.string(),
  generatedAt: v.string(),
  confidence: v.number(),
  reviewState: reviewStateValidator,
  inputSnapshot: v.union(v.string(), v.null()),
  outputSnapshot: v.string(),
  citations: v.array(v.string()),
});

const replayValidator = v.object({
  engineType: engineTypeValidator,
  promptKey: v.string(),
  promptVersion: v.string(),
  modelId: v.string(),
  confidence: v.number(),
  citations: v.array(v.string()),
  outputSnapshot: v.string(),
});

const comparisonValidator = v.object({
  identical: v.boolean(),
  changedPaths: v.array(v.string()),
  addedPaths: v.array(v.string()),
  removedPaths: v.array(v.string()),
  changedPathCount: v.number(),
  addedPathCount: v.number(),
  removedPathCount: v.number(),
});

export const replayHistoricalOutput = action({
  args: {
    outputId: v.id("aiEngineOutputs"),
    promptVersion: v.string(),
    promptKey: v.optional(v.string()),
  },
  returns: v.object({
    sourceOutput: sourceOutputValidator,
    prompt: promptMetadataValidator,
    replay: replayValidator,
    comparison: comparisonValidator,
  }),
  handler: async (ctx, args) => {
    const canAccessConsole = await ctx.runQuery(
      api.adminShell.canAccessConsole,
      {},
    );
    if (!canAccessConsole) {
      throw new Error("Not authorized to replay prompt versions");
    }

    const output = await ctx.runQuery(api.aiEngineOutputs.get, {
      outputId: args.outputId,
    });
    if (!output) {
      throw new Error("Historical engine output not found");
    }
    if (!isReplayablePromptEngineType(output.engineType)) {
      throw new Error(
        `Prompt replay is not supported for engine type "${output.engineType}"`,
      );
    }
    if (!output.inputSnapshot) {
      throw new Error(
        "Historical engine output is missing its input snapshot and cannot be replayed",
      );
    }

    const promptKey = args.promptKey ?? output.promptKey ?? "default";
    const prompt = await ctx.runQuery(internal.promptRegistry.getByVersion, {
      engineType: output.engineType,
      promptKey,
      version: args.promptVersion,
    });
    if (!prompt) {
      throw new Error(
        `Unknown prompt version "${args.promptVersion}" for ${output.engineType}/${promptKey}`,
      );
    }

    const replay = await replayPromptExecution({
      prompt: {
        engineType: output.engineType,
        promptKey,
        version: prompt.version,
        prompt: prompt.prompt,
        systemPrompt: prompt.systemPrompt,
        model: prompt.model,
      },
      inputSnapshot: output.inputSnapshot,
      invokeGateway: gateway,
    });

    return {
      sourceOutput: {
        outputId: output._id,
        propertyId: output.propertyId,
        engineType: output.engineType,
        promptKey: output.promptKey ?? null,
        promptVersion: output.promptVersion ?? null,
        modelId: output.modelId,
        generatedAt: output.generatedAt,
        confidence: output.confidence,
        reviewState: output.reviewState,
        inputSnapshot: output.inputSnapshot ?? null,
        outputSnapshot: output.output,
        citations: output.citations,
      },
      prompt: {
        engineType: output.engineType,
        promptKey,
        version: prompt.version,
        model: prompt.model,
        author: prompt.author,
        createdAt: prompt.createdAt,
        changeNotes: prompt.changeNotes,
      },
      replay,
      comparison: compareReplaySnapshots(output.output, replay.outputSnapshot),
    };
  },
});
