/**
 * Postgres → BigQuery sync (idempotent).
 *
 * Strategy: scheduled batch — full-snapshot LOAD with WRITE_TRUNCATE.
 *   1. Read the current state from Postgres, denormalised for analytics.
 *   2. Bulk-LOAD it into the live tables with writeDisposition=WRITE_TRUNCATE,
 *      which atomically REPLACES each table's contents with the new snapshot.
 *
 * Why this design:
 *   - Idempotent by construction: each run overwrites the table with the current
 *     snapshot, so running it twice produces a byte-for-byte identical result —
 *     nothing can ever be double-counted. (This is actually a *stronger*
 *     idempotency guarantee than an INSERT-only MERGE.)
 *   - Uses ONLY load jobs — no DML (no MERGE/UPDATE/DELETE). That keeps it fully
 *     compatible with the **BigQuery sandbox (free, no billing)**, which blocks
 *     DML. Load jobs are also free and have far higher quotas than DML.
 *   - Deletions in Postgres are reflected automatically (the row simply isn't in
 *     the next snapshot), which a naive INSERT-only sync would miss.
 *
 * Trade-off vs. staging + MERGE: full-snapshot replace re-writes the whole table
 * every run. For this dataset (~80 items, a few hundred movements) that's
 * trivial. At high volume you'd switch to an incremental MERGE on a watermark
 * (occurred_at / updated_at) to avoid rewriting unchanged history — which needs
 * DML, i.e. a billing-enabled project. See README → Sync architecture.
 *
 * Intended to run as a Cloud Run Job on a Cloud Scheduler cron.
 *
 *   GCP_PROJECT_ID=... DATABASE_URL=... npm run bq:sync
 */
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BigQuery, type TableField } from "@google-cloud/bigquery";
import { PrismaClient } from "@prisma/client";
import {
  DATASET,
  LOCATION,
  WAREHOUSES_SCHEMA,
  INVENTORY_SCHEMA,
  MOVEMENTS_SCHEMA,
} from "./bq-schema";

const prisma = new PrismaClient();

async function loadSnapshot(
  bq: BigQuery,
  table: string,
  schema: TableField[],
  rows: Record<string, unknown>[],
) {
  const dir = mkdtempSync(join(tmpdir(), "bqsync-"));
  const file = join(dir, `${table}.ndjson`);
  // An empty snapshot is valid — it truncates the table to zero rows.
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n"));

  await bq
    .dataset(DATASET)
    .table(table)
    .load(file, {
      schema: { fields: schema },
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      // Atomically replace the whole table with this snapshot → idempotent.
      writeDisposition: "WRITE_TRUNCATE",
      createDisposition: "CREATE_IF_NEEDED",
      location: LOCATION,
    });

  console.log(`✓ loaded ${rows.length} rows → ${DATASET}.${table} (WRITE_TRUNCATE)`);
}

async function main() {
  const project = process.env.GCP_PROJECT_ID;
  if (!project) throw new Error("GCP_PROJECT_ID is required");
  const bq = new BigQuery({ projectId: project, location: LOCATION });

  // ── 1. Read + denormalise from Postgres ──────────────────────────────────
  // All orgs are read into the mirror; tenant isolation is enforced at READ time
  // in src/lib/bigquery.ts (every query is filtered by organisation_id).
  const warehouseList = await prisma.warehouse.findMany({
    include: { organisation: true },
  });
  const items = await prisma.inventoryItem.findMany({
    include: { warehouse: true, organisation: true },
  });
  const movements = await prisma.stockMovement.findMany({
    include: { item: true, warehouse: true },
  });

  const warehouseRows = warehouseList.map((w) => ({
    warehouse_id: w.id,
    warehouse_name: w.name,
    location: w.location,
    capacity: w.capacity,
    organisation_id: w.organisationId,
    organisation_name: w.organisation.name,
    updated_at: w.updatedAt.toISOString(),
  }));

  const inventoryRows = items.map((i) => ({
    item_id: i.id,
    sku: i.sku,
    item_name: i.name,
    warehouse_id: i.warehouseId,
    warehouse_name: i.warehouse.name,
    organisation_id: i.organisationId,
    organisation_name: i.organisation.name,
    quantity: i.quantity,
    updated_at: i.updatedAt.toISOString(),
  }));

  const movementRows = movements.map((m) => ({
    movement_id: m.id,
    organisation_id: m.organisationId,
    warehouse_id: m.warehouseId,
    warehouse_name: m.warehouse.name,
    item_id: m.itemId,
    sku: m.item.sku,
    item_name: m.item.name,
    type: m.type,
    quantity: m.quantity,
    occurred_at: m.occurredAt.toISOString(),
  }));

  console.log(
    `Read ${warehouseRows.length} warehouses, ${inventoryRows.length} items, ` +
      `${movementRows.length} movements from Postgres.`,
  );

  // ── 2. Load full snapshots (WRITE_TRUNCATE) ──────────────────────────────
  await loadSnapshot(bq, "warehouses", WAREHOUSES_SCHEMA, warehouseRows);
  await loadSnapshot(bq, "inventory", INVENTORY_SCHEMA, inventoryRows);
  await loadSnapshot(bq, "movements", MOVEMENTS_SCHEMA, movementRows);

  console.log("Sync complete. BigQuery now mirrors Postgres (idempotent).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
