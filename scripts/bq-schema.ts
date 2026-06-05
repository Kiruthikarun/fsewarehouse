import type { TableField } from "@google-cloud/bigquery";

// Shared BigQuery schema definitions, used by both setup (createTable) and sync
// (load job) so the created table and the loaded snapshot can never drift.

export const WAREHOUSES_SCHEMA: TableField[] = [
  { name: "warehouse_id", type: "STRING", mode: "REQUIRED" },
  { name: "warehouse_name", type: "STRING" },
  { name: "location", type: "STRING" },
  { name: "capacity", type: "INTEGER" },
  { name: "organisation_id", type: "STRING", mode: "REQUIRED" },
  { name: "organisation_name", type: "STRING" },
  { name: "updated_at", type: "TIMESTAMP" },
];

export const INVENTORY_SCHEMA: TableField[] = [
  { name: "item_id", type: "STRING", mode: "REQUIRED" },
  { name: "sku", type: "STRING" },
  { name: "item_name", type: "STRING" },
  { name: "warehouse_id", type: "STRING" },
  { name: "warehouse_name", type: "STRING" },
  { name: "organisation_id", type: "STRING", mode: "REQUIRED" },
  { name: "organisation_name", type: "STRING" },
  { name: "quantity", type: "INTEGER" },
  { name: "updated_at", type: "TIMESTAMP" },
];

export const MOVEMENTS_SCHEMA: TableField[] = [
  { name: "movement_id", type: "STRING", mode: "REQUIRED" },
  { name: "organisation_id", type: "STRING", mode: "REQUIRED" },
  { name: "warehouse_id", type: "STRING" },
  { name: "warehouse_name", type: "STRING" },
  { name: "item_id", type: "STRING" },
  { name: "sku", type: "STRING" },
  { name: "item_name", type: "STRING" },
  { name: "type", type: "STRING" },
  { name: "quantity", type: "INTEGER" },
  { name: "occurred_at", type: "TIMESTAMP" },
];

export const DATASET = process.env.BIGQUERY_DATASET ?? "warehouse_analytics";
export const LOCATION = process.env.BIGQUERY_LOCATION ?? "US";

// ─── Physical layout (billing-enabled project; blocked on the sandbox) ────────
// movements is the big, scan-heavy table. Every dashboard query filters on
// occurred_at (trailing window) and organisation_id (+ optional warehouse), so:
//   - PARTITION on occurred_at  → a 30-day query prunes to ~30 partitions
//     instead of scanning all history.
//   - CLUSTER on org + warehouse → one tenant stops paying to scan another's
//     rows, and the warehouse dropdown prunes further.
// Together these turn full-table scans into pruned block reads — the read win
// that makes "analytics are faster on BigQuery" hold at lakhs of rows.
export const MOVEMENTS_TIME_PARTITIONING = {
  type: "DAY" as const,
  field: "occurred_at",
};
export const MOVEMENTS_CLUSTERING = ["organisation_id", "warehouse_id"];

// inventory is small but every read filters by org, so clustering is cheap and
// keeps the per-tenant join/scan tight.
export const INVENTORY_CLUSTERING = ["organisation_id"];

// Materialised view: pre-aggregated daily velocity per org+warehouse. The
// dashboard's velocity chart reads this instead of re-scanning raw movements;
// BigQuery auto-maintains it on writes. Needs billing (MV is blocked on sandbox).
export const MOVEMENTS_DAILY_MV = "movements_daily";
