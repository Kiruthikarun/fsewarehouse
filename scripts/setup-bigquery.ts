/**
 * One-time (idempotent) BigQuery setup: creates the analytics dataset, the
 * denormalised `warehouses` / `inventory` / `movements` tables, and the
 * `movements_daily` materialised view. Safe to re-run — existing objects are
 * left alone.
 *
 * The movements table is PARTITIONED (by occurred_at) and CLUSTERED (by org +
 * warehouse); inventory is clustered by org. These need a billing-enabled
 * project (they're blocked on the BigQuery sandbox) — see README → Analytics.
 *
 *   GCP_PROJECT_ID=... BIGQUERY_DATASET=warehouse_analytics npm run bq:setup
 */
import { BigQuery, type TableField } from "@google-cloud/bigquery";
import {
  DATASET,
  LOCATION,
  WAREHOUSES_SCHEMA,
  INVENTORY_SCHEMA,
  MOVEMENTS_SCHEMA,
  MOVEMENTS_TIME_PARTITIONING,
  MOVEMENTS_CLUSTERING,
  INVENTORY_CLUSTERING,
  MOVEMENTS_DAILY_MV,
} from "./bq-schema";

interface TableOpts {
  timePartitioning?: { type: "DAY"; field: string };
  clustering?: string[];
}

async function ensureTable(
  bq: BigQuery,
  name: string,
  schema: TableField[],
  opts: TableOpts = {},
) {
  const dataset = bq.dataset(DATASET);
  const table = dataset.table(name);
  const [exists] = await table.exists();
  if (exists) {
    console.log(`✓ table ${name} already exists`);
    return;
  }
  await dataset.createTable(name, {
    schema,
    ...(opts.timePartitioning
      ? { timePartitioning: opts.timePartitioning }
      : {}),
    ...(opts.clustering ? { clustering: { fields: opts.clustering } } : {}),
  });
  const layout = [
    opts.timePartitioning && `partition=${opts.timePartitioning.field}`,
    opts.clustering && `cluster=${opts.clustering.join(",")}`,
  ]
    .filter(Boolean)
    .join(" ");
  console.log(`+ created table ${name}${layout ? ` (${layout})` : ""}`);
}

async function ensureMaterializedView(bq: BigQuery, projectId: string) {
  const ref = `\`${projectId}.${DATASET}.${MOVEMENTS_DAILY_MV}\``;
  const base = `\`${projectId}.${DATASET}.movements\``;
  // CREATE MATERIALIZED VIEW IF NOT EXISTS is idempotent. Clustered by org+
  // warehouse so the dashboard's per-tenant velocity query prunes. No ORDER BY
  // / non-deterministic functions — MV restrictions. BigQuery keeps it fresh
  // automatically as movements are loaded.
  const sql = `
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${ref}
    CLUSTER BY organisation_id, warehouse_id
    AS
    SELECT
      organisation_id,
      warehouse_id,
      DATE(occurred_at) AS day,
      SUM(IF(type = 'INBOUND',  quantity, 0)) AS inbound,
      SUM(IF(type = 'OUTBOUND', quantity, 0)) AS outbound,
      COUNT(*) AS movement_count
    FROM ${base}
    GROUP BY organisation_id, warehouse_id, day`;
  await bq.query({ query: sql, location: LOCATION });
  console.log(`✓ materialised view ${MOVEMENTS_DAILY_MV} ready`);
}

async function main() {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("GCP_PROJECT_ID is required");

  const bq = new BigQuery({ projectId, location: LOCATION });

  const [dsExists] = await bq.dataset(DATASET).exists();
  if (!dsExists) {
    await bq.createDataset(DATASET, { location: LOCATION });
    console.log(`+ created dataset ${DATASET} (${LOCATION})`);
  } else {
    console.log(`✓ dataset ${DATASET} already exists`);
  }

  await ensureTable(bq, "warehouses", WAREHOUSES_SCHEMA);
  await ensureTable(bq, "inventory", INVENTORY_SCHEMA, {
    clustering: INVENTORY_CLUSTERING,
  });
  await ensureTable(bq, "movements", MOVEMENTS_SCHEMA, {
    timePartitioning: MOVEMENTS_TIME_PARTITIONING,
    clustering: MOVEMENTS_CLUSTERING,
  });

  // MV depends on the movements table existing first.
  await ensureMaterializedView(bq, projectId);

  console.log("BigQuery setup complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
