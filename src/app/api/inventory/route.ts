import { NextRequest } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { inventory } from "@/lib/repositories";

const CreateSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(160),
  quantity: z.coerce.number().int().min(0),
  warehouseId: z.string().min(1),
});

export function GET(req: NextRequest) {
  return route(async () => {
    const user = await requirePermission("inventory:read");
    const warehouseId =
      req.nextUrl.searchParams.get("warehouseId") ?? undefined;
    return inventory.list(user, { warehouseId });
  });
}

export function POST(req: NextRequest) {
  return route(async () => {
    const user = await requirePermission("inventory:create");
    const body = CreateSchema.parse(await req.json());
    return inventory.create(user, body);
  });
}
