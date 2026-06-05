import { Role } from "@prisma/client";

/**
 * RBAC permission model.
 *
 * Permissions are the unit of authorization — never the role directly. Code asks
 * `can(user, "warehouse:create")`, not `if (user.role === "ADMIN")`. This keeps
 * the policy in one place and makes it auditable.
 *
 * The role→permission mapping below is the built-in DEFAULT. Each organisation's
 * Admin can override it at runtime in Settings → Roles & Access; those edits are
 * stored per-tenant (see the RolePermission table) and resolved into the user's
 * effective permission set at authentication time (see current-user.ts). `can()`
 * then checks that resolved set, falling back to the defaults below when an org
 * has not customised its policy.
 *
 * Enforcement happens at the API/data layer (see requirePermission in auth.ts
 * and the repositories), NOT in the UI. The UI only *hides* controls for nicer
 * UX; the server re-checks every mutation.
 */

export type Permission =
  | "warehouse:read"
  | "warehouse:create"
  | "warehouse:update"
  | "warehouse:delete"
  | "inventory:read"
  | "inventory:create"
  | "inventory:update"
  | "inventory:delete"
  | "movement:read"
  | "movement:create"
  | "movement:delete"
  | "analytics:read"
  | "org:manage";

/** All roles, in display order (Admin first). */
export const ROLES: Role[] = [Role.ADMIN, Role.WAREHOUSE_MANAGER, Role.OPERATOR];

/**
 * The catalog that drives the Roles & Access editor: permissions grouped by the
 * page/section they govern, each with a human label. This is the single source
 * of truth for which permissions exist and how they're presented — the editor
 * renders it, and `save` validates submitted permissions against it. The first
 * permission in each group is the "Access" (read) permission for that page.
 */
export const PERMISSION_GROUPS: {
  page: string;
  label: string;
  /** The read/access permission that gates simply opening this page. */
  readPermission?: Permission;
  permissions: { key: Permission; label: string }[];
}[] = [
  {
    page: "warehouses",
    label: "Warehouses",
    readPermission: "warehouse:read",
    permissions: [
      { key: "warehouse:read", label: "Access (read)" },
      { key: "warehouse:create", label: "Create" },
      { key: "warehouse:update", label: "Update" },
      { key: "warehouse:delete", label: "Delete" },
    ],
  },
  {
    page: "inventory",
    label: "Inventory",
    readPermission: "inventory:read",
    permissions: [
      { key: "inventory:read", label: "Access (read)" },
      { key: "inventory:create", label: "Create" },
      { key: "inventory:update", label: "Update" },
      { key: "inventory:delete", label: "Delete" },
    ],
  },
  {
    page: "movements",
    label: "Stock movements",
    readPermission: "movement:read",
    permissions: [
      { key: "movement:read", label: "Access (read)" },
      { key: "movement:create", label: "Record movement" },
      { key: "movement:delete", label: "Reverse / delete" },
    ],
  },
  {
    page: "analytics",
    label: "Analytics",
    readPermission: "analytics:read",
    permissions: [{ key: "analytics:read", label: "Access (read)" }],
  },
  {
    page: "settings",
    label: "Team & Settings",
    readPermission: "org:manage",
    permissions: [{ key: "org:manage", label: "Manage members & access" }],
  },
];

/** Every permission that exists, derived from the catalog. */
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

const ALL_PERMISSION_SET = new Set<Permission>(ALL_PERMISSIONS);

/** Type guard: is an arbitrary string one of our known permissions? */
export function isPermission(value: string): value is Permission {
  return ALL_PERMISSION_SET.has(value as Permission);
}

/** The built-in default policy. Used as the baseline an org can override. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  // Admin: everything within their own organisation.
  ADMIN: new Set<Permission>([
    "warehouse:read",
    "warehouse:create",
    "warehouse:update",
    "warehouse:delete",
    "inventory:read",
    "inventory:create",
    "inventory:update",
    "inventory:delete",
    "movement:read",
    "movement:create",
    "movement:delete",
    "analytics:read",
    "org:manage",
  ]),
  // Warehouse Manager: the operational power user. Creates and edits the master
  // data the floor runs on (warehouses, inventory items), records movements, and
  // can correct the ledger by deleting an erroneous movement (which reverses its
  // stock effect) — matching the WMS convention where managers own movement
  // reversals. Following segregation-of-duties, *destructive* master-data deletes
  // (removing a whole warehouse/item) and tenant/user administration are withheld
  // and reserved for the Admin — a manager runs the operation, an admin owns its
  // structure.
  WAREHOUSE_MANAGER: new Set<Permission>([
    "warehouse:read",
    "warehouse:create",
    "warehouse:update",
    "inventory:read",
    "inventory:create",
    "inventory:update",
    "movement:read",
    "movement:create",
    "movement:delete",
    "analytics:read",
  ]),
  // Operator: the floor role — execution only. Reads the stock picture and
  // records inbound/outbound movements (which adjust quantities through an
  // audited ledger entry, not a silent field edit). Cannot create or edit
  // warehouses/items and cannot see analytics. Mirrors the WMS "Mobile Operator"
  // who performs processing tasks but no setup or configuration.
  OPERATOR: new Set<Permission>([
    "warehouse:read",
    "inventory:read",
    "movement:read",
    "movement:create",
  ]),
};

/**
 * THE authorization check. Takes the authenticated user (whose effective
 * permission set was resolved from the per-tenant policy at login) and asks
 * whether they hold `permission`. If a caller passes a bare subject without a
 * resolved set, we fall back to the role's built-in defaults — so the function
 * is safe to call in any context.
 */
export function can(
  subject: { role: Role; permissions?: readonly Permission[] },
  permission: Permission,
): boolean {
  const effective = subject.permissions ?? permissionsFor(subject.role);
  return effective.includes(permission);
}

/** The built-in default permissions for a role (ignores per-tenant overrides). */
export function permissionsFor(role: Role): Permission[] {
  return [...DEFAULT_ROLE_PERMISSIONS[role]];
}

/**
 * The page a user should land on after login. All three roles share a single
 * "/" overview (which only shows links to sections the role can access), so
 * nobody hits "Not authorised" on entry. /dashboard (analytics) is just a nav
 * link, gated by analytics:read.
 */
export function landingPathFor(_role: Role): string {
  return "/";
}

/** Thrown by requirePermission; mapped to HTTP 403 by the API helpers. */
export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}
