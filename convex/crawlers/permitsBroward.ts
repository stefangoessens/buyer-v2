"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * Broward Building Department permits lookup action (KIN-1073).
 *
 * Mirrors the PAPA action pattern from KIN-1072. NOT auto-triggered
 * tonight — orchestrator hookup waits for the Browser Use Cloud API
 * key to be provisioned. Manual invocation only until then.
 *
 * Persists via internal.crawlers.permitsBrowardPersist.persist.
 */
export const lookupAndPersist = internalAction({
  args: { propertyId: v.id("properties") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const property = await ctx.runQuery(internal.properties.getInternal, {
      propertyId: args.propertyId,
    });
    if (!property?.address?.formatted) return null;

    const apiKey = process.env.BROWSER_USE_API_KEY;
    if (!apiKey) {
      console.log(
        `[permits-broward] lookupAndPersist called for ${property.address.formatted} ` +
          `— Cloud API integration pending follow-up after KIN-1076 key provisioning`,
      );
      return null;
    }

    // Real implementation routes through services/extraction once the
    // API key is provisioned. Placeholder log for now.
    return null;
  },
});
