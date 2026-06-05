import { NextRequest } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { inventory } from "@/lib/repositories";

const UpdateSchema = z.object({
  sku: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(160).optional(),
  quantity: z.coerce.number().int().min(0).optional(),
});

type Params = { params: Promise<{ id: string }> };

export function PATCH(req: NextRequest, { params }: Params) {
  return route(async () => {
    const user = await requirePermission("inventory:update");
    const { id } = await params;
    const body = UpdateSchema.parse(await req.json());
    return inventory.update(user, id, body);
  });
}

export function DELETE(_req: NextRequest, { params }: Params) {
  return route(async () => {
    const user = await requirePermission("inventory:delete");
    const { id } = await params;
    await inventory.remove(user, id);
    return { ok: true };
  });
}
