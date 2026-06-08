import { revalidateTag } from "next/cache";

/**
 * Cache tags for the analytics layer.
 *
 * Two distinct lifetimes, deliberately separate:
 *   - analyticsTag → the heavy, BigQuery-backed base aggregation (cached ~5 min,
 *     invalidated only by a sync or the manual Refresh button). Defined in
 *     bigquery.ts; busting it forces a full BigQuery re-scan, so writes must NOT.
 *   - liveTag      → the cheap live Postgres overlay (dashboard snapshot + the
 *     movements item-options dropdown). Cached for only a few seconds so rapid
 *     reloads are free, and busted on EVERY write so edits show immediately.
 *
 * Kept in this tiny module (no heavy imports) so route handlers can bust the live
 * caches without pulling in the BigQuery client.
 */
export const liveTag = (orgId: string) => `live:${orgId}`;

/** Invalidate an org's live overlay caches after a write so edits show at once. */
export function revalidateLive(orgId: string) {
  revalidateTag(liveTag(orgId));
}
