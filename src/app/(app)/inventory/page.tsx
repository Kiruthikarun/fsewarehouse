import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { inventory, warehouses } from "@/lib/repositories";
import { InventoryClient } from "./InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [items, whs] = await Promise.all([
    inventory.list(user),
    warehouses.list(user),
  ]);

  return (
    <InventoryClient
      rows={items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        quantity: i.quantity,
        warehouseName: i.warehouse.name,
      }))}
      warehouseOptions={whs.map((w) => ({ id: w.id, name: w.name }))}
      perms={{
        create: can(user, "inventory:create"),
        update: can(user, "inventory:update"),
        delete: can(user, "inventory:delete"),
      }}
    />
  );
}
