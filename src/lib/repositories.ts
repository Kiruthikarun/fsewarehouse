import { MovementType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/current-user";
import {
  PERMISSION_GROUPS,
  ROLES,
  isPermission,
  permissionsFor,
  type Permission,
} from "@/lib/rbac";

/**
 * Tenant-scoped data-access layer.
 *
 * This is the second, deeper line of multi-tenant defence (the first being the
 * permission check in the route). EVERY query here is filtered by
 * `user.organisationId`. There is no function that reads or writes a
 * tenant-owned row without scoping to the caller's organisation — so even a
 * valid user of org A literally cannot address a row in org B by guessing its
 * id. Mutations use `updateMany`/`deleteMany`-style ownership predicates so a
 * cross-tenant id resolves to "0 rows affected" → NotFound, never a leak.
 */

export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// ─── Warehouses ──────────────────────────────────────────────────────────────

export const warehouses = {
  list(user: AuthUser) {
    return prisma.warehouse.findMany({
      where: { organisationId: user.organisationId },
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    });
  },

  async get(user: AuthUser, id: string) {
    const wh = await prisma.warehouse.findFirst({
      where: { id, organisationId: user.organisationId },
    });
    if (!wh) throw new NotFoundError("Warehouse");
    return wh;
  },

  create(
    user: AuthUser,
    data: { name: string; location: string; capacity: number },
  ) {
    return prisma.warehouse.create({
      data: { ...data, organisationId: user.organisationId },
    });
  },

  async update(
    user: AuthUser,
    id: string,
    data: Partial<{ name: string; location: string; capacity: number }>,
  ) {
    // updateMany with the org predicate => a foreign id touches 0 rows.
    const res = await prisma.warehouse.updateMany({
      where: { id, organisationId: user.organisationId },
      data,
    });
    if (res.count === 0) throw new NotFoundError("Warehouse");
    return this.get(user, id);
  },

  async remove(user: AuthUser, id: string) {
    const res = await prisma.warehouse.deleteMany({
      where: { id, organisationId: user.organisationId },
    });
    if (res.count === 0) throw new NotFoundError("Warehouse");
  },
};

// ─── Inventory items ─────────────────────────────────────────────────────────

export const inventory = {
  list(user: AuthUser, opts?: { warehouseId?: string }) {
    return prisma.inventoryItem.findMany({
      where: {
        organisationId: user.organisationId,
        ...(opts?.warehouseId ? { warehouseId: opts.warehouseId } : {}),
      },
      orderBy: [{ warehouse: { name: "asc" } }, { name: "asc" }],
      include: { warehouse: { select: { id: true, name: true } } },
    });
  },

  async get(user: AuthUser, id: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, organisationId: user.organisationId },
      include: { warehouse: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundError("Inventory item");
    return item;
  },

  async create(
    user: AuthUser,
    data: { sku: string; name: string; quantity: number; warehouseId: string },
  ) {
    // The warehouse must belong to the caller's org — verify before linking,
    // otherwise an attacker could attach an item to another tenant's warehouse.
    await warehouses.get(user, data.warehouseId);
    try {
      return await prisma.inventoryItem.create({
        data: { ...data, organisationId: user.organisationId },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ValidationError(
          `SKU "${data.sku}" already exists in that warehouse`,
        );
      }
      throw e;
    }
  },

  async update(
    user: AuthUser,
    id: string,
    data: Partial<{ sku: string; name: string; quantity: number }>,
  ) {
    const res = await prisma.inventoryItem.updateMany({
      where: { id, organisationId: user.organisationId },
      data,
    });
    if (res.count === 0) throw new NotFoundError("Inventory item");
    return this.get(user, id);
  },

  async remove(user: AuthUser, id: string) {
    const res = await prisma.inventoryItem.deleteMany({
      where: { id, organisationId: user.organisationId },
    });
    if (res.count === 0) throw new NotFoundError("Inventory item");
  },
};

// ─── Stock movements ─────────────────────────────────────────────────────────

export const movements = {
  list(user: AuthUser, opts?: { limit?: number }) {
    return prisma.stockMovement.findMany({
      where: { organisationId: user.organisationId },
      orderBy: { occurredAt: "desc" },
      take: opts?.limit ?? 100,
      include: {
        item: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Record a movement AND apply it to the item's quantity, atomically.
   * Outbound movements are guarded against driving stock negative.
   */
  async create(
    user: AuthUser,
    data: { itemId: string; type: MovementType; quantity: number },
  ) {
    if (data.quantity <= 0) {
      throw new ValidationError("Quantity must be a positive number");
    }

    return prisma.$transaction(async (tx) => {
      // Re-load the item *inside* the tx, scoped to the org, with a lock-free
      // read; the org predicate is the tenant guard.
      const item = await tx.inventoryItem.findFirst({
        where: { id: data.itemId, organisationId: user.organisationId },
      });
      if (!item) throw new NotFoundError("Inventory item");

      const delta =
        data.type === MovementType.INBOUND ? data.quantity : -data.quantity;
      const nextQty = item.quantity + delta;
      if (nextQty < 0) {
        throw new ValidationError(
          `Cannot remove ${data.quantity}; only ${item.quantity} in stock`,
        );
      }

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: nextQty },
      });

      return tx.stockMovement.create({
        data: {
          type: data.type,
          quantity: data.quantity,
          itemId: item.id,
          warehouseId: item.warehouseId,
          operatorId: user.id,
          organisationId: user.organisationId,
        },
        include: {
          item: { select: { id: true, sku: true, name: true } },
          warehouse: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
        },
      });
    });
  },

  /**
   * Delete a movement AND reverse its effect on the item's quantity, atomically.
   * A deletion that left the quantity untouched would silently corrupt stock, so
   * the two always move together. Deleting an INBOUND receipt is rejected if the
   * received units have since been shipped out (it would drive stock negative);
   * reversing an OUTBOUND simply returns the units. Restricted to roles holding
   * `movement:delete` (Manager + Admin) and scoped to the caller's org.
   */
  async remove(user: AuthUser, id: string) {
    return prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.findFirst({
        where: { id, organisationId: user.organisationId },
      });
      if (!movement) throw new NotFoundError("Movement");

      const item = await tx.inventoryItem.findFirst({
        where: { id: movement.itemId, organisationId: user.organisationId },
      });

      if (item) {
        // Undo the original delta: an INBOUND had added units, so removing it
        // subtracts them again; an OUTBOUND had removed units, so it adds back.
        const reverse =
          movement.type === MovementType.INBOUND
            ? -movement.quantity
            : movement.quantity;
        const nextQty = item.quantity + reverse;
        if (nextQty < 0) {
          throw new ValidationError(
            `Cannot delete this inbound movement: ${item.quantity} in stock, ` +
              `but reversing it needs ${movement.quantity}. Those units have ` +
              `already moved out — reverse the later movements first.`,
          );
        }
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: nextQty },
        });
      }

      await tx.stockMovement.delete({ where: { id: movement.id } });
    });
  },
};

