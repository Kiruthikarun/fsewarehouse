/**
 * Idempotent seed for the transactional Postgres DB.
 *
 * Running it twice yields the same state (orgs/users are upserted; warehouses,
 * items and movements for the seeded orgs are wiped and recreated from a fixed
 * PRNG seed). Produces shaped data so the analytics dashboard has something to
 * say: busy vs quiet warehouses, fast movers, dead stock, low stock.
 *
 *   3 orgs · 12 warehouses · ~80 items · ~400 movements (last 90 days) · 9 users
 */
import { PrismaClient, Role, MovementType } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Deterministic PRNG (mulberry32) so the dataset is reproducible ──────────
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(424242);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

interface OrgSpec {
  id: string;
  name: string;
  slug: string;
  warehouses: { id: string; name: string; location: string; capacity: number }[];
  // Category words used to generate item names + SKUs for variety per org.
  categories: string[];
}

const ORGS: OrgSpec[] = [
  {
    id: "org-coastal",
    name: "Coastal Logistics",
    slug: "coastal-logistics",
    categories: ["Pallet", "Container", "Crate", "Drum", "Sack", "Reel"],
    warehouses: [
      { id: "wh-coastal-1", name: "Chennai Port DC", location: "Chennai, IN", capacity: 50000 },
      { id: "wh-coastal-2", name: "Mumbai Coastal Hub", location: "Mumbai, IN", capacity: 38000 },
      { id: "wh-coastal-3", name: "Kochi Transit", location: "Kochi, IN", capacity: 16000 },
      { id: "wh-coastal-4", name: "Vizag Overflow", location: "Visakhapatnam, IN", capacity: 9000 },
    ],
  },
  {
    id: "org-meridian",
    name: "Meridian Stores",
    slug: "meridian-stores",
    categories: ["Shelf", "Bin", "Carton", "Tray", "Bundle", "Case"],
    warehouses: [
      { id: "wh-meridian-1", name: "Austin Fulfilment", location: "Austin, TX", capacity: 42000 },
      { id: "wh-meridian-2", name: "Dallas North", location: "Dallas, TX", capacity: 31000 },
      { id: "wh-meridian-3", name: "Houston Bay", location: "Houston, TX", capacity: 22000 },
      { id: "wh-meridian-4", name: "El Paso Spillover", location: "El Paso, TX", capacity: 7000 },
    ],
  },
  {
    id: "org-tilman",
    name: "Tilman & Co.",
    slug: "tilman-and-co",
    categories: ["Component", "Module", "Assembly", "Kit", "Spare", "Unit"],
    warehouses: [
      { id: "wh-tilman-1", name: "Leeds Central", location: "Leeds, UK", capacity: 28000 },
      { id: "wh-tilman-2", name: "Manchester Annexe", location: "Manchester, UK", capacity: 19000 },
      { id: "wh-tilman-3", name: "Bristol Depot", location: "Bristol, UK", capacity: 12000 },
      { id: "wh-tilman-4", name: "Glasgow Reserve", location: "Glasgow, UK", capacity: 6000 },
    ],
  },
];

const USER_ROLES: { role: Role; first: string }[] = [
  { role: Role.ADMIN, first: "admin" },
  { role: Role.WAREHOUSE_MANAGER, first: "manager" },
  { role: Role.OPERATOR, first: "operator" },
];

const NAME_BY_ROLE: Record<string, string[]> = {
  "org-coastal": ["Asha Menon", "Ravi Kapoor", "Devi Pillai"],
  "org-meridian": ["Sam Carter", "Jordan Lee", "Riley Brooks"],
  "org-tilman": ["Olivia Hart", "Tom Fielding", "Priya Shah"],
};

// Logins are derived from the person's name (e.g. "Asha Menon" → asha.menon@gmail.com)
// rather than role@org, so an email still makes sense after a user's role changes.
// This email is the identity link: provision-workos.ts mirrors it into WorkOS and
// getCurrentUser() matches the signed-in WorkOS email back to this DB row.
const emailFromName = (name: string) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")}@gmail.com`;

