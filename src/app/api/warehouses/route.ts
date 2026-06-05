import { NextRequest } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { warehouses } from "@/lib/repositories";

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  location: z.string().min(1).max(160),
  capacity: z.coerce.number().int().positive(),
});

export function GET() {
  return route(async () => {
    const user = await requirePermission("warehouse:read");
    return warehouses.list(user);
  });
}

export function POST(req: NextRequest) {
  return route(async () => {
    const user = await requirePermission("warehouse:create");
    const body = CreateSchema.parse(await req.json());
    return warehouses.create(user, body);
  });
}
