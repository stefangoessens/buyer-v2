import { type QueryCtx, type MutationCtx } from "../_generated/server";
import { type Doc } from "../_generated/dataModel";
import { type UserIdentity } from "convex/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { authProvider } from "./validators";

type SessionCtx = QueryCtx | MutationCtx;
type SessionUser = Doc<"users">;

export const sessionUserValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  email: v.string(),
  name: v.string(),
  role: v.union(v.literal("buyer"), v.literal("broker"), v.literal("admin")),
  phone: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  authProvider: v.optional(authProvider),
  authIssuer: v.optional(v.string()),
  authSubject: v.optional(v.string()),
  authTokenIdentifier: v.optional(v.string()),
  sessionVersion: v.optional(v.number()),
  lastAuthenticatedAt: v.optional(v.string()),
  welcomeEmailQueuedAt: v.optional(v.string()),
  welcomeEmailProviderMessageId: v.optional(v.string()),
  welcomeEmailTemplateKey: v.optional(v.string()),
});

export const sessionPermissionsValidator = v.object({
  canAccessInternalConsole: v.boolean(),
  canReadBuyerData: v.boolean(),
  canReadBrokerTools: v.boolean(),
  canMutateAdminOnlyState: v.boolean(),
});

export interface SessionPermissions {
  canAccessInternalConsole: boolean;
  canReadBuyerData: boolean;
  canReadBrokerTools: boolean;
  canMutateAdminOnlyState: boolean;
}

export type SessionContext =
  | {
      kind: "anonymous";
      identity: null;
      user: null;
      permissions: null;
    }
  | {
      kind: "unknown_user";
      identity: UserIdentity;
      user: null;
      permissions: null;
    }
  | {
      kind: "authenticated";
      identity: UserIdentity;
      user: SessionUser;
      permissions: SessionPermissions;
    };

export function inferAuthProviderFromIssuer(
  issuer: string | undefined,
): "clerk" | "auth0" | undefined {
  const normalized = issuer?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("clerk")) return "clerk";
  if (normalized.includes("auth0")) return "auth0";
  return undefined;
}

export function buildSessionPermissions(
  role: SessionUser["role"],
): SessionPermissions {
  return {
    canAccessInternalConsole: role === "broker" || role === "admin",
    canReadBuyerData: role === "buyer" || role === "broker" || role === "admin",
    canReadBrokerTools: role === "broker" || role === "admin",
    canMutateAdminOnlyState: role === "admin",
  };
}

async function lookupUserByIdentity(
  ctx: SessionCtx,
  identity: UserIdentity,
): Promise<SessionUser | null> {
  const byTokenIdentifier = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) =>
      q.eq("authTokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (byTokenIdentifier) {
    return byTokenIdentifier;
  }

  const byIssuerAndSubject = await ctx.db
    .query("users")
    .withIndex("by_authIssuer_and_authSubject", (q) =>
      q.eq("authIssuer", identity.issuer).eq("authSubject", identity.subject),
    )
    .unique();
  if (byIssuerAndSubject) {
    return byIssuerAndSubject;
  }

  return await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q) => q.eq("authSubject", identity.subject))
    .unique();
}

/**
 * Resolve the caller into an explicit auth state. This keeps anonymous,
 * unknown-user, and authenticated callers distinct so queries can return
 * deterministic edge states without open-coding identity joins.
 *
 * Dual-path lookup: Convex Auth (native, KIN-998) takes priority via
 * `getAuthUserId`, which resolves directly to a users row. If that
 * doesn't produce a user (legacy Clerk/Auth0 JWTs on old sessions),
 * fall back to the identity-based index lookups.
 */
export async function getSessionContext(ctx: SessionCtx): Promise<SessionContext> {
  const authUserId = await getAuthUserId(ctx);
  if (authUserId) {
    const user = await ctx.db.get(authUserId);
    if (user) {
      const identity = (await ctx.auth.getUserIdentity()) ?? {
        subject: authUserId,
        issuer: "convex-auth",
        tokenIdentifier: `convex-auth|${authUserId}`,
      } as UserIdentity;
      return {
        kind: "authenticated",
        identity,
        user,
        permissions: buildSessionPermissions(user.role),
      };
    }
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return {
      kind: "anonymous",
      identity: null,
      user: null,
      permissions: null,
    };
  }

  const user = await lookupUserByIdentity(ctx, identity);
  if (!user) {
    return {
      kind: "unknown_user",
      identity,
      user: null,
      permissions: null,
    };
  }

  return {
    kind: "authenticated",
    identity,
    user,
    permissions: buildSessionPermissions(user.role),
  };
}

/**
 * Get the current authenticated user from the Convex auth context.
 * Returns null for anonymous callers and identities not yet bound to a user row.
 */
export async function getCurrentUser(
  ctx: SessionCtx,
): Promise<SessionUser | null> {
  const session = await getSessionContext(ctx);
  return session.kind === "authenticated" ? session.user : null;
}

/**
 * Get the current user or throw if not authenticated.
 */
export async function requireAuth(ctx: SessionCtx): Promise<SessionUser> {
  const session = await getSessionContext(ctx);
  if (session.kind === "anonymous") {
    throw new Error("Authentication required");
  }
  if (session.kind === "unknown_user") {
    throw new Error("Authenticated identity is not bound to an application user");
  }
  return session.user;
}

/**
 * Require the current user has a specific role.
 */
export async function requireRole(
  ctx: SessionCtx,
  role: SessionUser["role"],
): Promise<SessionUser> {
  const user = await requireAuth(ctx);
  if (user.role !== role && user.role !== "admin") {
    throw new Error(`Role '${role}' required`);
  }
  return user;
}
