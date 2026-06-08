import { NextRequest } from "next/server";
import { z } from "zod";
import { MovementType } from "@prisma/client";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { revalidateLive } from "@/lib/analytics-cache";
import { movements } from "@/lib/repositories";

const CreateSchema = z.object({
  itemId: z.string().min(1),
  type: z.nativeEnum(MovementType),
  quantity: z.coerce.number().int().positive(),
});

export function GET(req: NextRequest) {
  return route(async () => {
    const user = await requirePermission("movement:read");
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    return movements.list(user, { limit: Math.min(limit, 500) });
  });
}

export function POST(req: NextRequest) {
  return route(async () => {
    const user = await requirePermission("movement:create");
    const body = CreateSchema.parse(await req.json());
    const created = await movements.create(user, body);
    revalidateLive(user.organisationId); // a movement changes stock → bust live caches
    return created;
  });
}
