/**
 * Time-range options shared between the server page (which maps a range key to
 * a day-count for the BigQuery filter) and the client filter control (which
 * renders the segmented buttons). Kept in a plain module — NOT the "use client"
 * AnalyticsFilters file — so the server can call these helpers directly.
 */

export const RANGES = [
  { key: "7d", days: 7, label: "7D" },
  { key: "30d", days: 30, label: "30D" },
  { key: "90d", days: 90, label: "90D" },
  { key: "365d", days: 365, label: "1Y" },
] as const;

export const DEFAULT_RANGE = "30d";

export function rangeKeyToDays(key?: string): number {
  return RANGES.find((r) => r.key === key)?.days ?? 30;
}

export function rangeLabel(key?: string): string {
  return RANGES.find((r) => r.key === key)?.label ?? "30D";
}
