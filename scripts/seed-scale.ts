/**
 * Scale / load-test seed — piles a MASSIVE amount of inventory + movement data
 * onto the EXISTING orgs, warehouses and users so you can prove the analytics
 * dashboard stays fast reading from BigQuery at volume.
 *
 * It creates NO new orgs, warehouses or users. It reuses the 3 orgs / 12
 * warehouses / 9 users from `prisma/seed.ts` and only adds:
 *   - SEED_SCALE_ITEMS inventory items per org  (default 2,000 → 6,000 total)
 *   - SEED_SCALE_COUNT stock movements          (default 100,000)
 * spread across those existing warehouses and operated by those existing users.
 *
 * This is DELIBERATELY separate from prisma/seed.ts:
 *   - prisma/seed.ts = the small, *shaped* demo dataset that makes the dashboard
 *     look good for reviewers. Belongs in production.
 *   - THIS = high-volume synthetic noise for perf testing. Local / perf env only,
 *     NEVER production.
 *
 * Everything it creates is id-prefixed so it owns its rows and can wipe + rebuild
 * them on a re-run (idempotent) without touching the demo data:
 *   - items     → id `scale-itm-<n>`
 *   - movements → id `scale-mv-<n>`
 *
 * NOTE: movement rows are not reconciled against InventoryItem.quantity (we don't
 * replay stock math for 100k+ random rows). The goal is row VOLUME for scan/scale
 * testing, not stock correctness — the demo seed remains the source of truth for
 * believable quantities.
 *
 * Usage (you run this — it is not run automatically):
 *   npm run db:seed                  # once, to create the orgs/warehouses/users
 *   npm run seed:scale               # default: 6,000 items + 100,000 movements
 *   SEED_SCALE_ITEMS=5000 SEED_SCALE_COUNT=500000 npm run seed:scale
 *
 * Env knobs:
 *   SEED_SCALE_ITEMS       items created PER ORG            (default 2000)
 *   SEED_SCALE_COUNT       total movements to insert        (default 100000)
 *   SEED_SCALE_WAREHOUSES  extra warehouses PER ORG         (default 0)
 *   SEED_SCALE_DAYS        spread occurredAt over N days    (default 365)
 *   SEED_SCALE_BATCH       rows per createMany call          (default 5000)
 */
import { PrismaClient, Prisma, MovementType } from "@prisma/client";

const prisma = new PrismaClient();

const ITEMS_PER_ORG = Number(process.env.SEED_SCALE_ITEMS ?? 2_000);
const COUNT = Number(process.env.SEED_SCALE_COUNT ?? 100_000);
const DAYS = Number(process.env.SEED_SCALE_DAYS ?? 365);
const BATCH = Number(process.env.SEED_SCALE_BATCH ?? 5_000);
// Extra warehouses to add PER ORG (default 0 = reuse only the demo warehouses).
// More warehouses spread the stock thinner, so utilisation drops naturally on
// top of the capacity resize below — and gives the warehouse-level charts more
// rows. Added warehouses get id `scale-wh-*` and are wiped/recreated each run.
const EXTRA_WAREHOUSES = Number(process.env.SEED_SCALE_WAREHOUSES ?? 0);

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

const DAY = 24 * 60 * 60 * 1000;

interface ScaleItem {
  id: string;
  warehouseId: string;
  organisationId: string;
}

