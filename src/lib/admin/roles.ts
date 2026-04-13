/**
 * Internal console access model.
 *
 * The product has three user roles today (`buyer`, `broker`, `admin`).
 * Only `broker` and `admin` can reach the internal console. `buyer` is
 * always denied — they have their own authenticated surface under `(app)`.
 *
 * Within the internal console, `admin` is a strict superset of `broker`:
 * any nav item visible to `broker` is also visible to `admin`.
 */

export const INTERNAL_CONSOLE_ROLES = ["broker", "admin"] as const;
export type InternalConsoleRole = (typeof INTERNAL_CONSOLE_ROLES)[number];

export type UserRole = "buyer" | "broker" | "admin";

/** True iff `role` is allowed to access the internal console at all. */
export function canAccessInternalConsole(
  role: UserRole | null | undefined,
): role is InternalConsoleRole {
  return role === "broker" || role === "admin";
}

/**
 * True iff `actor` has at least the permission level of `required`.
 *
 * The hierarchy is simple: admin > broker. `admin` can do anything a
 * `broker` can do; a `broker` cannot do admin-only work.
 */
export function hasAtLeastRole(
  actor: UserRole | null | undefined,
  required: InternalConsoleRole,
): boolean {
  if (!actor) return false;
  if (required === "broker") return actor === "broker" || actor === "admin";
  return actor === "admin";
}

/** User-facing display label for a role (used in the topbar badge). */
export function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "broker":
      return "Broker";
    case "buyer":
      return "Buyer";
  }
}
