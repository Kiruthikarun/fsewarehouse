import { HomeSkeleton } from "@/components/data/DataSkeletons";

// Fallback for the operations overview (home) while its Postgres counts resolve.
// Child routes (warehouses, inventory, …) supply their own loading.tsx, so this
// boundary only surfaces for the home page itself.
export default function AppLoading() {
  return <HomeSkeleton />;
}
