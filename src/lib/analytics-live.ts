import type { Role } from "@prisma/client";
import {
  getAnalytics,
  statusBreakdown,
  summariseAnomalies,
  topMovers,
  type AnalyticsData,
  type AnalyticsFilter,
  type CapacityRow,
  type StockRow,
  type ThroughputRow,
  type VelocityPoint,
} from "@/lib/bigquery";
import {
  analytics as analyticsRepo,
  type AnalyticsSnapshot,
  type MovementTail,
} from "@/lib/repositories";
import type { AuthUser } from "@/lib/current-user";

/**
 * Live analytics = cached BigQuery base + the not-yet-synced tail from Postgres.
 *
 * BigQuery stays the engine: `getAnalytics` does all the heavy, windowed movement
 * aggregation (cached 5 min). On top of that, this layer adds the small slice
 * Postgres knows about but BigQuery hasn't ingested yet, so the dashboard reflects
 * brand-new activity immediately instead of waiting for the next sync:
 *
 *   • Movement-derived series (velocity, throughput) ← BigQuery base + tail delta,
 *     split on the sync watermark so the two are disjoint (never double-counted).
 *   • Snapshot-derived panels (KPIs, capacity, stock ledger, status donut) ← rebuilt
 *     from LIVE Postgres inventory/warehouses, joined to windowed per-item movements
 *     (BigQuery base + tail). Reading current quantities from Postgres is what makes
 *     a direct quantity edit, a new SKU, or a new warehouse appear without a sync.
 *
 * The snapshot is small, so the per-request recompute is cheap; the expensive part
 * (scanning movement history) stays in BigQuery behind the cache.
 */

const EMPTY_TAIL: MovementTail = {
  velocity: [],
  throughput: [],
  items: [],
  movementCount: 0,
};

export async function getLiveAnalytics(
  user: AuthUser,
  role: Role,
  filter: AnalyticsFilter,
): Promise<AnalyticsData> {
  // Base (cached BigQuery) and the live Postgres snapshot are independent reads.
  const [base, snapshot] = await Promise.all([
    getAnalytics(role, filter),
    analyticsRepo.snapshot(user, { warehouseId: filter.warehouseId }),
  ]);

  // The merge boundary comes from `base` itself (captured in the same cached
  // snapshot), so the tail picks up exactly where the cached base ends — no gap
  // or overlap even if a sync landed after the base was cached. On a tail read
  // error, fall back to an empty tail rather than risk double-counting; the live
  // snapshot recompute below still runs, so inventory/warehouse edits stay live.
  const tail = await analyticsRepo
    .movementTail(user, {
      days: filter.days,
      warehouseId: filter.warehouseId,
      watermark: base.syncedThrough ? new Date(base.syncedThrough) : null,
    })
    .catch(() => EMPTY_TAIL);

  return mergeLive(role, filter, base, tail, snapshot);
}

function mergeLive(
  role: Role,
  filter: AnalyticsFilter,
  base: AnalyticsData,
  tail: MovementTail,
  snapshot: AnalyticsSnapshot,
): AnalyticsData {
  const velocity = mergeVelocity(base.velocity, tail.velocity);

  // Windowed movement totals per item = synced (BigQuery base.stock, carried for
  // both roles) + unsynced tail. Keyed by item_id so it joins cleanly to the live
  // Postgres inventory regardless of renames.
  const windowByItem = new Map<string, { inbound: number; outbound: number }>();
  for (const s of base.stock ?? []) {
    windowByItem.set(s.item_id, { inbound: s.inbound, outbound: s.outbound });
  }
  for (const t of tail.items) {
    const cur = windowByItem.get(t.item_id) ?? { inbound: 0, outbound: 0 };
    cur.inbound += t.inbound;
    cur.outbound += t.outbound;
    windowByItem.set(t.item_id, cur);
  }

  // Stock ledger rebuilt from LIVE inventory: current quantity from Postgres,
  // windowed movements from BigQuery+tail. Drives status + top movers for both
  // roles (Admin renders only the status donut; Manager renders the full grid).
  const stock = rebuildStock(snapshot, windowByItem, filter.days);

  const merged: AnalyticsData = {
    kpis: {
      totalItems: snapshot.items.length,
      totalUnits: snapshot.items.reduce((a, i) => a + i.quantity, 0),
      warehouses: snapshot.warehouses.length,
      movementsInRange: base.kpis.movementsInRange + tail.movementCount,
    },
    velocity,
    status: statusBreakdown(stock),
    netUnits: velocity.reduce((a, p) => a + p.inbound - p.outbound, 0),
    syncedThrough: base.syncedThrough,
  };

  if (role === "ADMIN") {
    merged.throughput = mergeThroughput(base.throughput ?? [], tail.throughput);
    merged.capacity = rebuildCapacity(snapshot);
  } else {
    merged.stock = stock;
    merged.topMovers = topMovers(stock);
    merged.anomalies = summariseAnomalies(stock);
  }

  return merged;
}