// ─── Live analytics tail + snapshot (Postgres) ───────────────────────────────

/** Per-day inbound/outbound, matching BigQuery's VelocityPoint shape. */
interface TailVelocityPoint {
  day: string;
  inbound: number;
  outbound: number;
}

/**
 * Aggregated movements that exist in Postgres but not yet in the BigQuery mirror
 * — the "tail" the dashboard merges onto the cached BigQuery base so brand-new
 * movement activity shows on the charts immediately (see src/lib/analytics-live.ts).
 * `items` carries per-item windowed totals so the live layer can recompute the
 * stock ledger / status; `velocity` and `throughput` feed the day- and
 * warehouse-grained charts.
 */
export interface MovementTail {
  velocity: TailVelocityPoint[];
  throughput: { warehouse_name: string; inbound: number; outbound: number }[];
  items: { item_id: string; inbound: number; outbound: number }[];
  movementCount: number;
}

/** Live inventory + warehouse state — the authoritative snapshot Postgres holds. */
export interface AnalyticsSnapshot {
  warehouses: { id: string; name: string; capacity: number }[];
  items: {
    id: string;
    sku: string;
    name: string;
    quantity: number;
    warehouseId: string;
    warehouseName: string;
  }[];
}

export const analytics = {
  /**
   * Read + aggregate the unsynced movement tail for one analytics scope.
   *
   * `watermark` is BigQuery's MAX(occurred_at) for this scope (see
   * getSyncWatermark). We take movements strictly newer than it, which are
   * exactly those not in the mirror — so the caller can sum tail + base with no
   * double-counting. When the mirror is empty or lags the whole window, we fall
   * back to the window start (nothing in that range is synced, so it's all tail).
   * Org-scoped (+ optional warehouse) like every reader in this file.
   */
  async movementTail(
    user: AuthUser,
    opts: { days: number; warehouseId?: string | null; watermark: Date | null },
  ): Promise<MovementTail> {
    const windowStart = new Date(Date.now() - opts.days * 86_400_000);
    const occurredAt =
      opts.watermark && opts.watermark >= windowStart
        ? { gt: opts.watermark }
        : { gte: windowStart };

    const rows = await prisma.stockMovement.findMany({
      where: {
        organisationId: user.organisationId,
        ...(opts.warehouseId ? { warehouseId: opts.warehouseId } : {}),
        occurredAt,
      },
      select: {
        type: true,
        quantity: true,
        occurredAt: true,
        itemId: true,
        warehouse: { select: { name: true } },
      },
    });

    const velocity = new Map<string, { inbound: number; outbound: number }>();
    const throughput = new Map<string, { inbound: number; outbound: number }>();
    const items = new Map<string, { inbound: number; outbound: number }>();

    for (const m of rows) {
      const inbound = m.type === MovementType.INBOUND ? m.quantity : 0;
      const outbound = m.type === MovementType.OUTBOUND ? m.quantity : 0;

      // UTC day key — matches BigQuery's DATE(occurred_at) bucketing so merged
      // days line up exactly.
      const day = m.occurredAt.toISOString().slice(0, 10);
      const v = velocity.get(day) ?? { inbound: 0, outbound: 0 };
      v.inbound += inbound;
      v.outbound += outbound;
      velocity.set(day, v);

      const wh = m.warehouse.name;
      const t = throughput.get(wh) ?? { inbound: 0, outbound: 0 };
      t.inbound += inbound;
      t.outbound += outbound;
      throughput.set(wh, t);

      const it = items.get(m.itemId) ?? { inbound: 0, outbound: 0 };
      it.inbound += inbound;
      it.outbound += outbound;
      items.set(m.itemId, it);
    }

    return {
      velocity: [...velocity.entries()]
        .map(([day, v]) => ({ day, inbound: v.inbound, outbound: v.outbound }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      throughput: [...throughput.entries()].map(([warehouse_name, t]) => ({
        warehouse_name,
        inbound: t.inbound,
        outbound: t.outbound,
      })),
      items: [...items.entries()].map(([item_id, it]) => ({
        item_id,
        inbound: it.inbound,
        outbound: it.outbound,
      })),
      movementCount: rows.length,
    };
  },

  /**
   * Current inventory + warehouse state from Postgres — the live truth for the
   * snapshot-derived panels (units-in-stock, capacity, the stock ledger and the
   * status donut). Reading these straight from Postgres is what makes a direct
   * quantity edit, a new SKU, or a new warehouse show on the dashboard without
   * waiting for a BigQuery sync. Small tables, so the per-request cost is trivial.
   * Org-scoped (+ optional warehouse).
   */
  async snapshot(
    user: AuthUser,
    opts: { warehouseId?: string | null },
  ): Promise<AnalyticsSnapshot> {
    const [warehouses, items] = await Promise.all([
      prisma.warehouse.findMany({
        where: {
          organisationId: user.organisationId,
          ...(opts.warehouseId ? { id: opts.warehouseId } : {}),
        },
        select: { id: true, name: true, capacity: true },
      }),
      prisma.inventoryItem.findMany({
        where: {
          organisationId: user.organisationId,
          ...(opts.warehouseId ? { warehouseId: opts.warehouseId } : {}),
        },
        select: {
          id: true,
          sku: true,
          name: true,
          quantity: true,
          warehouseId: true,
          warehouse: { select: { name: true } },
        },
      }),
    ]);

    return {
      warehouses,
      items: items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        quantity: i.quantity,
        warehouseId: i.warehouseId,
        warehouseName: i.warehouse.name,
      })),
    };
  },
};

