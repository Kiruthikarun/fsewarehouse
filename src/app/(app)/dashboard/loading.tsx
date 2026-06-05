import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";

// Next.js renders this instantly (streamed via Suspense) while the dashboard
// server component awaits its BigQuery queries — so the user sees the layout
// materialising immediately instead of a hanging blank page.
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
