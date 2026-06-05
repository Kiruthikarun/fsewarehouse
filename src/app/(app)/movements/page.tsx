import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { inventory, movements } from "@/lib/repositories";
import { MovementsClient } from "./MovementsClient";

export const metadata = {
  title: "Stock Movements",
  description: "Record inbound / outbound stock and review recent movement activity.",
};

export const dynamic = "force-dynamic";

export default async function MovementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [recent, items] = await Promise.all([
    movements.list(user, { limit: 100 }),
    inventory.list(user),
  ]);

  return (
    <MovementsClient
      rows={recent.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        sku: m.item.sku,
        itemName: m.item.name,
        warehouseName: m.warehouse.name,
        operator: m.operator.name,
        occurredAt: m.occurredAt.toISOString(),
      }))}
      itemOptions={items.map((i) => ({
        id: i.id,
        label: `${i.sku} — ${i.name} (${i.warehouse.name}) · ${i.quantity} in stock`,
      }))}
      perms={{
        create: can(user, "movement:create"),
        delete: can(user, "movement:delete"),
      }}
    />
  );
}