// Specific logins that should not follow the name→email rule. Keyed by user id.
const EMAIL_OVERRIDE: Record<string, string> = {
  "usr-org-coastal-admin": "kiruthikarun2004@gmail.com",
};

async function main() {
  console.log("Seeding…");

  // 1) Orgs + users (upsert → idempotent, FKs preserved).
  for (const org of ORGS) {
    await prisma.organisation.upsert({
      where: { id: org.id },
      update: { name: org.name, slug: org.slug },
      create: { id: org.id, name: org.name, slug: org.slug },
    });

    for (let r = 0; r < USER_ROLES.length; r++) {
      const spec = USER_ROLES[r]!;
      const id = `usr-${org.id}-${spec.first}`;
      const name = NAME_BY_ROLE[org.id]![r]!;
      const email = (EMAIL_OVERRIDE[id] ?? emailFromName(name)).toLowerCase();
      await prisma.user.upsert({
        where: { id },
        // email + name are in update too so re-seeding an existing DB actually
        // refreshes them (the row is keyed by the stable role-based id).
        update: { email, name, role: spec.role, organisationId: org.id },
        create: {
          id,
          email,
          name,
          role: spec.role,
          organisationId: org.id,
        },
      });
    }
  }

  // 2) Wipe + recreate tenant data so re-runs don't duplicate or drift.
  const orgIds = ORGS.map((o) => o.id);
  await prisma.stockMovement.deleteMany({ where: { organisationId: { in: orgIds } } });
  await prisma.inventoryItem.deleteMany({ where: { organisationId: { in: orgIds } } });
  await prisma.warehouse.deleteMany({ where: { organisationId: { in: orgIds } } });

  let totalItems = 0;
  let totalMovements = 0;

  for (const org of ORGS) {
    // Warehouses.
    for (const wh of org.warehouses) {
      await prisma.warehouse.create({
        data: {
          id: wh.id,
          name: wh.name,
          location: wh.location,
          capacity: wh.capacity,
          organisationId: org.id,
        },
      });
    }

    const operatorId = `usr-${org.id}-operator`;
    const managerId = `usr-${org.id}-manager`;

    // Items — 27 per org, distributed unevenly (warehouse 1 busiest).
    // Distribution weights pick which warehouse each item lands in.
    const whWeights = [0.45, 0.3, 0.18, 0.07];
    const itemCount = 27;

    // Velocity class drives movements + stock. Classes are assigned by a fixed
    // quota per org (not pure chance) so EVERY org has a deliberately interesting
    // mix the dashboard can surface: fast movers, low stock, dead stock, and a
    // healthy middle. The dashboard's status keys on OUTBOUND-IN-LAST-30-DAYS, so
    // each class controls how recent its movements are:
    //   fast → many recent outbound (out30 ≥ 120 → FAST)
    //   low  → recent outbound + small ending qty (qty ≤ 20 → LOW)
    //   dead → movements only OLDER than 30 days (out30 = 0 → DEAD)
    //   ok   → moderate recent activity (→ OK)
    type Velocity = "fast" | "low" | "dead" | "ok";
    const CLASS_PLAN: Velocity[] = [
      ...Array<Velocity>(4).fill("fast"),
      ...Array<Velocity>(4).fill("low"),
      ...Array<Velocity>(5).fill("dead"),
      ...Array<Velocity>(14).fill("ok"),
    ]; // = 27

    interface SeedItem {
      id: string;
      qty: number;
      warehouseId: string;
      velocity: Velocity;
    }
    const items: SeedItem[] = [];

    for (let i = 0; i < itemCount; i++) {
      // weighted warehouse choice
      const roll = rand();
      let acc = 0;
      let whIdx = 0;
      for (let w = 0; w < whWeights.length; w++) {
        acc += whWeights[w]!;
        if (roll <= acc) {
          whIdx = w;
          break;
        }
      }
      const cat = pick(org.categories);
      const sku = `${org.slug.slice(0, 3).toUpperCase()}-${cat.slice(0, 3).toUpperCase()}-${String(1000 + i)}`;
      const id = `itm-${org.id}-${i}`;
      const velocity = CLASS_PLAN[i]!;

      // Starting stock by class. Fast movers start deep so heavy outbound never
      // goes negative; low items start modest so they end near empty.
      const startQty =
        velocity === "fast"
          ? int(400, 650)
          : velocity === "low"
            ? int(60, 110)
            : velocity === "dead"
              ? int(40, 200)
              : int(120, 300);

      await prisma.inventoryItem.create({
        data: {
          id,
          sku,
          name: `${cat} ${String.fromCharCode(65 + (i % 26))}${i}`,
          quantity: startQty,
          warehouseId: org.warehouses[whIdx]!.id,
          organisationId: org.id,
        },
      });
      items.push({ id, qty: startQty, warehouseId: org.warehouses[whIdx]!.id, velocity });
      totalItems++;
    }

    // Movements — generated per item by class, with class-specific recency.
    interface Mv {
      itemId: string;
      warehouseId: string;
      type: MovementType;
      quantity: number;
      occurredAt: Date;
    }
    const movements: Mv[] = [];
    const at = (daysAgo: number) =>
      new Date(now - daysAgo * DAY - int(0, DAY - 1));

    for (const item of items) {
      if (item.velocity === "dead") {
        // Dead stock: a little OLD history (31–89 days), nothing recent → out30 = 0.
        const count = int(0, 2);
        for (let m = 0; m < count; m++) {
          movements.push({
            itemId: item.id,
            warehouseId: item.warehouseId,
            type: rand() < 0.5 ? MovementType.INBOUND : MovementType.OUTBOUND,
            quantity: int(3, 15),
            occurredAt: at(int(31, 89)),
          });
        }
        continue;
      }

      // Active classes: how many movements, how outbound-heavy, and how recent.
      const cfg = {
        fast: { count: int(16, 24), outbound: 0.85, recentDays: 30 },
        low: { count: int(8, 12), outbound: 0.8, recentDays: 25 },
        ok: { count: int(4, 9), outbound: 0.55, recentDays: 60 },
      }[item.velocity];

      for (let m = 0; m < cfg.count; m++) {
        // Most movements land inside the recency window so out30 reflects class.
        const daysAgo =
          rand() < 0.75 ? int(0, cfg.recentDays) : int(0, 89);
        const type =
          rand() < cfg.outbound ? MovementType.OUTBOUND : MovementType.INBOUND;
        const quantity = item.velocity === "fast" ? int(10, 40) : int(4, 22);
        movements.push({
          itemId: item.id,
          warehouseId: item.warehouseId,
          type,
          quantity,
          occurredAt: daysAgo === 0 ? at(0) : at(daysAgo),
        });
      }
    }

    // Apply chronologically so final quantities are consistent and never < 0.
    movements.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const liveQty = new Map(items.map((i) => [i.id, i.qty]));
    let mvIdx = 0;
    for (const mv of movements) {
      const cur = liveQty.get(mv.itemId)!;
      let type = mv.type;
      let qty = mv.quantity;
      if (type === MovementType.OUTBOUND && qty > cur) {
        // Not enough stock — flip to an inbound restock instead of going negative.
        type = MovementType.INBOUND;
      }
      const delta = type === MovementType.INBOUND ? qty : -qty;
      liveQty.set(mv.itemId, cur + delta);

      await prisma.stockMovement.create({
        data: {
          id: `mv-${org.id}-${mvIdx++}`,
          type,
          quantity: qty,
          itemId: mv.itemId,
          warehouseId: mv.warehouseId,
          operatorId: rand() < 0.8 ? operatorId : managerId,
          organisationId: org.id,
          occurredAt: mv.occurredAt,
        },
      });
      totalMovements++;
    }

    // Persist final computed quantities.
    for (const [itemId, qty] of liveQty) {
      await prisma.inventoryItem.update({ where: { id: itemId }, data: { quantity: qty } });
    }
  }

  console.log(
    `Done: ${ORGS.length} orgs, ${ORGS.length * 4} warehouses, ${totalItems} items, ${totalMovements} movements, ${ORGS.length * 3} users.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
