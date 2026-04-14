import { v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUser } from "./lib/session";

export const getMarketDigest = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    return [];
  },
});