// ─── Users (org membership & roles) ──────────────────────────────────────────

/**
 * Admin-only user administration, gated upstream by the `org:manage` permission
 * (see /api/users routes). This is the capability that makes ADMIN genuinely
 * distinct from WAREHOUSE_MANAGER — a Manager can run the warehouse, but only an
 * Admin can change who has which role.
 *
 * Every query is org-scoped exactly like the rest of the data layer: an Admin of
 * org A can only ever see and modify members of org A. Role changes use the
 * `updateMany` ownership-predicate trick so a cross-tenant id touches 0 rows.
 */
export const users = {
  list(user: AuthUser) {
    return prisma.user.findMany({
      where: { organisationId: user.organisationId },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  },

  async updateRole(user: AuthUser, targetId: string, role: Role) {
    // You cannot change your own role — prevents an Admin from accidentally
    // demoting themselves out of the only role that can undo it.
    if (targetId === user.id) {
      throw new ValidationError("You cannot change your own role.");
    }

    // The target must already belong to the caller's org. Fetch scoped — a
    // foreign id resolves to null → NotFound, never a cross-tenant leak.
    const target = await prisma.user.findFirst({
      where: { id: targetId, organisationId: user.organisationId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundError("User");

    // Never strand an organisation without an Admin.
    if (target.role === Role.ADMIN && role !== Role.ADMIN) {
      const admins = await prisma.user.count({
        where: { organisationId: user.organisationId, role: Role.ADMIN },
      });
      if (admins <= 1) {
        throw new ValidationError(
          "Your organisation must have at least one Admin.",
        );
      }
    }

    await prisma.user.updateMany({
      where: { id: targetId, organisationId: user.organisationId },
      data: { role },
    });

    return prisma.user.findFirstOrThrow({
      where: { id: targetId, organisationId: user.organisationId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  },
};

// ─── Role permissions (per-tenant RBAC policy) ───────────────────────────────

/**
 * Reads and writes the organisation's role→permission policy. This is what the
 * Settings → Roles & Access editor edits. Like everything in this layer it is
 * strictly org-scoped: an Admin only ever sees and replaces their own tenant's
 * policy. Gated upstream by `org:manage`.
 */
export const rolePermissions = {
  /**
   * The full role→permission matrix for the org. Falls back to the code
   * defaults when the org has never customised its policy, so the editor always
   * shows a meaningful starting point.
   */
  async matrix(user: AuthUser): Promise<Record<Role, Permission[]>> {
    const grants = await prisma.rolePermission.findMany({
      where: { organisationId: user.organisationId },
      select: { role: true, permission: true },
    });

    const result = {} as Record<Role, Permission[]>;
    if (grants.length === 0) {
      for (const role of ROLES) result[role] = permissionsFor(role);
      return result;
    }

    for (const role of ROLES) result[role] = [];
    for (const g of grants) {
      if (isPermission(g.permission)) result[g.role].push(g.permission);
    }
    return result;
  },

  /**
   * Replace the org's policy with `input`. Validates roles/permissions, applies
   * the "an action implies read access to its page" rule, and guards against the
   * editing Admin locking their own role out of Settings. The whole policy is
   * swapped atomically (delete + recreate) so a partial write can't leave a
   * half-applied matrix.
   */
  async save(
    user: AuthUser,
    input: Record<string, string[]>,
  ): Promise<Record<Role, Permission[]>> {
    const next = {} as Record<Role, Set<Permission>>;
    for (const role of ROLES) next[role] = new Set<Permission>();

    for (const [role, perms] of Object.entries(input)) {
      if (!ROLES.includes(role as Role)) {
        throw new ValidationError(`Unknown role: ${role}`);
      }
      for (const p of perms) {
        if (!isPermission(p)) {
          throw new ValidationError(`Unknown permission: ${p}`);
        }
        next[role as Role].add(p);
      }
    }

    // Granting any action on a page implies access (read) to that page —
    // otherwise the role could mutate data on a screen it can't even open.
    for (const role of ROLES) {
      for (const group of PERMISSION_GROUPS) {
        if (!group.readPermission) continue;
        if (group.permissions.some((p) => next[role].has(p.key))) {
          next[role].add(group.readPermission);
        }
      }
    }

    // Lockout guard: the editing user's own role must retain org:manage, or no
    // one could ever return to this screen to undo a mistake.
    if (!next[user.role].has("org:manage")) {
      throw new ValidationError(
        "Your own role must keep “Manage members & access”, otherwise you would lock yourself out of Settings.",
      );
    }

    const rows = ROLES.flatMap((role) =>
      [...next[role]].map((permission) => ({
        organisationId: user.organisationId,
        role,
        permission,
      })),
    );

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { organisationId: user.organisationId },
      }),
      prisma.rolePermission.createMany({ data: rows }),
    ]);

    return rolePermissions.matrix(user);
  },
};
