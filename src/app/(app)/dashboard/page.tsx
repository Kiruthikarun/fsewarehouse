import { redirect } from "next/navigation";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import { getCurrentUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import {
  getAnalytics,
  getWarehouseOptions,
  isConfigured,
  type AnalyticsFilter,
} from "@/lib/bigquery";
import { AnalyticsView } from "@/components/dashboard/DashboardView";
import { rangeKeyToDays } from "@/lib/analytics-ranges";

// Analytics is read from BigQuery at request time (with a cached data layer —
// see getAnalytics). The route's loading.tsx streams a skeleton instantly while
// the first, uncached query for a given (role, range, warehouse) resolves.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; wh?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Server-side authorization — Operators don't get analytics even if they
  // navigate here directly.
  if (!can(user, "analytics:read")) {
    return (
      <Alert severity="error" variant="outlined">
        <AlertTitle>Not authorised</AlertTitle>
        Your role does not have access to analytics. This check runs on the
        server — the page is denied, not just hidden.
      </Alert>
    );
  }

  if (!isConfigured()) {
    return (
      <Alert severity="warning" variant="outlined">
        <AlertTitle>BigQuery not configured</AlertTitle>
        Set <code>GCP_PROJECT_ID</code> and credentials, then run{" "}
        <code>npm run bq:setup</code> and <code>npm run bq:sync</code>. See the
        README → Analytics.
      </Alert>
    );
  }

  const sp = await searchParams;
  const rangeKey = sp.range ?? "30d";
  const warehouseId = sp.wh && sp.wh !== "all" ? sp.wh : null;
  const filter: AnalyticsFilter = {
    orgId: user.organisationId,
    days: rangeKeyToDays(sp.range),
    warehouseId,
  };

  try {
    // Role decides which (cached) query set runs: Admin = broad top-level
    // charts; Manager = detailed SKU-level charts + the full stock ledger.
    const [data, warehouses] = await Promise.all([
      getAnalytics(user.role, filter),
      getWarehouseOptions(user.organisationId),
    ]);

    return (
      <AnalyticsView
        role={user.role}
        orgName={user.organisationName}
        data={data}
        warehouses={warehouses}
        rangeKey={rangeKey}
        warehouseId={sp.wh ?? "all"}
      />
    );
  } catch (err) {
    return (
      <Box>
        <Alert severity="warning" variant="outlined">
          <AlertTitle>Analytics unavailable</AlertTitle>
          Couldn&apos;t read from BigQuery. Have you run{" "}
          <code>npm run bq:setup</code> then <code>npm run bq:sync</code>?
          <Box
            component="pre"
            sx={{
              mt: 1,
              p: 1,
              borderRadius: 1,
              bgcolor: "rgba(0,0,0,0.06)",
              fontSize: 12,
              overflowX: "auto",
            }}
          >
            {(err as Error).message}
          </Box>
        </Alert>
      </Box>
    );
  }
}
