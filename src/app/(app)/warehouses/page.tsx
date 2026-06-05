import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { warehouses } from "@/lib/repositories";
import { WarehousesClient } from "./WarehousesClient";

export const dynamic = "force-dynamic";

export default async function WarehousesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await warehouses.list(user);

  return (
    <WarehousesClient
      rows={rows.map((w) => ({
        id: w.id,
        name: w.name,
        location: w.location,
        capacity: w.capacity,
        itemCount: w._count.items,
      }))}
      perms={{
        create: can(user, "warehouse:create"),
        update: can(user, "warehouse:update"),
        delete: can(user, "warehouse:delete"),
      }}
    />
  );
}