async function main() {
  if (!Number.isFinite(COUNT) || COUNT <= 0)
    throw new Error(`SEED_SCALE_COUNT must be a positive number (got ${COUNT})`);
  if (!Number.isFinite(ITEMS_PER_ORG) || ITEMS_PER_ORG <= 0)
    throw new Error(`SEED_SCALE_ITEMS must be a positive number (got ${ITEMS_PER_ORG})`);
  if (!Number.isFinite(EXTRA_WAREHOUSES) || EXTRA_WAREHOUSES < 0)
    throw new Error(`SEED_SCALE_WAREHOUSES must be 0 or a positive number (got ${EXTRA_WAREHOUSES})`);

  console.log(
    `Scale seed: ${ITEMS_PER_ORG.toLocaleString()} items/org + ` +
      `${COUNT.toLocaleString()} movements over ${DAYS} days` +
      (EXTRA_WAREHOUSES > 0 ? ` + ${EXTRA_WAREHOUSES} warehouses/org` : "") +
      ` (batch ${BATCH.toLocaleString()}).`,
  );

  // 1) Pull the EXISTING orgs (with their warehouses) and operator/manager users.
  //    Nothing here is created — we only reference what the demo seed made.
  const orgs = await prisma.organisation.findMany({
    include: { warehouses: { select: { id: true } } },
  });
  if (orgs.length === 0)
    throw new Error("No orgs found. Run `npm run db:seed` first.");

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
    `Reusing ${orgs.length} orgs / ` +
      `${orgs.reduce((n, o) => n + o.warehouses.length, 0)} warehouses / ${users.length} users.`,
  );

  // 2) Idempotency: wipe rows from a prior scale run, in FK-safe order —
  //    movements → items → scale warehouses.
  const delMv = await prisma.stockMovement.deleteMany({
    where: { id: { startsWith: "scale-mv-" } },
  });
  const delItm = await prisma.inventoryItem.deleteMany({
    where: { id: { startsWith: "scale-itm-" } },
  });
  const delWh = await prisma.warehouse.deleteMany({
    where: { id: { startsWith: "scale-wh-" } },
  });
  if (delMv.count || delItm.count || delWh.count)
    console.log(
      `Cleared prior scale run: ${delWh.count} warehouses, ` +
        `${delItm.count.toLocaleString()} items, ${delMv.count.toLocaleString()} movements.`,
    );

  // 2b) Optionally add EXTRA_WAREHOUSES per org (for ALL orgs), then build the
  //    per-org warehouse pool = demo warehouses + any new scale warehouses.
  //    Capacity here is a placeholder; step 5 resizes it to fit actual stock.
  const whByOrg = new Map<string, { id: string }[]>();
  for (const org of orgs) {
    whByOrg.set(org.id, [...org.warehouses]);
  }
  if (EXTRA_WAREHOUSES > 0) {
    const newWarehouses: Prisma.WarehouseCreateManyInput[] = [];
    let w = 0; // global counter → unique warehouse id
    for (const org of orgs) {
      for (let k = 0; k < EXTRA_WAREHOUSES; k++) {
        const id = `scale-wh-${w++}`;
        newWarehouses.push({
          id,
          name: `${org.name} Scale DC ${k + 1}`,
          location: "Perf Test Zone",
          capacity: 1, // placeholder, resized in step 5
          organisationId: org.id,
        });
        whByOrg.get(org.id)!.push({ id });
      }
    }
    await prisma.warehouse.createMany({ data: newWarehouses, skipDuplicates: true });
    console.log(
      `Added ${newWarehouses.length} scale warehouses (${EXTRA_WAREHOUSES}/org across ${orgs.length} orgs).`,
    );
  }

  // 3) Generate + bulk-insert inventory items, distributed across each org's
  //    warehouse pool (demo + scale). SKU is globally unique (so it's unique per
  //    warehouse).
  const itemsByOrg = new Map<string, ScaleItem[]>();
  let itemBuf: Prisma.InventoryItemCreateManyInput[] = [];
  let g = 0; // global item counter → unique id + sku
  let itemsInserted = 0;

  const flushItems = async () => {
    if (!itemBuf.length) return;
    await prisma.inventoryItem.createMany({ data: itemBuf, skipDuplicates: true });
    itemsInserted += itemBuf.length;
    itemBuf = [];
    process.stdout.write(`\r  items inserted ${itemsInserted.toLocaleString()}`);
  };

  for (const org of orgs) {
    const pool = whByOrg.get(org.id)!;
    const list: ScaleItem[] = [];
    for (let i = 0; i < ITEMS_PER_ORG; i++) {
      const warehouseId = pick(pool).id;
      const id = `scale-itm-${g}`;
      itemBuf.push({
        id,
        sku: `SCL-${g}`,
        name: `Scale Item ${g}`,
        quantity: int(0, 1000),
        warehouseId,
        organisationId: org.id,
      });
      list.push({ id, warehouseId, organisationId: org.id });
      g++;
      if (itemBuf.length >= BATCH) await flushItems();
    }
    itemsByOrg.set(org.id, list);
  }
  await flushItems();
  process.stdout.write("\n");

  // 4) Generate + bulk-insert movements against those new items. Movements are
  //    split evenly across orgs; each references a random item in that org (so
  //    item → warehouse → org all stay consistent) and a same-org operator.
  const orgIds = orgs.map((o) => o.id);
  const now = Date.now();
  let mvBuf: Prisma.StockMovementCreateManyInput[] = [];
  let mvInserted = 0;

  const flushMv = async () => {
    if (!mvBuf.length) return;
    await prisma.stockMovement.createMany({ data: mvBuf, skipDuplicates: true });
    mvInserted += mvBuf.length;
    mvBuf = [];
    process.stdout.write(
      `\r  movements inserted ${mvInserted.toLocaleString()} / ${COUNT.toLocaleString()}`,
    );
  };

  for (let i = 0; i < COUNT; i++) {
    const orgId = orgIds[i % orgIds.length]!; // even split across orgs
    const item = pick(itemsByOrg.get(orgId)!);
    mvBuf.push({
      id: `scale-mv-${i}`,
      type: rand() < 0.65 ? MovementType.OUTBOUND : MovementType.INBOUND,
      quantity: int(1, 50),
      itemId: item.id,
      warehouseId: item.warehouseId,
      operatorId: pick(usersByOrg.get(orgId)!),
      organisationId: orgId,
      occurredAt: new Date(now - int(0, DAYS * DAY - 1)),
    });
    if (mvBuf.length >= BATCH) await flushMv();
  }
  await flushMv();
  process.stdout.write("\n");

  // 5) Resize warehouse capacities to fit the now-massive stock. The demo seed's
  //    capacities (6k–50k) assume ~80 items; with thousands of scale items each
  //    warehouse holds far more, so the utilisation chart would read 700–1000%.
  //    Set each capacity from its ACTUAL total units (demo + scale) targeting a
  //    realistic 55–85% utilisation, varied per warehouse so the chart stays
  //    interesting. (Re-running db:seed resets these; seed:scale recomputes.)
  const stockByWh = await prisma.inventoryItem.groupBy({
    by: ["warehouseId"],
    _sum: { quantity: true },
  });
  let resized = 0;
  for (const row of stockByWh) {
    const units = row._sum.quantity ?? 0;
    if (units <= 0) continue;
    const targetUtil = 0.55 + rand() * 0.3; // 55–85%
    await prisma.warehouse.update({
      where: { id: row.warehouseId },
      data: { capacity: Math.ceil(units / targetUtil) },
    });
    resized++;
  }
  console.log(
    `Resized ${resized} warehouse capacities to fit current stock (≈55–85% utilisation).`,
  );

  const [totalItems, totalMv] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.stockMovement.count(),
  ]);
  console.log(
    `Done. Inserted ${itemsInserted.toLocaleString()} items + ` +
      `${mvInserted.toLocaleString()} movements.\n` +
      `InventoryItem now holds ${totalItems.toLocaleString()} rows, ` +
      `StockMovement ${totalMv.toLocaleString()} rows (demo + scale).\n` +
      `Next: \`npm run bq:sync\` to mirror into BigQuery, then compare dashboard load times.`,
  );
}

main()
  .catch((e) => {
    console.error("\nScale seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
