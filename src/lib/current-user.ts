import { cookies } from "next/headers";
import { cache } from "react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPermission, permissionsFor, type Permission } from "@/lib/rbac";

/**
 * Single source of identity for the app.
 *
 * `getCurrentUser()` resolves the authenticated principal from the incoming
 * request and maps it to a row in our `User` table (which carries the
 * organisationId and role that every downstream authorization + tenant-scope
 * decision depends on).
 *
 * Two auth backends, selected by AUTH_MODE:
 *   - "workos" — real WorkOS AuthKit session (the deployed instance).
 *   - "dev"    — a signed cookie naming a seeded user, so a reviewer can switch
 *                between the 9 seeded logins instantly without WorkOS keys.
 *
 * In BOTH modes the returned identity is loaded from our own DB — WorkOS tells
 * us *who* the user is; our DB is authoritative for *what org and role* they
 * have. That mapping is what makes tenant isolation enforceable server-side.
 */

export const DEV_COOKIE = "t3c_dev_user";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organisationId: string;
  organisationName: string;
  /**
   * The caller's resolved permissions for THIS request — the per-tenant policy
   * override if the org has one, otherwise the role's built-in defaults. Every
   * authorization decision (`can`, `requirePermission`) reads this set, so it's
   * computed once here rather than re-derived from the role downstream.
   */
  permissions: Permission[];
}

/**
 * Resolve a role's effective permissions within an organisation. If the org has
 * any custom RolePermission rows, those are authoritative (a role with no rows
 * legitimately has no permissions). If the org has none, we use the code
 * defaults — so an un-customised tenant behaves exactly as before this feature.
 */
async function effectivePermissions(
  organisationId: string,
  role: Role,
): Promise<Permission[]> {
  const grants = await prisma.rolePermission.findMany({
    where: { organisationId },
    select: { role: true, permission: true },
  });
  if (grants.length === 0) return permissionsFor(role);
  return grants
    .filter((g) => g.role === role && isPermission(g.permission))
    .map((g) => g.permission as Permission);
}

function authMode(): "workos" | "dev" {
  return process.env.AUTH_MODE === "workos" ? "workos" : "dev";
}

async function loadAppUser(email: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { organisation: true },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organisationId: user.organisationId,
    organisationName: user.organisation.name,
    permissions: await effectivePermissions(user.organisationId, user.role),
  };
}

async function getDevUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const email = store.get(DEV_COOKIE)?.value;
  if (!email) return null;
  return loadAppUser(email);
}

async function getWorkosUser(): Promise<AuthUser | null> {
  // Imported lazily so the WorkOS SDK is never loaded (or required to be
  // configured) when running in dev-auth mode.
  const { withAuth } = await import("@workos-inc/authkit-nextjs");
  const { user } = await withAuth();
  if (!user?.email) return null;
  // The WorkOS user is the principal; our DB row is authoritative for org+role.
  // Seeded users are linked by email (see prisma/seed.ts), which also lets you
  // invite the same emails into WorkOS and have them resolve correctly.
  return loadAppUser(user.email);
}

/**
 * Returns the email of the WorkOS-authenticated principal REGARDLESS of whether
 * they map to a provisioned app user. Used by the login page to detect the
 * "authenticated with WorkOS but not one of our seeded users" case (e.g. someone
 * signs in with a personal Google account) and show a clear message instead of a
 * silent redirect loop. Returns null in dev mode or when not authenticated.
 */
export async function getWorkosIdentityEmail(): Promise<string | null> {
  if (authMode() !== "workos") return null;
  try {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const { user } = await withAuth();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Cached per-request so multiple server components / route handlers in one
 * request don't each hit the DB.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  return authMode() === "workos" ? getWorkosUser() : getDevUser();
});
