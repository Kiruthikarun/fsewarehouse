-- Raw verification queries for the StockMovement table.
-- Run against the local docker Postgres (container: t3c-warehouse-db):
--
--   docker exec -i t3c-warehouse-db psql -U warehouse -d warehouse -f - < scripts/verify-data.sql
--
-- ...or open an interactive shell and paste individual queries:
--
--   docker exec -it t3c-warehouse-db psql -U warehouse -d warehouse
--
-- Note: Prisma maps model `StockMovement` to a table of the same name, so the
-- double quotes (and capital letters) are required.

-- 1a) Inventory items: total, and demo vs scale split.
SELECT
  count(*)                                              AS total_items,
  count(*) FILTER (WHERE id LIKE 'scale-itm-%')         AS scale_items,
  count(*) FILTER (WHERE id LIKE 'itm-%')               AS demo_items
FROM "InventoryItem";

-- 1b) Movements: total, and demo vs scale split.
SELECT
  count(*)                                              AS total,
  count(*) FILTER (WHERE id LIKE 'scale-mv-%')          AS scale_rows,
  count(*) FILTER (WHERE id LIKE 'mv-%')                AS demo_rows
FROM "StockMovement";

-- 2) Breakdown by org + type, with summed quantity.
SELECT "organisationId", type, count(*) AS rows, sum(quantity) AS total_qty
FROM "StockMovement"
GROUP BY "organisationId", type
ORDER BY "organisationId", type;

-- 3) Date span of the generated data.
SELECT min("occurredAt") AS earliest, max("occurredAt") AS latest
FROM "StockMovement";

-- 4) Rows per day for the last 14 days (sanity-check the spread).
SELECT date_trunc('day', "occurredAt")::date AS day, count(*) AS rows
FROM "StockMovement"
WHERE "occurredAt" >= now() - interval '14 days'
GROUP BY day
ORDER BY day DESC;

-- 5) Eyeball a few real rows.
SELECT id, type, quantity, "organisationId", "warehouseId", "occurredAt"
FROM "StockMovement"
ORDER BY "occurredAt" DESC
LIMIT 10;

-- 6) Warehouses per org (confirm extra scale warehouses landed for ALL orgs).
SELECT "organisationId",
       count(*)                                       AS warehouses,
       count(*) FILTER (WHERE id LIKE 'scale-wh-%')   AS scale_warehouses
FROM "Warehouse"
GROUP BY "organisationId"
ORDER BY "organisationId";

-- 7) Capacity vs stock vs utilisation, straight from Postgres. After seed:scale
--    every util_pct should be <= 100 (the resize fits capacity to actual stock).
SELECT w."organisationId",
       w.name,
       w.capacity,
       COALESCE(sum(i.quantity), 0)                                AS units,
       round(100.0 * COALESCE(sum(i.quantity), 0) / NULLIF(w.capacity, 0), 1) AS util_pct
FROM "Warehouse" w
LEFT JOIN "InventoryItem" i ON i."warehouseId" = w.id
GROUP BY w.id, w."organisationId", w.name, w.capacity
ORDER BY util_pct DESC NULLS LAST;
