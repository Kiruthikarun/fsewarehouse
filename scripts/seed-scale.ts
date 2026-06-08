/**
 * Scale seed — generates a believable *year of warehouse activity* at volume, so
 * the analytics dashboard can be exercised on realistic data that READS like a
 * real operation, not like obviously-synthetic noise.
 *
 * Two shapes, controlled by env:
 *   - No SEED_SCALE_ORG  → spreads volume evenly across ALL orgs (load testing).
 *   - SEED_SCALE_ORG set → pours everything onto ONE org (e.g. Coastal). Pair it
 *     with SEED_SCALE_REPLACE=1 to first WIPE that org's existing items/movements
 *     and rebuild a clean year — so the org looks like real history, not demo +
 *     synthetic mixed together.
 *
 * What "realistic" means here:
 *   - SKUs + names come from a per-category product catalogue (Pallet → PLT-…,
 *     Container → CNT-…, etc.), not `SCL-0` / `Scale Item 0`.
 *   - Items follow a Pareto velocity mix: a few fast movers, many steady, a long
 *     tail of slow, and some dead stock (no outbound) — so the status donut and
 *     top-movers panel look organic.
 *   - Movements are time-shaped: weekdays busier than weekends, a mild upward
 *     growth trend across the year, and business-hours clustering.
 *   - Stock flows are plausible: inbound arrives in batches, outbound leaves in
 *     smaller picks drawn from available stock, so quantity never goes negative
 *     and the final on-hand quantity reflects real inbound − outbound.
 *
 * Internal ids stay prefixed (`scale-itm-…`, `scale-mv-…`, `scale-wh-…`) so a
 * re-run can wipe + rebuild only its own rows. These ids are never shown on the
 * dashboard — the dashboard only sees the realistic sku / name / quantities.
 *
 * Usage (you run this — it is not run automatically):
 *   npm run db:seed                  # once, to create the orgs/warehouses/users
 *   npm run seed:scale               # default: 2,000 items/org + 100,000 movements
 *   # A clean, realistic YEAR onto ONE org (wipes that org's prior data):
 *   SEED_SCALE_ORG=org-coastal SEED_SCALE_REPLACE=1 \
 *     SEED_SCALE_ITEMS=10000 SEED_SCALE_COUNT=500000 npm run seed:scale
 *
 * Env knobs:
 *   SEED_SCALE_ITEMS       items created PER ORG            (default 2000)
 *   SEED_SCALE_COUNT       total movements to insert        (default 100000)
 *   SEED_SCALE_WAREHOUSES  extra warehouses PER ORG         (default 0)
 *   SEED_SCALE_DAYS        spread occurredAt over N days    (default 365)
 *   SEED_SCALE_BATCH       rows per createMany call          (default 5000)
 *   SEED_SCALE_ORG         restrict whole run to ONE org    (default: all orgs)
 *                          — accepts an org id or slug (e.g. org-coastal /
 *                          coastal-logistics).
 *   SEED_SCALE_REPLACE     1 = delete the TARGET org's existing items+movements
 *                          before seeding (requires SEED_SCALE_ORG). (default 0)
 */
import { PrismaClient, Prisma, MovementType } from "@prisma/client";

const prisma = new PrismaClient();

const ITEMS_PER_ORG = Number(process.env.SEED_SCALE_ITEMS ?? 2_000);
const COUNT = Number(process.env.SEED_SCALE_COUNT ?? 100_000);
const DAYS = Number(process.env.SEED_SCALE_DAYS ?? 365);
const BATCH = Number(process.env.SEED_SCALE_BATCH ?? 5_000);
const EXTRA_WAREHOUSES = Number(process.env.SEED_SCALE_WAREHOUSES ?? 0);
const TARGET_ORG = process.env.SEED_SCALE_ORG;
const REPLACE =
  process.env.SEED_SCALE_REPLACE === "1" || process.env.SEED_SCALE_REPLACE === "true";

// Deterministic PRNG (mulberry32) — same family as prisma/seed.ts, so a given
// config always produces the same rows. Re-running is reproducible.
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
const rand = rng(987654);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const range = (t: readonly [number, number]) => int(t[0], t[1]);

