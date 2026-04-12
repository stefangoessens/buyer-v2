"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// Action to generate the full CCPA export (runs in Node.js runtime)
export const generateExport = internalAction({
  args: { userId: v.id("users"), requestedBy: v.id("users") },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await ctx.runQuery(
      internal.security.dataExport.collectBuyerData,
      { userId: args.userId }
    );

    await ctx.runMutation(internal.security.dataExport.logExport, {
      userId: args.userId,
      requestedBy: args.requestedBy,
    });

    return JSON.stringify(data, null, 2);
  },
});
