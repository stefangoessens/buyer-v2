"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * Broward County Property Appraiser lookup action (KIN-1072).
 *
 * Fires the Browser Use Cloud crawler (KIN-1076 wrapper) for a single
 * property and persists the assessed value + ownership snapshot. NOT
 * auto-triggered tonight — the orchestrator hookup waits for the
 * Browser Use Cloud API key to be provisioned. Callers can manually
 * invoke this from the dashboard once the key is set.
 *
 * Persists via internal.crawlers.papaBrowardPersist.persist (separate
 * file because Convex forbids mutations inside "use node" modules).
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
      // Cloud not configured — exit silently. The UI card shows
      // a graceful "data unavailable" state when papaFolio is missing.
      return null;
    }

    // The actual Browser Use Cloud call lives in python-workers via
    // the extraction service. For now the action is a placeholder that
    // will be wired through services/extraction/src/router.py in a
    // follow-up after a real API key is provisioned and the python
    // crawler is integration-tested against live BCPA HTML.
    //
    // Placeholder behaviour: log + no-op so the orchestrator can
    // schedule this without raising.
    console.log(
      `[papa-broward] lookupAndPersist called for ${property.address.formatted} ` +
        `— Cloud API integration pending follow-up after KIN-1076 key provisioning`,
    );
    return null;
  },
});