const DAY = 24 * 60 * 60 * 1000;

// ── Product catalogue ─────────────────────────────────────────────────────────
// Per category: a SKU prefix, a few realistic product names, an outbound "pick"
// size range and an inbound "batch" size range (bigger items move in smaller
// counts; sacks/components move in larger counts).
interface Cat {
  prefix: string;
  names: string[];
  pick: readonly [number, number];
  batch: readonly [number, number];
}
const CATALOG: Record<string, Cat> = {
  // Coastal Logistics
  Pallet: { prefix: "PLT", names: ["Euro Pallet 1200×800", "Stringer Pallet", "Block Pallet", "Plastic Nestable Pallet", "Heavy-Duty Export Pallet"], pick: [1, 20], batch: [20, 200] },
  Container: { prefix: "CNT", names: ["20ft Dry Container", "40ft High-Cube Container", "Insulated Reefer Container", "Open-Top Container", "Flat-Rack Container"], pick: [1, 6], batch: [3, 24] },
  Crate: { prefix: "CRT", names: ["Collapsible Steel Crate", "Ventilated Produce Crate", "Stackable Plastic Crate", "Timber Export Crate"], pick: [1, 40], batch: [40, 300] },
  Drum: { prefix: "DRM", names: ["200L Steel Drum", "Open-Top Poly Drum", "Tight-Head Drum", "Fibre Drum"], pick: [1, 25], batch: [20, 200] },
  Sack: { prefix: "SCK", names: ["50kg Jute Sack", "Woven PP Sack", "Bulk FIBC Bag", "Paper Valve Sack"], pick: [1, 120], batch: [150, 1200] },
  Reel: { prefix: "REL", names: ["Steel Wire Reel", "Cable Drum Reel", "Fibre-Optic Reel", "Strapping Coil Reel"], pick: [1, 15], batch: [8, 90] },
  // Meridian Stores
  Shelf: { prefix: "SHF", names: ["Boltless Shelf Unit", "Wire Display Shelf", "Long-Span Shelf", "Cantilever Shelf"], pick: [1, 10], batch: [5, 60] },
  Bin: { prefix: "BIN", names: ["Stackable Storage Bin", "Louvre Parts Bin", "Hopper-Front Bin", "Tote Bin"], pick: [1, 30], batch: [20, 200] },
  Carton: { prefix: "CTN", names: ["Single-Wall Carton", "Double-Wall Carton", "Die-Cut Mailer", "Heavy-Duty Carton"], pick: [1, 50], batch: [40, 400] },
  Tray: { prefix: "TRY", names: ["Nestable Stack Tray", "Confectionery Tray", "Component Tray", "Bakery Tray"], pick: [1, 40], batch: [30, 300] },
  Bundle: { prefix: "BDL", names: ["Shrink-Wrapped Bundle", "Banded Bundle", "Mixed-Case Bundle"], pick: [1, 25], batch: [15, 150] },
  Case: { prefix: "CSE", names: ["Retail Shipper Case", "Display-Ready Case", "Bulk Case Pack"], pick: [1, 40], batch: [24, 240] },
  // Tilman & Co.
  Component: { prefix: "CMP", names: ["Precision Bearing", "Hydraulic Seal Kit", "Drive Belt", "Brake Pad Set"], pick: [1, 60], batch: [50, 500] },
  Module: { prefix: "MOD", names: ["Control Module", "Power Module", "Sensor Module", "I/O Module"], pick: [1, 12], batch: [6, 60] },
  Assembly: { prefix: "ASM", names: ["Gearbox Assembly", "Pump Assembly", "Valve Assembly", "Actuator Assembly"], pick: [1, 8], batch: [4, 40] },
  Kit: { prefix: "KIT", names: ["Service Kit", "Maintenance Kit", "Seal Kit", "Repair Kit"], pick: [1, 20], batch: [10, 120] },
  Spare: { prefix: "SPR", names: ["Spare Filter", "Spare Gasket", "Spare Coupling", "Spare Fuse Pack"], pick: [1, 40], batch: [20, 200] },
  Unit: { prefix: "UNT", names: ["Compressor Unit", "Cooling Unit", "Drive Unit", "Display Unit"], pick: [1, 15], batch: [8, 80] },
};
const ORG_CATEGORIES: Record<string, string[]> = {
  "coastal-logistics": ["Pallet", "Container", "Crate", "Drum", "Sack", "Reel"],
  "meridian-stores": ["Shelf", "Bin", "Carton", "Tray", "Bundle", "Case"],
  "tilman-and-co": ["Component", "Module", "Assembly", "Kit", "Spare", "Unit"],
};
const GENERIC_CATEGORIES = ["Pallet", "Crate", "Drum", "Sack"];
const VARIANTS = ["Std", "HD", "XL", "Mk II", "Grade A", "Grade B", "Export", "Food-Grade", "Reinforced", "Compact"];