// Sum base + tail per day; days present in either side survive, re-sorted ascending
// so a brand-new "today" point lands at the right edge like the BigQuery series.
function mergeVelocity(
  base: VelocityPoint[],
  tail: VelocityPoint[],
): VelocityPoint[] {
  const byDay = new Map<string, VelocityPoint>();
  for (const p of base) byDay.set(p.day, { ...p });
  for (const p of tail) {
    const cur = byDay.get(p.day);
    if (cur) {
      cur.inbound += p.inbound;
      cur.outbound += p.outbound;
    } else {
      byDay.set(p.day, { ...p });
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// Sum base + tail per warehouse, recompute net, re-sort by total volume like the
// BigQuery query (ORDER BY inbound + outbound DESC).
function mergeThroughput(
  base: ThroughputRow[],
  tail: { warehouse_name: string; inbound: number; outbound: number }[],
): ThroughputRow[] {
  const byWh = new Map<string, ThroughputRow>();
  for (const r of base) byWh.set(r.warehouse_name, { ...r });
  for (const r of tail) {
    const cur = byWh.get(r.warehouse_name);
    if (cur) {
      cur.inbound += r.inbound;
      cur.outbound += r.outbound;
      cur.net = cur.inbound - cur.outbound;
    } else {
      byWh.set(r.warehouse_name, { ...r, net: r.inbound - r.outbound });
    }
  }
  return [...byWh.values()].sort(
    (a, b) => b.inbound + b.outbound - (a.inbound + a.outbound),
  );
}

// Mirrors getStockLevels' status logic exactly so live and synced rows are graded
// identically. velocity_per_week normalises outbound by the window length.
function rebuildStock(
  snapshot: AnalyticsSnapshot,
  windowByItem: Map<string, { inbound: number; outbound: number }>,
  days: number,
): StockRow[] {
  const per7 = days / 7;
  const rows: StockRow[] = snapshot.items.map((it) => {
    const w = windowByItem.get(it.id) ?? { inbound: 0, outbound: 0 };
    const velocity_per_week = Math.round((w.outbound / per7) * 10) / 10;
    const status: StockRow["status"] =
      w.outbound === 0
        ? "DEAD"
        : it.quantity <= 20
          ? "LOW"
          : velocity_per_week >= 30
            ? "FAST"
            : "OK";
    return {
      item_id: it.id,
      sku: it.sku,
      item_name: it.name,
      warehouse_name: it.warehouseName,
      quantity: it.quantity,
      outbound: w.outbound,
      inbound: w.inbound,
      velocity_per_week,
      status,
    };
  });
  // Same ordering as the BigQuery query: outbound DESC, then quantity ASC.
  return rows.sort((a, b) => b.outbound - a.outbound || a.quantity - b.quantity);
}

// Per-warehouse utilisation from live inventory + warehouse capacity — so new
// warehouses and capacity edits reflect immediately. Mirrors getCapacityUtilisation
// (LEFT JOIN semantics: a warehouse with no stock still shows at 0; ORDER BY units).
function rebuildCapacity(snapshot: AnalyticsSnapshot): CapacityRow[] {
  const unitsByWh = new Map<string, number>();
  for (const it of snapshot.items) {
    unitsByWh.set(it.warehouseId, (unitsByWh.get(it.warehouseId) ?? 0) + it.quantity);
  }
  return snapshot.warehouses
    .map((w) => {
      const units = unitsByWh.get(w.id) ?? 0;
      return {
        warehouse_name: w.name,
        capacity: w.capacity,
        units,
        utilisation: w.capacity > 0 ? units / w.capacity : null,
      };
    })
    .sort((a, b) => b.units - a.units);
}
