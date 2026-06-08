import { BigQuery } from "@google-cloud/bigquery";
import { unstable_cache } from "next/cache";
import type { Role } from "@prisma/client";

/**
 * BigQuery analytics read layer.
 *
 * The dashboard reads ONLY from here — never from Postgres. Queries are always
 * parameterised by organisationId so the analytics path enforces the same
 * tenant isolation as the transactional path. (BQ has no row-level security in
 * the sandbox tier; the isolation guarantee is that the *only* code that issues
 * these queries injects the caller's org id — see dashboard/page.tsx.)
 */

export const DATASET = process.env.BIGQUERY_DATASET ?? "warehouse_analytics";
export const WAREHOUSES_TABLE = "warehouses";
export const INVENTORY_TABLE = "inventory";
export const MOVEMENTS_TABLE = "movements";
// Pre-aggregated daily velocity per org+warehouse (created in scripts/bq-schema.ts).
// The velocity chart reads this instead of re-scanning raw movements.
export const MOVEMENTS_DAILY_MV = "movements_daily";

let client: BigQuery | null = null;

export function bq(): BigQuery {
  if (!client) {
    client = new BigQuery({
      projectId: process.env.GCP_PROJECT_ID,
      location: process.env.BIGQUERY_LOCATION ?? "US",
      // On Cloud Run, ADC (the runtime service account) is used automatically.
      // Locally, GOOGLE_APPLICATION_CREDENTIALS points at a key file.
    });
  }
  return client;
}

export function isConfigured(): boolean {
  return Boolean(process.env.GCP_PROJECT_ID);
}

function ds() {
  return `\`${process.env.GCP_PROJECT_ID}.${DATASET}\``;
}

