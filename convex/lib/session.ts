import { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * Get the current authenticated user from the Convex auth context.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q) => q.eq("authSubject", identity.subject))
    .unique();

  return user;
}

/**
 * Get the current user or throw if not authenticated.
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}

/**
 * Require the current user has a specific role.
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  role: "buyer" | "broker" | "admin"
) {
  const user = await requireAuth(ctx);
  if (user.role !== role && user.role !== "admin") {
    throw new Error(`Role '${role}' required`);
  }
  return user;
}