// ── Velocity classes ──────────────────────────────────────────────────────────
// Probability of each class, its relative movement weight (how much of the total
// movement volume it attracts), its outbound fraction, and its baseline on-hand
// stock at the start of the window.
type ClsName = "fast" | "steady" | "slow" | "dead";
interface ClsPlan {
  cls: ClsName;
  weight: number;
  outFrac: number;
  baseStock: number;
  // ~8% of live items are running low on stock — their on-hand is forced into the
  // ≤20 band so the dashboard's LOW status / low-stock alerts actually populate.
  // (Dead stock is never "low" — it's sitting stock with no outbound.)
  lowStock: boolean;
}
function assignClass(): ClsPlan {
  const r = rand();
  const lowStock = rand() < 0.08;
  if (r < 0.08) return { cls: "fast", weight: 14 + rand() * 10, outFrac: 0.72, baseStock: int(40, 150), lowStock };
  if (r < 0.38) return { cls: "steady", weight: 4 + rand() * 5, outFrac: 0.62, baseStock: int(30, 400), lowStock };
  if (r < 0.8) return { cls: "slow", weight: 0.8 + rand() * 1.6, outFrac: 0.55, baseStock: int(20, 600), lowStock };
  return { cls: "dead", weight: 0.05 + rand() * 0.2, outFrac: 0, baseStock: int(30, 600), lowStock: false };
}

// Cumulative-distribution helpers for weighted sampling.
function buildCdf(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const cdf: number[] = [];
  let acc = 0;
  for (const w of weights) {
    acc += w / total;
    cdf.push(acc);
  }
  return cdf;
}
function sampleCdf(cdf: number[], r: number): number {
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid]! < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

