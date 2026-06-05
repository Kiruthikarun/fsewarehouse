"use server";

import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { analyticsTag } from "@/lib/bigquery";

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
  revalidateTag(analyticsTag(user.organisationId));
}
