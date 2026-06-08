import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { liveTag } from "@/lib/analytics-cache";
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

  // The item dropdown needs every item, but that ~10k-row read is the same on
  // each load and only changes on an inventory write — cache it (tagged `live:`
  // so any create/edit busts it immediately). The recent-100 list stays live.
  const itemOptions = unstable_cache(
    () => inventory.list(user),
    ["movement-item-options", user.organisationId],
    { revalidate: 60, tags: [liveTag(user.organisationId)] },
  );
  const [recent, items] = await Promise.all([
    movements.list(user, { limit: 100 }),
    itemOptions(),
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