async function main() {
  if (!Number.isFinite(COUNT) || COUNT <= 0)
    throw new Error(`SEED_SCALE_COUNT must be a positive number (got ${COUNT})`);
  if (!Number.isFinite(ITEMS_PER_ORG) || ITEMS_PER_ORG <= 0)
    throw new Error(`SEED_SCALE_ITEMS must be a positive number (got ${ITEMS_PER_ORG})`);
  if (!Number.isFinite(DAYS) || DAYS <= 0)
    throw new Error(`SEED_SCALE_DAYS must be a positive number (got ${DAYS})`);
  if (!Number.isFinite(EXTRA_WAREHOUSES) || EXTRA_WAREHOUSES < 0)
    throw new Error(`SEED_SCALE_WAREHOUSES must be 0 or a positive number (got ${EXTRA_WAREHOUSES})`);
  if (REPLACE && !TARGET_ORG)
    throw new Error("SEED_SCALE_REPLACE=1 requires SEED_SCALE_ORG — refusing to wipe every org's data.");

  console.log(
    `Scale seed: ${ITEMS_PER_ORG.toLocaleString()} items/org + ` +
      `${COUNT.toLocaleString()} movements over ${DAYS} days` +
      (EXTRA_WAREHOUSES > 0 ? ` + ${EXTRA_WAREHOUSES} warehouses/org` : "") +
      ` (batch ${BATCH.toLocaleString()})${REPLACE ? ", REPLACE mode" : ""}.`,
  );

  // 1) Pull the EXISTING orgs (with their warehouses) and operator/manager users.
  let orgs = await prisma.organisation.findMany({
    include: { warehouses: { select: { id: true } } },
  });
  if (orgs.length === 0)
    throw new Error("No orgs found. Run `npm run db:seed` first.");

  if (TARGET_ORG) {
    orgs = orgs.filter((o) => o.id === TARGET_ORG || o.slug === TARGET_ORG);
    if (orgs.length === 0)
      throw new Error(`SEED_SCALE_ORG=${TARGET_ORG} matched no org (by id or slug).`);
    console.log(`Targeting a single org: ${orgs[0]!.name} (${orgs[0]!.id}).`);
  }

  const users = await prisma.user.findMany({
    where: { role: { in: ["OPERATOR", "WAREHOUSE_MANAGER"] } },
    select: { id: true, organisationId: true },
  });
  const usersByOrg = new Map<string, string[]>();
  for (const u of users) {
    const list = usersByOrg.get(u.organisationId) ?? [];
    list.push(u.id);
    usersByOrg.set(u.organisationId, list);
  }

  for (const org of orgs) {
    if (org.warehouses.length === 0)
      throw new Error(`Org ${org.id} has no warehouses — run db:seed first.`);
    if (!usersByOrg.get(org.id)?.length)
      throw new Error(`Org ${org.id} has no operator/manager — run db:seed first.`);
  }
  console.log(
    `Reusing ${orgs.length} org(s) / ` +
      `${orgs.reduce((n, o) => n + o.warehouses.length, 0)} warehouses / ${users.length} users.`,
  );

  // 2) Idempotency: wipe rows from a prior scale run (movements → items → scale
  //    warehouses, FK-safe).
  const delMv = await prisma.stockMovement.deleteMany({ where: { id: { startsWith: "scale-mv-" } } });
  const delItm = await prisma.inventoryItem.deleteMany({ where: { id: { startsWith: "scale-itm-" } } });
  const delWh = await prisma.warehouse.deleteMany({ where: { id: { startsWith: "scale-wh-" } } });
  if (delMv.count || delItm.count || delWh.count)
    console.log(
      `Cleared prior scale run: ${delWh.count} warehouses, ` +
        `${delItm.count.toLocaleString()} items, ${delMv.count.toLocaleString()} movements.`,
    );

  // 2a) REPLACE mode: wipe the TARGET org's existing items + movements entirely
  //     (demo + any leftover), so we rebuild a clean year for just that org. The
  //     org, its warehouses and users are kept. Guarded above to require a target.
  if (REPLACE) {
    for (const org of orgs) {
      const dm = await prisma.stockMovement.deleteMany({ where: { organisationId: org.id } });
      const di = await prisma.inventoryItem.deleteMany({ where: { organisationId: org.id } });
      console.log(
        `REPLACE: cleared ${org.name} — ${di.count.toLocaleString()} items, ` +
          `${dm.count.toLocaleString()} movements (demo + scale).`,
      );
    }
  }

  // 2b) Optionally add EXTRA_WAREHOUSES per org, then build each org's warehouse
  //     pool (demo + scale). Capacity is a placeholder; step 5 resizes it.
  const whByOrg = new Map<string, { id: string }[]>();
  for (const org of orgs) whByOrg.set(org.id, [...org.warehouses]);
  if (EXTRA_WAREHOUSES > 0) {
    const newWarehouses: Prisma.WarehouseCreateManyInput[] = [];
    let w = 0;
    for (const org of orgs) {
      for (let k = 0; k < EXTRA_WAREHOUSES; k++) {
        const id = `scale-wh-${w++}`;
        newWarehouses.push({
          id,
          name: `${org.name} Scale DC ${k + 1}`,
          location: "Perf Test Zone",
          capacity: 1,
          organisationId: org.id,
        });
        whByOrg.get(org.id)!.push({ id });
      }
    }
    await prisma.warehouse.createMany({ data: newWarehouses, skipDuplicates: true });
    console.log(`Added ${newWarehouses.length} scale warehouses (${EXTRA_WAREHOUSES}/org across ${orgs.length} orgs).`);
  }

  // ── Time shaping: a per-day weight curve over the last DAYS days ─────────────
  // Weekdays busier than weekends, with a mild upward growth trend across the
  // year. occurredAt is sampled from this curve + clustered into business hours.
  const now = Date.now();
  const dayWeights: number[] = [];
  for (let d = 0; d < DAYS; d++) {
    const dow = new Date(now - d * DAY).getDay(); // 0 Sun … 6 Sat
    const weekday = dow === 0 ? 0.25 : dow === 6 ? 0.55 : 1;
    const ageFrac = DAYS > 1 ? (DAYS - 1 - d) / (DAYS - 1) : 1; // 0 oldest … 1 newest
    const growth = 0.65 + 0.7 * ageFrac;
    dayWeights.push(weekday * growth);
  }
  const dayCdf = buildCdf(dayWeights);
  const sampleOccurredAt = (): Date => {
    const d = sampleCdf(dayCdf, rand());
    const date = new Date(now - d * DAY);
    const hour = 6 + Math.floor(((rand() + rand()) / 2) * 13); // 6…18, peaked midday
    date.setHours(hour, int(0, 59), int(0, 59), 0);
    if (date.getTime() > now) date.setTime(now - int(1, 90) * 60_000);
    return date;
  };

  // Per-org movement budget: even split when no target, all on the one org when
  // targeted (largest-remainder so the totals sum to exactly COUNT).
  const perOrgCount = new Map<string, number>();
  {
    const base = Math.floor(COUNT / orgs.length);
    const rem = COUNT - base * orgs.length;
    orgs.forEach((o, i) => perOrgCount.set(o.id, base + (i < rem ? 1 : 0)));
  }

  // ── Generate, then bulk-insert (items first, then their movements: FK-safe) ──
  let itemBuf: Prisma.InventoryItemCreateManyInput[] = [];
  let mvBuf: Prisma.StockMovementCreateManyInput[] = [];
  let g = 0; // global item counter → unique id + sku
  let mi = 0; // global movement counter → unique id
  let itemsInserted = 0;
  let mvInserted = 0;

  const flushItems = async () => {
    if (!itemBuf.length) return;
    await prisma.inventoryItem.createMany({ data: itemBuf, skipDuplicates: true });
    itemsInserted += itemBuf.length;
    itemBuf = [];
    process.stdout.write(`\r  items inserted ${itemsInserted.toLocaleString()}`);
  };
  const flushMv = async () => {
    if (!mvBuf.length) return;
    await prisma.stockMovement.createMany({ data: mvBuf, skipDuplicates: true });
    mvInserted += mvBuf.length;
    mvBuf = [];
    process.stdout.write(`\r  movements inserted ${mvInserted.toLocaleString()} / ${COUNT.toLocaleString()}`);
  };

  for (const org of orgs) {
    const pool = whByOrg.get(org.id)!;
    const whCdf = buildCdf(pool.map((_, k) => pool.length - k)); // first warehouse heaviest
    const opIds = usersByOrg.get(org.id)!;
    const cats = ORG_CATEGORIES[org.slug] ?? GENERIC_CATEGORIES;
    const orgCount = perOrgCount.get(org.id)!;

    // Plan items first so we know the total weight before allocating movements.
    interface Plan {
      id: string;
      sku: string;
      name: string;
      warehouseId: string;
      cat: Cat;
      plan: ClsPlan;
    }
    const plans: Plan[] = [];
    for (let i = 0; i < ITEMS_PER_ORG; i++) {
      const category = pick(cats);
      const cat = CATALOG[category]!;
      const warehouseId = pool[sampleCdf(whCdf, rand())]!.id;
      // Append a variant unless it would duplicate a word already in the name
      // (avoids "Timber Export Crate Export").
      const base = pick(cat.names);
      const variant = pick(VARIANTS);
      const name = base.includes(variant) ? base : `${base} ${variant}`;
      plans.push({
        id: `scale-itm-${g}`,
        sku: `${cat.prefix}-${String(g).padStart(6, "0")}`,
        name,
        warehouseId,
        cat,
        plan: assignClass(),
      });
      g++;
    }
    const totalWeight = plans.reduce((a, p) => a + p.plan.weight, 0) || 1;

    // Stage all of this org's rows in memory, then insert items, then movements.
    const itemRows: Prisma.InventoryItemCreateManyInput[] = [];
    const mvRows: Prisma.StockMovementCreateManyInput[] = [];
    let carry = 0;
    for (const p of plans) {
      // How many movements this item attracts (largest-remainder carry → total
      // across the org lands exactly on orgCount).
      carry += (orgCount * p.plan.weight) / totalWeight;
      const n = Math.floor(carry);
      carry -= n;

      let nOut = Math.round(n * p.plan.outFrac);
      let nIn = n - nOut;
      if (nOut > 0 && nIn === 0) {
        nIn = 1;
        nOut = n - 1;
      }

      // Inbound batches first → establishes the stock available to draw from.
      let avail = p.plan.baseStock;
      for (let k = 0; k < nIn; k++) {
        const q = range(p.cat.batch);
        avail += q;
        mvRows.push({
          id: `scale-mv-${mi++}`,
          type: MovementType.INBOUND,
          quantity: q,
          itemId: p.id,
          warehouseId: p.warehouseId,
          operatorId: pick(opIds),
          organisationId: org.id,
          occurredAt: sampleOccurredAt(),
        });
      }
      // Guarantee enough on hand to give each outbound ≥ 1 unit.
      if (avail < nOut) avail = nOut;

      // Outbound picks drawn from available stock, leaving ≥ 1 for each remaining
      // pick so quantity never goes negative.
      for (let k = 0; k < nOut; k++) {
        const mustLeave = nOut - 1 - k;
        const cap = Math.max(1, Math.min(p.cat.pick[1], avail - mustLeave));
        const q = int(1, cap);
        avail -= q;
        mvRows.push({
          id: `scale-mv-${mi++}`,
          type: MovementType.OUTBOUND,
          quantity: q,
          itemId: p.id,
          warehouseId: p.warehouseId,
          operatorId: pick(opIds),
          organisationId: org.id,
          occurredAt: sampleOccurredAt(),
        });
      }

      // On-hand = baseStock + inbound − outbound, except low-stock items which are
      // forced into the ≤20 band so the LOW dashboard status populates.
      const onHand = p.plan.lowStock && p.plan.cls !== "dead" ? int(2, 20) : avail;
      itemRows.push({
        id: p.id,
        sku: p.sku,
        name: p.name,
        quantity: onHand,
        warehouseId: p.warehouseId,
        organisationId: org.id,
      });
    }

    // Insert items, then movements (movements FK-reference the items).
    for (const row of itemRows) {
      itemBuf.push(row);
      if (itemBuf.length >= BATCH) await flushItems();
    }
    await flushItems();
    for (const row of mvRows) {
      mvBuf.push(row);
      if (mvBuf.length >= BATCH) await flushMv();
    }
    await flushMv();
  }
  process.stdout.write("\n");

  // 5) Resize warehouse capacities to fit the now-much-larger stock, scoped to
  //    the SEEDED orgs' warehouses only (with no target, `orgs` is every org).
  //    Targets a realistic 55–85% utilisation, varied per warehouse.
  const targetWhIds = orgs.flatMap((o) => whByOrg.get(o.id)!.map((w) => w.id));
  const stockByWh = await prisma.inventoryItem.groupBy({
    by: ["warehouseId"],
    where: { warehouseId: { in: targetWhIds } },
    _sum: { quantity: true },
  });
  let resized = 0;
  for (const row of stockByWh) {
    const units = row._sum.quantity ?? 0;
    if (units <= 0) continue;
    const targetUtil = 0.55 + rand() * 0.3;
    await prisma.warehouse.update({
      where: { id: row.warehouseId },
      data: { capacity: Math.ceil(units / targetUtil) },
    });
    resized++;
  }
  console.log(`Resized ${resized} warehouse capacities to fit current stock (≈55–85% utilisation).`);

  const [totalItems, totalMv] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.stockMovement.count(),
  ]);
  console.log(
    `Done. Inserted ${itemsInserted.toLocaleString()} items + ` +
      `${mvInserted.toLocaleString()} movements.\n` +
      `InventoryItem now holds ${totalItems.toLocaleString()} rows, ` +
      `StockMovement ${totalMv.toLocaleString()} rows.\n` +
      `Next: \`npm run bq:sync\` to mirror into BigQuery, then open the dashboard.`,
  );
}

main()
  .catch((e) => {
    console.error("\nScale seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
