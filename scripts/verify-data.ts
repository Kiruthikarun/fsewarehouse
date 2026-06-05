/**
 * Verify what's actually stored in Postgres after a (scale) seed.
 *
 * Prints a quick health report straight from the transactional DB via Prisma:
 * total row counts, how many are demo vs scale rows, a per-org / per-type
 * breakdown, the occurredAt date range, and a few sample rows so you can eyeball
 * real values. Read-only — it never writes.
 *
 *   npm run verify:data
 *
 * For raw SQL against the local docker Postgres instead, see the psql commands
 * printed at the end (or in scripts/verify-data.sql).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [
    whByOrg,
    warehouses,
    stockByWh,
    itemsTotal,
    itemsScale,
    total,
    scale,
    demoApprox,
    byType,
    byOrg,
    range,
    sample,
  ] = await Promise.all([
      prisma.warehouse.groupBy({
        by: ["organisationId"],
        _count: { _all: true },
      }),
      prisma.warehouse.findMany({
        select: { id: true, name: true, capacity: true, organisationId: true },
        orderBy: [{ organisationId: "asc" }, { name: "asc" }],
      }),
      prisma.inventoryItem.groupBy({
        by: ["warehouseId"],
        _sum: { quantity: true },
      }),
      prisma.inventoryItem.count(),
      prisma.inventoryItem.count({ where: { id: { startsWith: "scale-itm-" } } }),
      prisma.stockMovement.count(),
      prisma.stockMovement.count({ where: { id: { startsWith: "scale-mv-" } } }),
      prisma.stockMovement.count({ where: { id: { startsWith: "mv-" } } }),
      prisma.stockMovement.groupBy({ by: ["type"], _count: { _all: true } }),
      prisma.stockMovement.groupBy({
        by: ["organisationId"],
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      prisma.stockMovement.aggregate({
        _min: { occurredAt: true },
        _max: { occurredAt: true },
      }),
      prisma.stockMovement.findMany({
        take: 5,
        orderBy: { occurredAt: "desc" },
        select: {
          id: true,
          type: true,
          quantity: true,
          organisationId: true,
          warehouseId: true,
          occurredAt: true,
        },
      }),
    ]);

  console.log("\n══════════════ Stored data report (Postgres) ══════════════\n");
  console.log(`InventoryItem total       : ${itemsTotal.toLocaleString()}`);
  console.log(`  └─ scale (scale-itm-*)  : ${itemsScale.toLocaleString()}`);
  console.log(`\nStockMovement total       : ${total.toLocaleString()}`);
  console.log(`  ├─ demo rows (mv-*)     : ${demoApprox.toLocaleString()}`);
  console.log(`  └─ scale (scale-mv-*)   : ${scale.toLocaleString()}`);

  console.log(`\nBy type:`);
  for (const t of byType) {
    console.log(`  ${t.type.padEnd(9)} : ${t._count._all.toLocaleString()}`);
  }

  console.log(`\nBy organisation:`);
  for (const o of byOrg) {
    console.log(
      `  ${o.organisationId.padEnd(14)} : ${o._count._all
        .toLocaleString()
        .padStart(10)} rows   (Σqty ${(o._sum.quantity ?? 0).toLocaleString()})`,
    );
  }

  console.log(`\nWarehouses per organisation:`);
  for (const w of whByOrg) {
    console.log(`  ${w.organisationId.padEnd(14)} : ${w._count._all} warehouses`);
  }

  // Capacity + utilisation straight from Postgres — confirms the resize landed
  // here (not just BigQuery) and that utilisation is back under 100%.
  const unitsByWh = new Map(
    stockByWh.map((s) => [s.warehouseId, s._sum.quantity ?? 0]),
  );
  console.log(`\nWarehouse capacity vs stock (Postgres):`);
  for (const wh of warehouses) {
    const units = unitsByWh.get(wh.id) ?? 0;
    const util = wh.capacity > 0 ? (units / wh.capacity) * 100 : 0;
    const flag = util > 100 ? "  ⚠ OVER" : "";
    console.log(
      `  ${wh.name.padEnd(24)} cap=${String(wh.capacity).padStart(10)} ` +
        `units=${String(units).padStart(10)} util=${util.toFixed(0).padStart(4)}%${flag}`,
    );
  }

  console.log(`\nDate range (occurredAt):`);
  console.log(`  earliest : ${range._min.occurredAt?.toISOString() ?? "—"}`);
  console.log(`  latest   : ${range._max.occurredAt?.toISOString() ?? "—"}`);

  console.log(`\nMost recent 5 rows:`);
  for (const r of sample) {
    console.log(
      `  ${r.id.padEnd(14)} ${r.type.padEnd(9)} qty=${String(r.quantity).padStart(3)} ` +
        `${r.organisationId.padEnd(14)} ${r.warehouseId.padEnd(14)} ${r.occurredAt.toISOString()}`,
    );
  }
  console.log("\n════════════════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error("verify failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
