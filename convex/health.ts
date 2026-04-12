import { query } from "./_generated/server";
import { v } from "convex/values";

export const check = query({
  args: {},
  returns: v.object({
    status: v.literal("ok"),
    timestamp: v.number(),
  }),
  handler: async () => {
    return {
      status: "ok" as const,
      timestamp: Date.now(),
    };
  },
});
