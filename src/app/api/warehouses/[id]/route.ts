import { NextRequest } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { warehouses } from "@/lib/repositories";

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  location: z.string().min(1).max(160).optional(),
  capacity: z.coerce.number().int().positive().optional(),
});

type Params = { params: Promise<{ id: string }> };

export function PATCH(req: NextRequest, { params }: Params) {
  return route(async () => {
    const user = await requirePermission("warehouse:update");
    const { id } = await params;
    const body = UpdateSchema.parse(await req.json());
    return warehouses.update(user, id, body);
  });
}

export function DELETE(_req: NextRequest, { params }: Params) {
  return route(async () => {
    const user = await requirePermission("warehouse:delete");
    const { id } = await params;
    await warehouses.remove(user, id);
    return { ok: true };
  });
}
