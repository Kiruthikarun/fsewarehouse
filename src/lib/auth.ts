import { getCurrentUser, type AuthUser } from "@/lib/current-user";
import { can, ForbiddenError, type Permission } from "@/lib/rbac";

export { getCurrentUser };
export type { AuthUser };

/** Thrown when there is no authenticated user; mapped to HTTP 401. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthorizedError";
  }
}

/**
 * Require an authenticated user. Use at the top of every protected server
 * action / route handler / page.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Require an authenticated user that holds `permission`. This is THE server-side
 * authorization gate — every mutating API route calls it. Returns the user so
 * callers get the tenant context (organisationId) in the same step.
 */
export async function requirePermission(permission: Permission): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, permission)) {
    throw new ForbiddenError(permission);
  }
  return user;
}
