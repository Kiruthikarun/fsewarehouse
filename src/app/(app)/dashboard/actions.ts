"use server";

import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { analyticsTag } from "@/lib/bigquery";
import { liveTag } from "@/lib/analytics-cache";

/**
 * Force-refresh the analytics data for the caller's org.
 *
 * The analytics queries are cached (unstable_cache, 5-min revalidate) for speed,
 * so a fresh `npm run bq:sync` isn't reflected on the dashboard until that window
 * lapses. This invalidates the per-org cache tag so the next render re-queries
 * BigQuery immediately. Tenant-scoped: only ever busts the caller's own org tag.
 */
export async function refreshAnalytics(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  // Bust both layers: the BigQuery base (so a fresh sync shows) and the live
  // overlay caches (snapshot + item options).
  revalidateTag(analyticsTag(user.organisationId));
  revalidateTag(liveTag(user.organisationId));
}