async function query<T>(
  sql: string,
  params: Record<string, unknown>,
  types?: Record<string, string>,
): Promise<T[]> {
  const [rows] = await bq().query({
    query: sql,
    params,
    // BigQuery needs explicit types to bind a NULL parameter (the "all
    // warehouses" case passes warehouseId = null). Without this it errors.
    types,
    location: process.env.BIGQUERY_LOCATION ?? "US",
  });
  return rows as T[];
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export interface AnalyticsFilter {
  orgId: string;
  /** Trailing-window size in days (7, 30, 90, 365). */
  days: number;
  /** Single-warehouse scope; null = every warehouse in the org. */
  warehouseId?: string | null;
}

/**
 * Shared params + types for a filtered query. `warehouseId` is always typed
 * (STRING) so a NULL binds cleanly, and the `@warehouseId IS NULL OR …` guard
 * collapses to "no filter" when it's null.
 */
function scope(f: AnalyticsFilter) {
  return {
    params: { orgId: f.orgId, days: f.days, warehouseId: f.warehouseId ?? null },
    types: { orgId: "STRING", days: "INT64", warehouseId: "STRING" } as Record<
      string,
      string
    >,
  };
}

const WH = "(@warehouseId IS NULL OR warehouse_id = @warehouseId)";
const SINCE =
  "occurred_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)";

// ─── Sync watermark (the live-tail merge boundary) ───────────────────────────

/**
 * The newest movement instant present in the BigQuery mirror, for this scope.
 *
 * The sync is a full-snapshot WRITE_TRUNCATE, and `movements_daily` is a
 * materialised view over the synced `movements` table — so BigQuery knows about
 * exactly those movements with `occurred_at <= MAX(occurred_at)`. Since
 * `occurredAt` defaults to `now()` at write time, any Postgres movement *newer*
 * than this watermark is guaranteed not yet synced. That makes this the precise,
 * collision-free boundary the live tail reads from (see analytics-live.ts) — the
 * two sides are disjoint, so the merge can never double-count.
 *
 * Returned as an ISO-8601 string (UTC) for a clean `new Date(...)` parse; null
 * when the scope has no synced movements (an empty mirror — nothing to merge
 * against, so the whole window is safe to take live).
 *
 * Captured INSIDE loadAnalytics (and so cached with the base via getAnalytics),
 * not read live per request. That coherence is the point: if it were read fresh
 * while the base stayed cached, a sync could advance this past what the cached
 * base contains, dropping the in-between movements from both base and tail for
 * up to one cache window. Cached together, base and boundary always agree.
 */
export async function getSyncWatermark(f: AnalyticsFilter): Promise<string | null> {
  const s = scope(f);
  const rows = await query<{ watermark: string | null }>(
    `SELECT FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', MAX(occurred_at), 'UTC') AS watermark
     FROM ${ds()}.${MOVEMENTS_TABLE}
     WHERE organisation_id = @orgId AND ${WH}`,
    s.params,
    s.types,
  );
  return rows[0]?.watermark ?? null;
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

export interface Kpis {
  totalItems: number;
  totalUnits: number;
  warehouses: number;
  movementsInRange: number;
}

export async function getKpis(f: AnalyticsFilter): Promise<Kpis> {
  const s = scope(f);
  // Three small COUNT/SUM scans, run together rather than sequentially.
  const [[inv], [whs], [mov]] = await Promise.all([
    query<{ items: number; units: number }>(
      `SELECT COUNT(*) AS items, IFNULL(SUM(quantity), 0) AS units
       FROM ${ds()}.${INVENTORY_TABLE}
       WHERE organisation_id = @orgId AND ${WH}`,
      s.params,
      s.types,
    ),
    // Warehouse count comes from the warehouses table, not DISTINCT over
    // inventory, so an empty warehouse still counts and a deleted one stops
    // counting — the KPI tracks Postgres truth, not just where stock sits.
    query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${ds()}.${WAREHOUSES_TABLE}
       WHERE organisation_id = @orgId AND ${WH}`,
      s.params,
      s.types,
    ),
    query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${ds()}.${MOVEMENTS_TABLE}
       WHERE organisation_id = @orgId AND ${WH} AND ${SINCE}`,
      s.params,
      s.types,
    ),
  ]);
  return {
    totalItems: Number(inv?.items ?? 0),
    totalUnits: Number(inv?.units ?? 0),
    warehouses: Number(whs?.c ?? 0),
    movementsInRange: Number(mov?.c ?? 0),
  };
}

// ─── Chart: daily movement velocity over the selected window ─────────────────

export interface VelocityPoint {
  day: string;
  inbound: number;
  outbound: number;
}

export async function getMovementVelocity(
  f: AnalyticsFilter,
): Promise<VelocityPoint[]> {
  const s = scope(f);
  // Reads the pre-aggregated `movements_daily` materialised view, which already
  // holds inbound/outbound summed per (org, warehouse, day). At scale this scans
  // a handful of rows per org instead of every raw movement. The window filter
  // is on the DATE `day` column (DATE_SUB), so it still prunes — a day-grained
  // chart, which is exactly what the velocity view needs.
  return query<VelocityPoint>(
    `SELECT FORMAT_DATE('%Y-%m-%d', day) AS day,
            IFNULL(SUM(inbound), 0)  AS inbound,
            IFNULL(SUM(outbound), 0) AS outbound
     FROM ${ds()}.${MOVEMENTS_DAILY_MV}
     WHERE organisation_id = @orgId AND ${WH}
       AND day >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
     GROUP BY day
     ORDER BY day`,
    s.params,
    s.types,
  );
}

// ─── Chart: throughput by warehouse (broad / admin) ──────────────────────────

export interface ThroughputRow {
  warehouse_name: string;
  inbound: number;
  outbound: number;
  net: number;
}

export async function getWarehouseThroughput(
  f: AnalyticsFilter,
): Promise<ThroughputRow[]> {
  const s = scope(f);
  return query<ThroughputRow>(
    `SELECT warehouse_name,
            IFNULL(SUM(IF(type = 'INBOUND',  quantity, 0)), 0) AS inbound,
            IFNULL(SUM(IF(type = 'OUTBOUND', quantity, 0)), 0) AS outbound,
            IFNULL(SUM(IF(type = 'INBOUND',  quantity, 0)), 0)
              - IFNULL(SUM(IF(type = 'OUTBOUND', quantity, 0)), 0) AS net
     FROM ${ds()}.${MOVEMENTS_TABLE}
     WHERE organisation_id = @orgId AND ${WH} AND ${SINCE}
     GROUP BY warehouse_name
     ORDER BY inbound + outbound DESC`,
    s.params,
    s.types,
  );
}

// ─── Chart: capacity utilisation by warehouse (broad / admin) ────────────────

export interface CapacityRow {
  warehouse_name: string;
  capacity: number;
  units: number;
  /** units / capacity as a fraction (0–1+), or null when capacity is 0. */
  utilisation: number | null;
}

export async function getCapacityUtilisation(
  f: AnalyticsFilter,
): Promise<CapacityRow[]> {
  const s = scope(f);
  return query<CapacityRow>(
    `SELECT w.warehouse_name AS warehouse_name,
            IFNULL(w.capacity, 0) AS capacity,
            IFNULL(SUM(i.quantity), 0) AS units,
            SAFE_DIVIDE(IFNULL(SUM(i.quantity), 0), NULLIF(w.capacity, 0)) AS utilisation
     FROM ${ds()}.${WAREHOUSES_TABLE} w
     LEFT JOIN ${ds()}.${INVENTORY_TABLE} i
       ON i.warehouse_id = w.warehouse_id
      AND i.organisation_id = w.organisation_id
     WHERE w.organisation_id = @orgId
       AND (@warehouseId IS NULL OR w.warehouse_id = @warehouseId)
     GROUP BY w.warehouse_name, w.capacity
     ORDER BY units DESC`,
    s.params,
    s.types,
  );
}

// ─── Grid: stock levels with movement velocity + status ──────────────────────

export interface StockRow {
  /** Stable join key so the live-tail layer can match Postgres inventory rows. */
  item_id: string;
  sku: string;
  item_name: string;
  warehouse_name: string;
  quantity: number;
  outbound: number;
  inbound: number;
  velocity_per_week: number;
  status: "DEAD" | "LOW" | "FAST" | "OK";
}

export async function getStockLevels(f: AnalyticsFilter): Promise<StockRow[]> {
  const s = scope(f);
  // velocity_per_week normalises outbound by the window length, so "FAST"
  // (≥ 30 units/wk) and "DEAD" (no outbound) stay comparable across ranges.
  return query<StockRow>(
    `WITH recent AS (
       SELECT item_id,
              SUM(IF(type = 'OUTBOUND', quantity, 0)) AS outbound,
              SUM(IF(type = 'INBOUND',  quantity, 0)) AS inbound
       FROM ${ds()}.${MOVEMENTS_TABLE}
       WHERE organisation_id = @orgId AND ${WH} AND ${SINCE}
       GROUP BY item_id
     )
     SELECT i.item_id,
            i.sku,
            i.item_name,
            i.warehouse_name,
            i.quantity,
            IFNULL(r.outbound, 0) AS outbound,
            IFNULL(r.inbound, 0)  AS inbound,
            ROUND(IFNULL(r.outbound, 0) / (@days / 7.0), 1) AS velocity_per_week,
            CASE
              WHEN IFNULL(r.outbound, 0) = 0 THEN 'DEAD'
              WHEN i.quantity <= 20 THEN 'LOW'
              WHEN ROUND(IFNULL(r.outbound, 0) / (@days / 7.0), 1) >= 30 THEN 'FAST'
              ELSE 'OK'
            END AS status
     FROM ${ds()}.${INVENTORY_TABLE} i
     LEFT JOIN recent r ON r.item_id = i.item_id
     WHERE i.organisation_id = @orgId AND ${WH}
     ORDER BY outbound DESC, i.quantity ASC`,
    s.params,
    s.types,
  );
}

// ─── Warehouse list for the filter dropdown ──────────────────────────────────

export interface WarehouseOption {
  warehouse_id: string;
  warehouse_name: string;
}

async function loadWarehouseOptions(orgId: string): Promise<WarehouseOption[]> {
  return query<WarehouseOption>(
    `SELECT warehouse_id, warehouse_name
     FROM ${ds()}.${WAREHOUSES_TABLE}
     WHERE organisation_id = @orgId
     ORDER BY warehouse_name`,
    { orgId },
    { orgId: "STRING" },
  );
}

// ─── Derived summaries (no extra BigQuery scan) ──────────────────────────────

export interface Anomalies {
  lowStock: number;
  deadStock: number;
  fastMovers: number;
}

/**
 * Derive the anomaly summary from already-fetched stock rows, avoiding a second
 * (identical, expensive) BigQuery scan per page load.
 */
export function summariseAnomalies(rows: StockRow[]): Anomalies {
  return {
    lowStock: rows.filter((r) => r.status === "LOW").length,
    deadStock: rows.filter((r) => r.status === "DEAD").length,
    fastMovers: rows.filter((r) => r.status === "FAST").length,
  };
}

export interface StatusBreakdown {
  DEAD: number;
  LOW: number;
  FAST: number;
  OK: number;
}

export function statusBreakdown(rows: StockRow[]): StatusBreakdown {
  const b: StatusBreakdown = { DEAD: 0, LOW: 0, FAST: 0, OK: 0 };
  for (const r of rows) b[r.status]++;
  return b;
}

export interface TopMover {
  sku: string;
  item_name: string;
  outbound: number;
}

/** Top SKUs by outbound volume in the window — derived from the stock rows. */
export function topMovers(rows: StockRow[], n = 8): TopMover[] {
  return rows
    .filter((r) => r.outbound > 0)
    .sort((a, b) => b.outbound - a.outbound)
    .slice(0, n)
    .map((r) => ({ sku: r.sku, item_name: r.item_name, outbound: r.outbound }));
}

// ─── Role-aware, cached aggregate loader ─────────────────────────────────────

export interface AnalyticsData {
  kpis: Kpis;
  velocity: VelocityPoint[];
  status: StatusBreakdown;
  netUnits: number;
  /**
   * The newest movement instant this (cached) base reflects — i.e. BigQuery's
   * MAX(occurred_at) captured in the SAME cached snapshot as the data above. The
   * live-tail layer reads Postgres movements strictly after this, so base + tail
   * always meet exactly at the boundary with no gap or overlap, even when a sync
   * lands while this snapshot is still cached. Null when the mirror is empty.
   */
  syncedThrough: string | null;
  // Admin (broad)
  throughput?: ThroughputRow[];
  capacity?: CapacityRow[];
  // Manager (detailed)
  stock?: StockRow[];
  topMovers?: TopMover[];
  anomalies?: Anomalies;
}

const REVALIDATE_SECONDS = 300; // sync is a batch cron, so 5-min staleness is fine
export const analyticsTag = (orgId: string) => `analytics:${orgId}`;

const netOf = (v: VelocityPoint[]) =>
  v.reduce((acc, p) => acc + p.inbound - p.outbound, 0);

async function loadAnalytics(
  role: Role,
  f: AnalyticsFilter,
): Promise<AnalyticsData> {
  if (role === "ADMIN") {
    // Broad, top-level view: cross-warehouse throughput + capacity + portfolio
    // health. Stock rows are pulled only to derive the status breakdown.
    const [kpis, velocity, throughput, capacity, stock, syncedThrough] =
      await Promise.all([
        getKpis(f),
        getMovementVelocity(f),
        getWarehouseThroughput(f),
        getCapacityUtilisation(f),
        getStockLevels(f),
        getSyncWatermark(f),
      ]);
    return {
      kpis,
      velocity,
      throughput,
      capacity,
      // Carried (not rendered in the Admin view) so the live-tail layer has the
      // per-item windowed movements it needs to recompute the Status donut.
      stock,
      status: statusBreakdown(stock),
      netUnits: netOf(velocity),
      syncedThrough,
    };
  }

  // Manager (and any other analytics-enabled role): detailed, SKU-level view.
  const [kpis, velocity, stock, syncedThrough] = await Promise.all([
    getKpis(f),
    getMovementVelocity(f),
    getStockLevels(f),
    getSyncWatermark(f),
  ]);
  return {
    kpis,
    velocity,
    stock,
    topMovers: topMovers(stock),
    anomalies: summariseAnomalies(stock),
    status: statusBreakdown(stock),
    netUnits: netOf(velocity),
    syncedThrough,
  };
}

/**
 * Cached entry point. Keyed by (role, org, window, warehouse) so toggling a
 * filter back to a value you've already viewed is served from cache instead of
 * re-scanning BigQuery. Tagged per-org so a post-sync webhook could call
 * revalidateTag(analyticsTag(orgId)) to invalidate on demand.
 */
export function getAnalytics(
  role: Role,
  f: AnalyticsFilter,
): Promise<AnalyticsData> {
  return unstable_cache(
    () => loadAnalytics(role, f),
    ["analytics", role, f.orgId, String(f.days), f.warehouseId ?? "all"],
    { revalidate: REVALIDATE_SECONDS, tags: [analyticsTag(f.orgId)] },
  )();
}

export function getWarehouseOptions(orgId: string): Promise<WarehouseOption[]> {
  return unstable_cache(
    () => loadWarehouseOptions(orgId),
    ["analytics-warehouses", orgId],
    { revalidate: REVALIDATE_SECONDS, tags: [analyticsTag(orgId)] },
  )();
}
